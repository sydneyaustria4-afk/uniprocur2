<?php
// Saves simulated quotations using unit prices from supplier_items (MySQL).
header('Content-Type: application/json; charset=utf-8');
if (session_status() !== PHP_SESSION_ACTIVE) require_once __DIR__ . '/uniprocur-session.php';
require_once __DIR__ . '/procurement_db_connection.php';
function respond($status, $data) { http_response_code($status); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }
function unitKey($unit) {
    $u = strtolower(trim((string)$unit));
    $u = preg_replace('/[^a-z0-9]+/', '', $u);
    if (in_array($u, ['sqft','squarefeet','squarefoot'], true)) return 'sqft';
    if (in_array($u, ['meter','meters','metre','metres'], true)) return 'meter';
    if (in_array($u, ['piece','pieces','pc','pcs'], true)) return 'piece';
    return $u;
}
function nameKey($s) { return preg_replace('/[^a-z0-9]+/', '', strtolower(trim((string)$s))); }
$started = false;
try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(405, ['success'=>false, 'message'=>'POST required.']);
    $payload = json_decode(file_get_contents('php://input'), true);
    $rfqNumber = trim((string)($payload['rfq_number'] ?? ''));
    if (!$rfqNumber || strlen($rfqNumber) > 30) respond(422, ['success'=>false, 'message'=>'Invalid RFQ number.']);
    if (!empty($_SESSION['user_id'])) {
        $id = (int)$_SESSION['user_id'];
        $s = $conn->prepare('SELECT id, role, is_active FROM users WHERE id = ? LIMIT 1'); $s->bind_param('i', $id);
    } else {
        $email = (require __DIR__ . '/buyer-demo-email.php');
        $s = $conn->prepare('SELECT id, role, is_active FROM users WHERE email = ? LIMIT 1'); $s->bind_param('s', $email);
    }
    $s->execute(); $user = $s->get_result()->fetch_assoc(); $s->close();
    if (!$user || strtolower($user['role']) !== 'buyer' || !(int)$user['is_active']) respond(401, ['success'=>false,'message'=>'Buyer login required.']);
    $buyerId = (int)$user['id'];
    $conn->begin_transaction(); $started = true;
    $s = $conn->prepare("SELECT r.id, r.status, r.pr_id FROM rfqs r JOIN purchase_requisitions p ON p.id=r.pr_id WHERE r.rfq_number=? AND r.created_by=? AND p.created_by=? FOR UPDATE");
    $s->bind_param('sii', $rfqNumber, $buyerId, $buyerId); $s->execute(); $rfq=$s->get_result()->fetch_assoc(); $s->close();
    if (!$rfq) { $conn->rollback(); respond(404,['success'=>false,'message'=>'RFQ not found for this buyer.']); }
    if ($rfq['status'] === 'compared') { $conn->rollback(); respond(200,['success'=>true,'already_saved'=>true,'rfq_number'=>$rfqNumber]); }
    if ($rfq['status'] !== 'open') { $conn->rollback(); respond(409,['success'=>false,'message'=>'RFQ is not open for quotations.']); }
    $rid = (int)$rfq['id']; $pid = (int)$rfq['pr_id'];
    $s=$conn->prepare('SELECT id, item_name, unit, qty FROM pr_items WHERE pr_id=? ORDER BY id'); $s->bind_param('i',$pid); $s->execute(); $items=$s->get_result()->fetch_all(MYSQLI_ASSOC); $s->close();
    if (!$items) { $conn->rollback(); respond(422,['success'=>false,'message'=>'RFQ has no requested items.']); }
    $s=$conn->prepare('SELECT q.id quote_id, q.total_amount, s.id supplier_id, s.name FROM rfq_quotes q JOIN suppliers s ON s.id=q.supplier_id WHERE q.rfq_id=? ORDER BY q.id FOR UPDATE');
    $s->bind_param('i',$rid); $s->execute(); $quotes=$s->get_result()->fetch_all(MYSQLI_ASSOC); $s->close();
    if (!$quotes) { $conn->rollback(); respond(422,['success'=>false,'message'=>'No selected suppliers saved for this RFQ.']); }
    foreach ($quotes as $q) {
        if ($q['total_amount'] !== null) { $conn->rollback(); respond(409,['success'=>false,'message'=>'One or more supplier quotes have already been saved.']); }
    }
    // Validate ALL items/suppliers and prices before any inserts.
    $s=$conn->prepare('SELECT id, item_name, unit, unit_price FROM supplier_items WHERE supplier_id=? AND is_active=1');
    $ready=[]; $missing=[];
    foreach ($quotes as $q) {
        $sid=(int)$q['supplier_id']; $s->bind_param('i',$sid); $s->execute(); $catalog=$s->get_result()->fetch_all(MYSQLI_ASSOC);
        $lines=[];
        foreach ($items as $item) {
            $match=null;
            foreach ($catalog as $entry) {
                if (nameKey($entry['item_name']) === nameKey($item['item_name']) && unitKey($entry['unit']) === unitKey($item['unit'])) { $match=$entry; break; }
            }
            if (!$match) { $missing[]=$q['name'].': '.$item['item_name'].' ('.$item['unit'].')'; continue; }
            $qty=(float)$item['qty']; $price=(float)$match['unit_price'];
            if (!is_finite($qty) || $qty <= 0 || !is_finite($price) || $price < 0) { $missing[]=$q['name'].': invalid quantity/price for '.$item['item_name']; continue; }
            $lines[]=['supplier_item_id'=>(int)$match['id'],'name'=>$item['item_name'],'unit'=>$item['unit'],'qty'=>$qty,'price'=>$price];
        }
        $ready[]=['quote_id'=>(int)$q['quote_id'],'lines'=>$lines];
    }
    $s->close();
    if ($missing) {
        $conn->rollback(); $started=false;
        respond(422, ['success'=>false,'code'=>'MISSING_CATALOG_ITEMS','message'=>'Some supplier items are missing from MySQL. Add matching product names and units in supplier_items before saving.','missing'=>$missing]);
    }
    // subtotal is a STORED GENERATED column: do not insert it explicitly.
    $lineStmt=$conn->prepare('INSERT INTO rfq_quote_items (rfq_quote_id, supplier_item_id, item_name, unit, qty, unit_price) VALUES (?, ?, ?, ?, ?, ?)');
    $totalStmt=$conn->prepare('UPDATE rfq_quotes SET total_amount=? WHERE id=? AND rfq_id=? AND total_amount IS NULL');
    foreach ($ready as $q) {
        $total=0;
        foreach ($q['lines'] as $line) {
            $lineStmt->bind_param('iissdd',$q['quote_id'],$line['supplier_item_id'],$line['name'],$line['unit'],$line['qty'],$line['price']);
            $lineStmt->execute();
            $total += round($line['qty']*$line['price'],2);
        }
        $total=round($total,2); $totalStmt->bind_param('dii',$total,$q['quote_id'],$rid); $totalStmt->execute();
        if ($totalStmt->affected_rows !== 1) throw new RuntimeException('Quote update did not affect exactly one row.');
    }
    $lineStmt->close(); $totalStmt->close();
    $s=$conn->prepare("UPDATE rfqs SET status='compared' WHERE id=? AND status='open'"); $s->bind_param('i',$rid); $s->execute(); if($s->affected_rows!==1)throw new RuntimeException('RFQ status update failed.');$s->close();
    $conn->commit(); $started=false;
    respond(200,['success'=>true,'rfq_number'=>$rfqNumber,'supplier_count'=>count($quotes),'message'=>'Simulated quotations saved successfully.']);
} catch (Throwable $error) {
    if ($started) { try { $conn->rollback(); } catch (Throwable $ignored) {} }
    error_log('Save RFQ Quotes Error: '.$error->getMessage());
    respond(500,['success'=>false,'message'=>'Unable to save simulated quotations. Check PHP error log.']);
}

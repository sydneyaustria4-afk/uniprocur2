<?php
header('Content-Type: application/json; charset=utf-8');
if (session_status() !== PHP_SESSION_ACTIVE) require_once __DIR__ . '/uniprocur-session.php';
require_once __DIR__ . '/procurement_db_connection.php';
function reply(int $code, array $payload): void {
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
try {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') reply(405, ['success'=>false,'message'=>'GET required.']);
    $rfqNumber = trim((string)($_GET['rfq_number'] ?? ''));
    if ($rfqNumber === '' || strlen($rfqNumber) > 30) reply(422, ['success'=>false,'message'=>'Invalid RFQ number.']);
    if (!empty($_SESSION['user_id'])) {
        $userId = (int)$_SESSION['user_id'];
        $userStmt = $conn->prepare('SELECT id, role, is_active FROM users WHERE id = ? LIMIT 1');
        $userStmt->bind_param('i', $userId);
    } else {
        // Consistent with the existing UniProcur demo buyer fallback.
        $email = 'buyer@gmail.com';
        $userStmt = $conn->prepare('SELECT id, role, is_active FROM users WHERE email = ? LIMIT 1');
        $userStmt->bind_param('s', $email);
    }
    $userStmt->execute();
    $buyer = $userStmt->get_result()->fetch_assoc();
    $userStmt->close();
    if (!$buyer || strtolower((string)$buyer['role']) !== 'buyer' || !(bool)$buyer['is_active']) reply(401, ['success'=>false,'message'=>'Active buyer required.']);
    $buyerId = (int)$buyer['id'];

    $rfqStmt = $conn->prepare('SELECT r.id, r.rfq_number, r.deadline, r.status, pr.pr_number FROM rfqs r JOIN purchase_requisitions pr ON pr.id = r.pr_id WHERE r.rfq_number = ? AND r.created_by = ? AND pr.created_by = ? LIMIT 1');
    $rfqStmt->bind_param('sii', $rfqNumber, $buyerId, $buyerId);
    $rfqStmt->execute();
    $rfq = $rfqStmt->get_result()->fetch_assoc();
    $rfqStmt->close();
    if (!$rfq) reply(404, ['success'=>false,'message'=>'RFQ not found for this buyer.']);

    $itemsStmt = $conn->prepare('SELECT pi.id, pi.item_name, pi.qty, pi.unit FROM pr_items pi JOIN purchase_requisitions pr ON pr.id = pi.pr_id JOIN rfqs r ON r.pr_id = pr.id WHERE r.id = ? ORDER BY pi.id');
    $itemsStmt->bind_param('i', $rfq['id']);
    $itemsStmt->execute();
    $items = $itemsStmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $itemsStmt->close();

    $supStmt = $conn->prepare('SELECT q.id AS quote_id, q.total_amount, s.id AS supplier_id, s.name, s.lead_time_days, s.payment_terms FROM rfq_quotes q JOIN suppliers s ON s.id = q.supplier_id WHERE q.rfq_id = ? ORDER BY q.id');
    $supStmt->bind_param('i', $rfq['id']);
    $supStmt->execute();
    $suppliers = $supStmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $supStmt->close();

    // The catalog may not yet contain all of the PR products for every supplier.
    // We only prefill catalog prices for matching product names AND units.
    $catStmt = $conn->prepare('SELECT id, item_name, unit, unit_price FROM supplier_items WHERE supplier_id = ? AND is_active = 1');
    foreach ($suppliers as &$supplier) {
        $sid = (int)$supplier['supplier_id'];
        $catStmt->bind_param('i', $sid);
        $catStmt->execute();
        $catalog = $catStmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $supplier['items'] = [];
        foreach ($items as $item) {
            $matched = null;
            foreach ($catalog as $entry) {
                if (mb_strtolower(trim($entry['item_name'])) === mb_strtolower(trim($item['item_name'])) && mb_strtolower(trim($entry['unit'])) === mb_strtolower(trim($item['unit']))) {
                    $matched = $entry;
                    break;
                }
            }
            $supplier['items'][] = [
                'pr_item_id'=>(int)$item['id'],
                'item_name'=>$item['item_name'],
                'quantity'=>(float)$item['qty'],
                'unit'=>$item['unit'],
                'supplier_item_id'=>$matched ? (int)$matched['id'] : null,
                'unit_price'=>$matched ? (float)$matched['unit_price'] : null
            ];
        }
    }
    unset($supplier);
    $catStmt->close();
    reply(200, ['success'=>true,'rfq'=>$rfq,'suppliers'=>$suppliers]);
} catch (Throwable $e) {
    error_log('Get RFQ Quotation Data Error: '.$e->getMessage());
    reply(500, ['success'=>false,'message'=>'Unable to load RFQ quotations. Check PHP error log.']);
}

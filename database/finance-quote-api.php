<?php
/**
 * UniProcur Procurement <-> Finance API (quotation review only).
 * GET pending/reviewed quotations; POST a Finance decision.
 * This is NOT a Finance UI, payment API, or invoice posting endpoint.
 * Auth: per-install 256-bit secret in C:\xampp\uniprocur_secrets, outside htdocs.
 * No Buyer/Manager session fallback; never accept decisions from browser sessions.
 */
declare(strict_types=1);
require_once __DIR__ . '/procurement_db_connection.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');

function finJson(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
function finAuth(): void {
    $file = getenv('UNIPROCUR_FINANCE_TOKEN_FILE') ?: dirname(__DIR__, 3) . '/uniprocur_secrets/finance_integration_token.txt';
    $expected = is_file($file) ? trim((string)@file_get_contents($file)) : '';
    if (!preg_match('/\A[a-fA-F0-9]{64}\z/D', $expected)) {
        finJson(503, ['success'=>false,'message'=>'Finance integration token is not configured on the Procurement server.']);
    }
    // A custom header is reliable with XAMPP/Apache configurations that strip Authorization.
    $provided = trim((string)($_SERVER['HTTP_X_FINANCE_INTEGRATION_KEY'] ?? ''));
    if (!preg_match('/\A[a-fA-F0-9]{64}\z/D', $provided) ||
        !hash_equals(strtolower($expected), strtolower($provided))) {
        header('WWW-Authenticate: FinanceIntegration');
        finJson(401, ['success'=>false,'message'=>'Valid Finance integration key required.']);
    }
}
function finCheckNumber(mixed $raw): string {
    if (!is_string($raw)) finJson(422, ['success'=>false,'message'=>'Valid RFQ number required.']);
    $number = trim($raw);
    if (strlen($number) < 3 || strlen($number) > 30 || !preg_match('/\A[A-Za-z0-9-]+\z/D', $number)) {
        finJson(422, ['success'=>false,'message'=>'Invalid RFQ number format.']);
    }
    return $number;
}
function finPrepared(mysqli $db, string $sql, string $types = '', array $args = []): mysqli_result {
    $stmt = $db->prepare($sql);
    if (!$stmt) throw new RuntimeException('Finance SQL prepare failed.');
    if ($types !== '') $stmt->bind_param($types, ...$args);
    $stmt->execute();
    $result = $stmt->get_result();
    $stmt->close();
    if (!$result) throw new RuntimeException('Finance SQL did not yield a result.');
    return $result;
}

$started = false;
try {
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    if (!in_array($method, ['GET','POST'], true)) {
        header('Allow: GET, POST');
        finJson(405, ['success'=>false,'message'=>'GET or POST required.']);
    }
    finAuth();

    if ($method === 'GET') {
        $status = (string)($_GET['status'] ?? 'pending');
        if (!in_array($status, ['pending','approved','rejected','all'], true)) {
            finJson(422, ['success'=>false,'message'=>'status must be pending, approved, rejected, or all.']);
        }
        $number = isset($_GET['rfq_number']) ? finCheckNumber($_GET['rfq_number']) : '';
        $sql = 'SELECT f.id AS finance_request_id, f.rfq_id, f.quote_id, f.buyer_id,
                    f.request_version, f.review_status, f.submitted_at, f.reviewed_at,
                    f.reviewer_ref, f.decision_reference, f.review_note,
                    f.submitted_quote_total, r.rfq_number, r.status AS rfq_status,
                    p.pr_number, s.id AS supplier_id, s.name AS supplier_name,
                    q.total_amount AS current_quote_total, r.deadline, r.warehouse_value
                FROM procurement_finance_quotes f
                JOIN rfqs r ON r.id=f.rfq_id
                JOIN purchase_requisitions p ON p.id=r.pr_id
                JOIN rfq_quotes q ON q.id=f.quote_id AND q.rfq_id=f.rfq_id
                JOIN suppliers s ON s.id=q.supplier_id
                WHERE (? = \'all\' OR f.review_status = ?)
                  AND (? = \'\' OR r.rfq_number = ?)
                ORDER BY f.submitted_at DESC, f.id DESC LIMIT 50';
        $rows = finPrepared($conn, $sql, 'ssss', [$status,$status,$number,$number])->fetch_all(MYSQLI_ASSOC);
        foreach ($rows as &$row) {
            $qid = (int)$row['quote_id'];
            $items = finPrepared($conn,
                'SELECT item_name, unit, qty, unit_price, subtotal FROM rfq_quote_items WHERE rfq_quote_id=? ORDER BY id',
                'i',[$qid])->fetch_all(MYSQLI_ASSOC);
            $row['quote_items'] = $items;
            $row['finance_request_id'] = (int)$row['finance_request_id'];
            $row['quote_id'] = $qid;
            $row['request_version'] = (int)$row['request_version'];
            $row['read_only'] = true;
        }
        unset($row);
        finJson(200, [
            'success'=>true,'finance_requests'=>$rows,'count'=>count($rows),
            'max_results'=>50,'read_only'=>true,
            'note'=>'Quotations originate from Procurement. Supplier offers may be classroom simulated; Finance review is a separately recorded decision.'
        ]);
    }

    if (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) {
        finJson(415, ['success'=>false,'message'=>'JSON body required.']);
    }
    $body = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($body) || json_last_error() !== JSON_ERROR_NONE) {
        finJson(400, ['success'=>false,'message'=>'Invalid JSON body.']);
    }
    $number = finCheckNumber($body['rfq_number'] ?? null);
    $quoteId = filter_var($body['quote_id'] ?? null, FILTER_VALIDATE_INT);
    $version = filter_var($body['request_version'] ?? null, FILTER_VALIDATE_INT);
    $decision = $body['decision'] ?? null;
    $reviewer = $body['reviewer_ref'] ?? null;
    $reference = $body['decision_reference'] ?? null;
    $note = $body['note'] ?? '';
    if (!$quoteId || $quoteId < 1 || !$version || $version < 1 ||
        !is_string($decision) || !in_array($decision, ['approved','rejected'], true) ||
        !is_string($reviewer) || !preg_match('/\A[A-Za-z0-9._@:-]{3,100}\z/D', $reviewer) ||
        !is_string($reference) || !preg_match('/\A[A-Za-z0-9._:-]{6,100}\z/D', $reference) ||
        !is_string($note) || strlen($note) > 500 ||
        ($decision === 'rejected' && trim($note) === '')) {
        finJson(422, ['success'=>false,'message'=>'Valid quote_id, request_version, decision, reviewer_ref, unique decision_reference and rejection note are required.']);
    }

    $conn->begin_transaction(); $started = true;
    // Same RFQ -> finance request lock order as Buyer submit endpoint.
    $r = finPrepared($conn,'SELECT id, status FROM rfqs WHERE rfq_number=? LIMIT 1 FOR UPDATE', 's',[$number])->fetch_assoc();
    if (!$r) { $conn->rollback();$started=false;finJson(404,['success'=>false,'message'=>'RFQ not found.']); }
    $rfqId = (int)$r['id'];
    $f = finPrepared($conn,'SELECT id,quote_id,review_status,request_version,
            submitted_quote_total,decision_reference FROM procurement_finance_quotes
            WHERE rfq_id=? LIMIT 1 FOR UPDATE','i',[$rfqId])->fetch_assoc();
    if (!$f) { $conn->rollback();$started=false;finJson(404,['success'=>false,'message'=>'Finance submission not found.']); }
    if ((int)$f['request_version'] !== $version || (int)$f['quote_id'] !== $quoteId) {
        $conn->rollback();$started=false;
        finJson(409,['success'=>false,'message'=>'Stale Finance decision. Reload current RFQ, quote_id and request_version.']);
    }
    if ($f['review_status'] !== 'pending') {
        if ($f['review_status'] === $decision && $f['decision_reference'] === $reference) {
            $conn->rollback();$started=false;
            finJson(200,['success'=>true,'idempotent'=>true,'rfq_number'=>$number,'decision'=>$decision,'request_version'=>$version]);
        }
        $conn->rollback();$started=false;
        finJson(409,['success'=>false,'message'=>'Finance request already decided; conflicting callback refused.']);
    }
    if (strtolower((string)$r['status']) !== 'compared') {
        $conn->rollback();$started=false;
        finJson(409,['success'=>false,'message'=>'Only a compared RFQ can receive a Finance decision.']);
    }
    $q = finPrepared($conn,'SELECT total_amount FROM rfq_quotes WHERE id=? AND rfq_id=? FOR UPDATE','ii',[$quoteId,$rfqId])->fetch_assoc();
    if (!$q || $q['total_amount'] === null || $f['submitted_quote_total'] === null ||
        abs((float)$q['total_amount']-(float)$f['submitted_quote_total'])>0.01) {
        $conn->rollback();$started=false;
        finJson(409,['success'=>false,'message'=>'Supplier quotation total changed since Finance submission. Resubmit for Finance review.']);
    }
    $totals = finPrepared($conn,'SELECT COUNT(*) AS count_lines, COALESCE(SUM(subtotal),0) AS amount
         FROM rfq_quote_items WHERE rfq_quote_id=?','i',[$quoteId])->fetch_assoc();
    $prCount = finPrepared($conn,'SELECT COUNT(*) AS expected_lines FROM pr_items pi JOIN rfqs r ON pi.pr_id=r.pr_id WHERE r.id=?','i',[$rfqId])->fetch_assoc();
    if ((int)$totals['count_lines'] < 1 || (int)$totals['count_lines'] !== (int)$prCount['expected_lines'] ||
        abs((float)$totals['amount']-(float)$q['total_amount'])>0.01) {
        $conn->rollback();$started=false;
        finJson(409,['success'=>false,'message'=>'Quotation lines are inconsistent; Finance decision refused.']);
    }
    // Remote Finance users have no Procurement users.id, so reviewed_by stays NULL.
    $stmt=$conn->prepare('UPDATE procurement_finance_quotes
           SET review_status=?,reviewed_at=NOW(),review_note=?,reviewer_ref=?,
               decision_reference=?, reviewed_by=NULL
           WHERE id=? AND request_version=? AND review_status=\'pending\'');
    $requestId=(int)$f['id'];
    $stmt->bind_param('ssssii',$decision,$note,$reviewer,$reference,$requestId,$version);
    $stmt->execute();$affected=$stmt->affected_rows;$stmt->close();
    if ($affected !== 1) throw new RuntimeException('Finance decision state changed.');
    $stmt=$conn->prepare('INSERT INTO procurement_finance_quote_decisions
        (finance_request_id,request_version,rfq_id,quote_id,decision,decision_reference,reviewer_ref,note)
        VALUES(?,?,?,?,?,?,?,?)');
    $stmt->bind_param('iiiissss',$requestId,$version,$rfqId,$quoteId,$decision,$reference,$reviewer,$note);
    $stmt->execute();$stmt->close();
    $conn->commit();$started=false;
    finJson(200,['success'=>true,'rfq_number'=>$number,'quote_id'=>$quoteId,
        'request_version'=>$version,'decision'=>$decision,
        'next_step'=>$decision==='approved'?'Buyer may now confirm supplier award, then create a PO for Manager approval.':'Buyer may select a quotation and submit a new request version.',
        'purchase_order_created'=>false]);
} catch (Throwable $e) {
    if ($started) { try {$conn->rollback();}catch(Throwable $ignored){} }
    error_log('Finance quotation handoff: '.$e->getMessage());
    finJson(500,['success'=>false,'message'=>'Finance handoff failed. Check Procurement PHP/MySQL logs and migration.']);
}

<?php
// UniProcur - Buyer submits an existing draft PO for Manager approval.
// Does not approve or issue a purchase order; only updates its workflow status.
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');

if (session_status() !== PHP_SESSION_ACTIVE) {
    require_once __DIR__ . '/uniprocur-session.php';
}
require_once __DIR__ . '/procurement_db_connection.php';

function poSubmitReply(int $httpCode, array $payload): void {
    http_response_code($httpCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$transactionStarted = false;
try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        poSubmitReply(405, ['success' => false, 'message' => 'POST required.']);
    }
    if (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) {
        poSubmitReply(415, ['success' => false, 'message' => 'JSON request required.']);
    }
    $input = json_decode(file_get_contents('php://input'), true);
    if (!is_array($input)) {
        poSubmitReply(400, ['success' => false, 'message' => 'Invalid JSON request.']);
    }
    $poNumber = trim((string)($input['po_number'] ?? ''));
    $notes = trim((string)($input['notes'] ?? ''));
    if ($poNumber === '' || strlen($poNumber) > 30) {
        poSubmitReply(422, ['success' => false, 'message' => 'Valid PO number required.']);
    }
    if (strlen($notes) > 2000) {
        poSubmitReply(422, ['success' => false, 'message' => 'Notes are too long (maximum 2000 bytes).']);
    }

    // Keep consistent with current buyer APIs. Fallback works only in the local demo.
    if (!empty($_SESSION['user_id'])) {
        $userId = (int)$_SESSION['user_id'];
        $stmt = $conn->prepare('SELECT id, role, is_active FROM users WHERE id = ? LIMIT 1');
        $stmt->bind_param('i', $userId);
    } else {
        $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
        $remoteIp = (string)($_SERVER['REMOTE_ADDR'] ?? '');
        if (!preg_match('/\A(localhost|127\.0\.0\.1)(:\d+)?\z/', $host) ||
            !in_array($remoteIp, ['::1', '127.0.0.1'], true)) {
            poSubmitReply(401, ['success' => false, 'message' => 'Buyer login required.']);
        }
        $email = (require __DIR__ . '/buyer-demo-email.php');
        $stmt = $conn->prepare('SELECT id, role, is_active FROM users WHERE email = ? LIMIT 1');
        $stmt->bind_param('s', $email);
    }
    $stmt->execute();
    $buyer = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$buyer || strtolower((string)$buyer['role']) !== 'buyer' || !(int)$buyer['is_active']) {
        poSubmitReply(401, ['success' => false, 'message' => 'Active Buyer account required.']);
    }
    $buyerId = (int)$buyer['id'];

    $conn->begin_transaction();
    $transactionStarted = true;

    // Verify PO ownership and awarded RFQ, with a row lock for duplicate-click safety.
    $stmt = $conn->prepare(
        "SELECT po.id, po.po_number, po.status, po.total_amount,
                po.expected_delivery, po.delivery_address,
                r.status AS rfq_status, q.is_winner, q.total_amount AS quote_total
         FROM purchase_orders po
         JOIN rfqs r ON r.id = po.rfq_id
         JOIN purchase_requisitions pr ON pr.id = r.pr_id
         JOIN rfq_quotes q ON q.id = po.rfq_quote_id AND q.rfq_id = r.id
         WHERE po.po_number = ? AND po.created_by = ?
           AND r.created_by = ? AND pr.created_by = ?
         LIMIT 1 FOR UPDATE"
    );
    $stmt->bind_param('siii', $poNumber, $buyerId, $buyerId, $buyerId);
    $stmt->execute();
    $po = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$po) {
        $conn->rollback(); $transactionStarted = false;
        poSubmitReply(404, ['success' => false, 'message' => 'Purchase Order not found for this buyer.']);
    }
    if ($po['status'] === 'pending_approval') {
        $conn->rollback(); $transactionStarted = false;
        poSubmitReply(200, ['success' => true, 'already_submitted' => true,
            'po_number' => $poNumber, 'status' => 'pending_approval',
            'message' => 'This Purchase Order is already pending Manager approval.']);
    }
    if ($po['status'] !== 'draft') {
        $conn->rollback(); $transactionStarted = false;
        poSubmitReply(409, ['success' => false, 'message' => 'Only draft Purchase Orders can be submitted.']);
    }
    if ($po['rfq_status'] !== 'awarded' || (int)$po['is_winner'] !== 1 ||
        $po['quote_total'] === null || abs((float)$po['quote_total'] - (float)$po['total_amount']) > 0.01) {
        $conn->rollback(); $transactionStarted = false;
        poSubmitReply(409, ['success' => false, 'message' => 'Awarded RFQ or PO totals are inconsistent.']);
    }
    if (empty($po['expected_delivery']) || trim((string)$po['delivery_address']) === '') {
        $conn->rollback(); $transactionStarted = false;
        poSubmitReply(422, ['success' => false, 'message' => 'Delivery information is missing.']);
    }

    $poId = (int)$po['id'];
    $stmt = $conn->prepare('SELECT COUNT(*) AS item_count FROM po_items WHERE po_id = ?');
    $stmt->bind_param('i', $poId);
    $stmt->execute();
    $count = (int)$stmt->get_result()->fetch_assoc()['item_count'];
    $stmt->close();
    if ($count < 1) {
        $conn->rollback(); $transactionStarted = false;
        poSubmitReply(422, ['success' => false, 'message' => 'This Purchase Order has no items.']);
    }

    $stmt = $conn->prepare(
        "UPDATE purchase_orders SET status = 'pending_approval', notes_to_supplier = ? " .
        "WHERE id = ? AND created_by = ? AND status = 'draft'"
    );
    $stmt->bind_param('sii', $notes, $poId, $buyerId);
    $stmt->execute();
    $changed = $stmt->affected_rows;
    $stmt->close();
    if ($changed !== 1) {
        throw new RuntimeException('PO update failed.');
    }
    // UNIPROCUR_PO_SUBMISSION_NOTIFICATION_V1
    // Store this event in the SAME transaction as the draft -> pending transition.
    $notify = $conn->prepare(
        "INSERT INTO procurement_po_notification_events
         (po_id,po_number,buyer_id,event_type,origin,recorded_at)
         VALUES (?,?,?,'submitted','workflow',NOW())"
    );
    $notify->bind_param('isi',$poId,$poNumber,$buyerId);
    $notify->execute();
    $notify->close();
    $conn->commit();
    $transactionStarted = false;

    poSubmitReply(200, [
        'success' => true,
        'po_number' => $poNumber,
        'status' => 'pending_approval',
        'message' => "{$poNumber} submitted for Manager approval."
    ]);
} catch (Throwable $error) {
    if ($transactionStarted) {
        try { $conn->rollback(); } catch (Throwable $ignored) {}
    }
    error_log('Submit PO for Approval Error: ' . $error->getMessage());
    poSubmitReply(500, ['success' => false,
        'message' => 'Unable to submit PO. Check the PHP error log and status constraint.']);
}

<?php
/** UniProcur — Manager approves / rejects a submitted Purchase Order. */
require_once __DIR__ . '/procurement_db_connection.php';
require_once __DIR__ . '/manager-api-common.php';

header('Cache-Control: no-store, max-age=0');
$started = false;

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        managerSendJson(405, ['success' => false, 'message' => 'POST required.']);
    }
    if (stripos((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) {
        managerSendJson(415, ['success' => false, 'message' => 'JSON content required.']);
    }

    $manager = requireActiveManager($conn);
    $sessionToken = (string) ($_SESSION['manager_csrf_token'] ?? '');
    $sentToken = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($sessionToken === '' || $sentToken === '' || !hash_equals($sessionToken, $sentToken)) {
        managerSendJson(419, [
            'success' => false,
            'message' => 'Session verification expired. Refresh the PO page.'
        ]);
    }

    $input = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($input) || json_last_error() !== JSON_ERROR_NONE) {
        managerSendJson(400, ['success' => false, 'message' => 'Invalid JSON request.']);
    }
    $number = trim((string) ($input['po_number'] ?? ''));
    $decision = strtolower(trim((string) ($input['decision'] ?? '')));
    if ($number === '' || strlen($number) > 30 || !preg_match('/\APO-[A-Za-z0-9-]+\z/', $number)) {
        managerSendJson(422, ['success' => false, 'message' => 'Valid PO number required.']);
    }
    if (!in_array($decision, ['approve', 'reject'], true)) {
        managerSendJson(422, ['success' => false, 'message' => 'Choose Approve or Reject.']);
    }

    $managerId = (int) $manager['id'];
    $conn->begin_transaction();
    $started = true;
    $stmt = $conn->prepare(
        'SELECT id, created_by, status FROM purchase_orders WHERE po_number = ? LIMIT 1 FOR UPDATE'
    );
    $stmt->bind_param('s', $number);
    $stmt->execute();
    $existing = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$existing) {
        $conn->rollback(); $started = false;
        managerSendJson(404, ['success' => false, 'message' => 'PO not found.']);
    }
    if ((int) $existing['created_by'] === $managerId) {
        $conn->rollback(); $started = false;
        managerSendJson(403, ['success' => false, 'message' => 'You cannot approve your own PO.']);
    }
    if (strtolower((string) $existing['status']) !== 'pending_approval') {
        $conn->rollback(); $started = false;
        managerSendJson(409, [
            'success' => false,
            'message' => 'Only a PO pending Manager approval can be approved or rejected.'
        ]);
    }

    $newStatus = $decision === 'approve' ? 'approved' : 'rejected';
    $poId = (int) $existing['id'];
    $update = $conn->prepare(
        "UPDATE purchase_orders SET status = ? WHERE id = ? AND status = 'pending_approval'"
    );
    $update->bind_param('si', $newStatus, $poId);
    $update->execute();
    $changed = $update->affected_rows;
    $update->close();
    if ($changed !== 1) {
        throw new RuntimeException('PO decision update did not change a row.');
    }

    // Record the real Manager confirmation time for the local tracking demo.
    // Kept in the same transaction as the PO approval to prevent partial writes.
    if ($newStatus === 'approved') {
        $trackStmt = $conn->prepare(
            "INSERT INTO po_demo_tracking (po_id, issued_at, confirmed_at)
             SELECT id, created_at, NOW()
               FROM purchase_orders WHERE id = ?
             ON DUPLICATE KEY UPDATE confirmed_at = VALUES(confirmed_at)"
        );
        $trackStmt->bind_param('i', $poId);
        $trackStmt->execute();
        $trackStmt->close();
    }

    $conn->commit();
    $started = false;
    managerSendJson(200, [
        'success' => true,
        'po_number' => $number,
        'status' => $newStatus,
        'message' => $newStatus === 'approved'
            ? "{$number} approved successfully."
            : "{$number} rejected successfully."
    ]);
} catch (Throwable $error) {
    if ($started) {
        try { $conn->rollback(); } catch (Throwable $ignored) { }
    }
    error_log('Manager PO Decision Error: ' . $error->getMessage());
    managerSendJson(500, [
        'success' => false,
        'message' => 'Unable to save the PO decision. Check the status CHECK constraint, po_demo_tracking migration, and PHP log.'
    ]);
}

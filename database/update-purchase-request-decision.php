<?php
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/procurement_db_connection.php';
require_once __DIR__ . '/manager-api-common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    managerSendJson(405, ['success' => false, 'message' => 'Use POST to record a Manager decision.']);
}

$transactionStarted = false;

try {
    $manager = requireActiveManager($conn);
    $managerId = (int) $manager['id'];

    $sessionToken = (string) ($_SESSION['manager_csrf_token'] ?? '');
    $providedToken = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($sessionToken === '' || $providedToken === '' || !hash_equals($sessionToken, $providedToken)) {
        managerSendJson(419, ['success' => false, 'message' => 'Your session verification expired. Reload the Purchase Request page and try again.']);
    }

    $rawBody = file_get_contents('php://input');
    $input = json_decode($rawBody ?: '', true);
    if (!is_array($input) || json_last_error() !== JSON_ERROR_NONE) {
        managerSendJson(400, ['success' => false, 'message' => 'The decision details are not valid JSON.']);
    }

    $requestId = filter_var($input['request_id'] ?? null, FILTER_VALIDATE_INT);
    $decision = strtolower(trim((string) ($input['decision'] ?? '')));
    $remarks = trim((string) ($input['remarks'] ?? ''));
    $remarks = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $remarks) ?? '';

    if (!$requestId || $requestId < 1) {
        managerSendJson(400, ['success' => false, 'message' => 'A valid Purchase Request ID is required.']);
    }
    if (!in_array($decision, ['approve', 'reject'], true)) {
        managerSendJson(400, ['success' => false, 'message' => 'Choose either approve or reject.']);
    }
    if (strlen($remarks) > 5000) {
        managerSendJson(422, ['success' => false, 'message' => 'Remarks must not exceed 5,000 characters.']);
    }
    $conn->begin_transaction();
    $transactionStarted = true;

    $lockStmt = $conn->prepare(
        "SELECT id, created_by, status FROM purchase_requisitions WHERE id = ? LIMIT 1 FOR UPDATE"
    );
    $lockStmt->bind_param('i', $requestId);
    $lockStmt->execute();
    $existing = $lockStmt->get_result()->fetch_assoc();
    $lockStmt->close();

    if (!$existing) {
        $conn->rollback();
        $transactionStarted = false;
        managerSendJson(404, ['success' => false, 'message' => 'Purchase Request not found.']);
    }
    if ((int) $existing['created_by'] === $managerId) {
        $conn->rollback();
        $transactionStarted = false;
        managerSendJson(403, ['success' => false, 'message' => 'A Manager cannot approve or reject their own Purchase Request.']);
    }
    if (!in_array(strtolower((string) $existing['status']), ['submitted', 'pending'], true)) {
        $conn->rollback();
        $transactionStarted = false;
        managerSendJson(409, ['success' => false, 'message' => 'This Purchase Request has already been decided or is not submitted for approval.']);
    }

    $newStatus = $decision === 'approve' ? 'approved' : 'rejected';
    $rejectionReason = $decision === 'reject' ? $remarks : null;
    $managerRemarks = $remarks !== '' ? $remarks : null;

    $updateStmt = $conn->prepare(
        "UPDATE purchase_requisitions
         SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP,
             rejection_reason = ?, manager_remarks = ?
         WHERE id = ?"
    );
    $updateStmt->bind_param('sissi', $newStatus, $managerId, $rejectionReason, $managerRemarks, $requestId);
    $updateStmt->execute();
    $updateStmt->close();

    $conn->commit();
    $transactionStarted = false;

    managerSendJson(200, [
        'success' => true,
        'message' => $decision === 'approve' ? 'Purchase Request approved successfully.' : 'Purchase Request rejected successfully.',
        'request_id' => (int) $requestId,
        'status' => $newStatus,
        'decided_by' => $manager['full_name']
    ]);
} catch (Throwable $error) {
    if ($transactionStarted) {
        try { $conn->rollback(); } catch (Throwable $rollbackError) {
            error_log('Manager PR decision rollback error: ' . $rollbackError->getMessage());
        }
    }
    error_log('Update Purchase Request Decision Error: ' . $error->getMessage());
    managerSendJson(500, ['success' => false, 'message' => 'Unable to record the Manager decision. Confirm that the manager_remarks migration has been applied and check the PHP error log.']);
}

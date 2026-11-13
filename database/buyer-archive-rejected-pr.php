<?php
/**
 * Soft-delete rejected Buyer PRs by writing an audited archival event.
 * Original PR, items, rejection history and numbers remain intact.
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
if (session_status() !== PHP_SESSION_ACTIVE) {
    require_once __DIR__ . '/uniprocur-session.php';
}
require_once __DIR__ . '/procurement_db_connection.php';
require_once __DIR__ . '/procurement-audit-log.php';

const PR_ARCHIVE_EVENT = 'PR Archived';

function archiveReply(int $status, array $data): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function archiveBuyer(mysqli $conn): array {
    if (!empty($_SESSION['user_id'])) {
        $id = (int) $_SESSION['user_id'];
        $stmt = $conn->prepare('SELECT id,full_name,email,role,is_active FROM users WHERE id=? LIMIT 1');
        $stmt->bind_param('i', $id);
    } else {
        // Matches the existing localhost Buyer prototype. Never use a remote fallback.
        $remote = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
        $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
        if (!in_array($remote, ['127.0.0.1', '::1'], true) ||
            !preg_match('/\A(?:localhost|127\.0\.0\.1)(?::\d+)?\z/D', $host)) {
            archiveReply(401, ['success' => false, 'message' => 'Buyer sign-in required.']);
        }
        $email = (require __DIR__ . '/buyer-demo-email.php');
        $stmt = $conn->prepare('SELECT id,full_name,email,role,is_active FROM users WHERE email=? LIMIT 1');
        $stmt->bind_param('s', $email);
    }
    $stmt->execute();
    $buyer = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$buyer || strtolower((string) $buyer['role']) !== 'buyer' || !(bool) $buyer['is_active']) {
        archiveReply(403, ['success' => false, 'message' => 'Active Buyer account required.']);
    }
    return $buyer;
}

function prIsArchived(mysqli $conn, string $number): bool {
    $stmt = $conn->prepare('SELECT id FROM procurement_audit_logs WHERE action_name=? AND reference_number=? LIMIT 1');
    $event = PR_ARCHIVE_EVENT;
    $stmt->bind_param('ss', $event, $number);
    $stmt->execute();
    $found = $stmt->get_result()->num_rows > 0;
    $stmt->close();
    return $found;
}

$transaction = false;
try {
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? ''));
    if (!in_array($method, ['GET', 'POST'], true)) {
        archiveReply(405, ['success' => false, 'message' => 'Use GET or POST.']);
    }
    $buyer = archiveBuyer($conn);
    $buyerId = (int) $buyer['id'];
    $data = [];
    if ($method === 'POST') {
        if (stripos((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) {
            archiveReply(415, ['success' => false, 'message' => 'JSON required.']);
        }
        $data = json_decode(file_get_contents('php://input') ?: '', true);
        if (!is_array($data)) archiveReply(400, ['success' => false, 'message' => 'Invalid JSON.']);
        $token = (string) ($data['csrf_token'] ?? '');
        $session = (string) ($_SESSION['buyer_pr_archive_csrf'] ?? '');
        if ($token === '' || $session === '' || !hash_equals($session, $token)) {
            archiveReply(419, ['success' => false, 'message' => 'Verification expired. Reload the PR page.']);
        }
        if (($data['action'] ?? '') !== 'archive') {
            archiveReply(422, ['success' => false, 'message' => 'Unsupported action.']);
        }
        if (($data['confirm'] ?? false) !== true) {
            archiveReply(422, ['success' => false, 'message' => 'Confirm deletion of this rejected PR.']);
        }
    }
    $number = trim((string) ($method === 'POST' ? ($data['pr_number'] ?? '') : ($_GET['pr_number'] ?? '')));
    if (!preg_match('/\APR-[A-Za-z0-9-]{3,70}\z/D', $number)) {
        archiveReply(400, ['success' => false, 'message' => 'Valid Purchase Request number required.']);
    }
    if ($method === 'POST') {
        $conn->begin_transaction();
        $transaction = true;
        $stmt = $conn->prepare('SELECT id,status FROM purchase_requisitions WHERE pr_number=? AND created_by=? LIMIT 1 FOR UPDATE');
    } else {
        $stmt = $conn->prepare('SELECT id,status FROM purchase_requisitions WHERE pr_number=? AND created_by=? LIMIT 1');
    }
    $stmt->bind_param('si', $number, $buyerId);
    $stmt->execute();
    $pr = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$pr) {
        if ($transaction) $conn->rollback();
        archiveReply(404, ['success' => false, 'message' => 'Purchase Request not found for this Buyer.']);
    }
    if (prIsArchived($conn, $number)) {
        if ($transaction) $conn->rollback();
        archiveReply(409, ['success' => false, 'message' => 'This PR has already been removed from active lists.']);
    }
    if (strtolower((string) $pr['status']) !== 'rejected') {
        if ($transaction) $conn->rollback();
        archiveReply(409, ['success' => false, 'message' => 'Only rejected PRs can be deleted from active lists.']);
    }
    $prId = (int) $pr['id'];
    // Never hide a request that has already entered a downstream procurement flow.
    $stmt = $conn->prepare('SELECT id FROM rfqs WHERE pr_id=? LIMIT 1');
    $stmt->bind_param('i', $prId);
    $stmt->execute();
    $hasRfqs = $stmt->get_result()->num_rows > 0;
    $stmt->close();
    if ($hasRfqs) {
        if ($transaction) $conn->rollback();
        archiveReply(409, ['success' => false, 'message' => 'This PR has linked RFQs and cannot be deleted.']);
    }
    if ($method === 'GET') {
        if (empty($_SESSION['buyer_pr_archive_csrf'])) {
            $_SESSION['buyer_pr_archive_csrf'] = bin2hex(random_bytes(32));
        }
        archiveReply(200, ['success' => true, 'pr_number' => $number, 'eligible' => true,
            'csrf_token' => (string) $_SESSION['buyer_pr_archive_csrf']]);
    }
    procurementAuditLog($conn, $buyer, 'Purchase Request', PR_ARCHIVE_EVENT, $number,
        'Buyer removed rejected PR from active lists (soft delete). Original PR, items and Manager decisions retained for audit.');
    $conn->commit();
    $transaction = false;
    archiveReply(200, ['success' => true, 'pr_number' => $number, 'archived' => true,
        'message' => 'Rejected Purchase Request removed from active lists. Audit history preserved.']);
} catch (Throwable $error) {
    if ($transaction) {
        try { $conn->rollback(); } catch (Throwable $ignored) {}
    }
    error_log('Buyer rejected PR archive error: ' . $error->getMessage());
    archiveReply(500, ['success' => false, 'message' => 'Unable to delete rejected PR. Check procurement_audit_logs and PHP error log. No changes were saved.']);
}

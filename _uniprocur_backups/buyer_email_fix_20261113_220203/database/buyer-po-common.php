<?php
/** Shared authorization for new Buyer PO read-only APIs. */
require_once __DIR__ . '/procurement_db_connection.php';
if (session_status() !== PHP_SESSION_ACTIVE) require_once __DIR__ . '/uniprocur-session.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');

function buyerPoJson(int $code, array $data): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
function buyerPoIdentity(mysqli $conn): array {
    if (!empty($_SESSION['user_id'])) {
        $id = (int) $_SESSION['user_id'];
        $stmt = $conn->prepare('SELECT id, full_name, email, role, is_active FROM users WHERE id = ? LIMIT 1');
        $stmt->bind_param('i', $id);
    } else {
        // Local XAMPP demo only. No unauthenticated fallback on public hosts.
        $host = strtolower(trim((string) ($_SERVER['HTTP_HOST'] ?? '')));
        $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
        if (!preg_match('/\A(localhost|127\.0\.0\.1)(:\d+)?\z/', $host) || !in_array($ip, ['127.0.0.1', '::1'], true)) {
            buyerPoJson(401, ['success' => false, 'message' => 'Sign in using a Buyer account.']);
        }
        $email = 'clark@company.com';
        $stmt = $conn->prepare('SELECT id, full_name, email, role, is_active FROM users WHERE email = ? LIMIT 1');
        $stmt->bind_param('s', $email);
    }
    $stmt->execute();
    $buyer = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$buyer || strtolower((string) $buyer['role']) !== 'buyer' || !(int) $buyer['is_active']) {
        buyerPoJson(401, ['success' => false, 'message' => 'An active Buyer account is required.']);
    }
    return $buyer;
}

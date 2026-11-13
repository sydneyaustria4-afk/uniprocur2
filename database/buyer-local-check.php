<?php
/** Local-only Buyer diagnostic. Does not change database, sessions or user roles. */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
$host = strtolower(trim((string) ($_SERVER['HTTP_HOST'] ?? '')));
$ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
if (!preg_match('/\A(?:localhost|127\.0\.0\.1)(?::[0-9]{1,5})?\z/D', $host)
    || !in_array($ip, ['127.0.0.1', '::1'], true)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'message' => 'Localhost diagnostic only.']);
    exit;
}
require_once __DIR__ . '/procurement_db_connection.php';
require_once __DIR__ . '/uniprocur-session.php';
try {
    $dbName = $conn->query('SELECT DATABASE() AS name')->fetch_assoc()['name'];
    $buyers = $conn->query("SELECT id, email, is_active FROM users WHERE LOWER(TRIM(role))='buyer' ORDER BY id")->fetch_all(MYSQLI_ASSOC);
    $active = array_values(array_filter($buyers, static function ($b) { return (int)$b['is_active'] === 1; }));
    $sessionId = (int) ($_SESSION['user_id'] ?? 0);
    $sessionValidBuyer = false;
    $sessionRole = null;
    if ($sessionId > 0) {
        $st = $conn->prepare('SELECT role, is_active FROM users WHERE id=? LIMIT 1');
        $st->bind_param('i', $sessionId);
        $st->execute();
        $user = $st->get_result()->fetch_assoc();
        $st->close();
        if ($user) {
            $sessionRole = $user['role'];
            $sessionValidBuyer = strtolower(trim((string)$user['role'])) === 'buyer' && (int)$user['is_active'] === 1;
        }
    }
    $status = $sessionId > 0 ? ($sessionValidBuyer ? 'authenticated_buyer' : 'session_is_not_active_buyer')
        : (count($active) === 1 ? 'local_single_buyer_available' : (count($active) === 0 ? 'no_active_buyer' : 'multiple_active_buyers'));
    echo json_encode([
      'success' => true, 'database' => $dbName, 'status' => $status,
      'session_user_id_present' => $sessionId > 0, 'session_role' => $sessionRole,
      'active_buyer_count' => count($active),
      'buyer_rows' => array_map(static function ($b) {
          return ['id' => (int) $b['id'], 'is_active' => (int)$b['is_active'],
                  'email' => preg_replace('/^(.{1,2}).*(@.*)$/', '$1***$2', (string)$b['email'])];
      }, $buyers),
      'next_step' => $status === 'no_active_buyer' ? 'Import/create an active Buyer in the Procurement users table.'
       : ($status === 'multiple_active_buyers' ? 'Use a real Buyer login session; local anonymous fallback is intentionally blocked.'
       : ($status === 'session_is_not_active_buyer' ? 'Sign in using an active Buyer account; the existing session is not Buyer.'
       : 'Open get-buyer-rfq-workspace.php and confirm the response.')),
    ], JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    error_log('Buyer local diagnostic: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Database diagnostic failed. Check users table and PHP logs.']);
}

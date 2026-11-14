<?php
declare(strict_types=1);

require_once __DIR__ . '/uniprocur-session.php';
require_once __DIR__ . '/procurement_db_connection.php';

// Use the original URL path, not a query parameter chosen by the visitor.
$originalUrlPath = (string)(parse_url((string)($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH) ?: '');
$projectPrefix = '/uniprocur2/';
if (strncmp($originalUrlPath, $projectPrefix, strlen($projectPrefix)) !== 0) {
    http_response_code(404);
    exit('Page not found.');
}
$file = substr($originalUrlPath, strlen($projectPrefix));
if (!preg_match('~\A(buyerdashboard|managerdashboard|PR202601)/([A-Za-z0-9._-]+\.html)\z~i', $file, $parts)) {
    http_response_code(404);
    exit('Page not found.');
}
$folder = strtolower($parts[1]);
$requiredRole = $folder === 'managerdashboard' ? 'manager' : 'buyer';

$uid = (int)($_SESSION['user_id'] ?? 0);
if ($uid <= 0) {
    header('Location: /uniprocur2/login/index.php', true, 302);
    exit;
}
$stmt = $conn->prepare('SELECT role, is_active FROM users WHERE id = ? LIMIT 1');
$stmt->bind_param('i', $uid);
$stmt->execute();
$account = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$account || (int)$account['is_active'] !== 1 || strtolower((string)$account['role']) !== $requiredRole) {
    http_response_code(403);
    exit('Access denied: wrong Procurement role or inactive account.');
}

$root = (string)realpath(dirname(__DIR__));
$path = realpath($root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $file));
if (!$path || strncmp($path, $root . DIRECTORY_SEPARATOR, strlen($root) + 1) !== 0 || !is_file($path)) {
    http_response_code(404);
    exit('Page not found.');
}
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
readfile($path);

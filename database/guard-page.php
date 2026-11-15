<?php
/** Secure HTML page routing for both /uniprocur2/ and /ITPROFEL/PROCUREMENT/. */
declare(strict_types=1);
require_once __DIR__ . '/uniprocur-session.php';
require_once __DIR__ . '/procurement_db_connection.php';

$root = realpath(dirname(__DIR__));
$doc = realpath((string)($_SERVER['DOCUMENT_ROOT'] ?? ''));
if (!$root || !$doc) { http_response_code(500); exit('Server paths not configured.'); }
$rootNormal = str_replace('\\', '/', $root);
$docNormal = rtrim(str_replace('\\', '/', $doc), '/');
if (strcasecmp($rootNormal, $docNormal) === 0) {
    $base = '/';
} elseif (strncasecmp($rootNormal, $docNormal . '/', strlen($docNormal) + 1) === 0) {
    $base = '/' . trim(substr($rootNormal, strlen($docNormal) + 1), '/') . '/';
} else {
    // Explicit aliases require a separate deployment configuration.
    http_response_code(500); exit('Procurement path outside DocumentRoot.');
}

$path = (string)(parse_url((string)($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH) ?: '');
if (strncmp(strtolower($path), strtolower($base), strlen($base)) !== 0) {
    http_response_code(404); exit('Page not found.');
}
$relative = substr($path, strlen($base));
if (!preg_match('~\A(buyerdashboard|managerdashboard|PR202601)/([A-Za-z0-9._-]+\.html)\z~iD', $relative, $parts)) {
    http_response_code(404); exit('Page not found.');
}
$roleNeeded = strtolower($parts[1]) === 'managerdashboard' ? 'manager' : 'buyer';
$uid = (int)($_SESSION['user_id'] ?? 0);
if ($uid < 1) {
    header('Location: ' . $base . 'login/index.php', true, 302);
    exit;
}
$stmt = $conn->prepare('SELECT role, is_active FROM users WHERE id=? LIMIT 1');
$stmt->bind_param('i', $uid);
$stmt->execute();
$user = $stmt->get_result()->fetch_assoc();
$stmt->close();
if (!$user || (int)$user['is_active'] !== 1) {
    header('Location: ' . $base . 'login/index.php', true, 302);
    exit;
}
$actualRole = strtolower((string)$user['role']);
if ($actualRole !== $roleNeeded) {
    // No privilege escalation: direct them to their OWN role's dashboard.
    if (in_array($actualRole, ['buyer', 'manager'], true)) {
        header('Location: ' . $base . ($actualRole === 'manager'
            ? 'managerdashboard/manager-dashboard.html'
            : 'buyerdashboard/buyer-dashboard.html'), true, 302);
        exit;
    }
    http_response_code(403);
    exit('Access denied: a Procurement Manager account is required.');
}
$resolved = realpath($root . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relative));
$rootPrefix = rtrim($rootNormal, '/') . '/';
if (!$resolved || strncasecmp(str_replace('\\', '/', $resolved), $rootPrefix, strlen($rootPrefix)) !== 0
    || !is_file($resolved)) {
    http_response_code(404); exit('Page not found.');
}
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: private, no-store');
header('X-Content-Type-Options: nosniff');
readfile($resolved);

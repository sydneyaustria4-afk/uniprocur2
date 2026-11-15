<?php
/**
 * UniProcur project-scoped session bootstrap.
 * In /ITPROFEL/PROCUREMENT/, also accepts verified server-side D.E.V.S root login.
 * In /uniprocur2/, preserves the original standalone Procurement HR login.
 * Both modes use a distinct UPRSESS cookie and keep Buyer/Manager checks intact.
 */
declare(strict_types=1);
if (session_status() === PHP_SESSION_ACTIVE) {
    return;
}

$uniprocurProjectRoot = str_replace('\\', '/', (string)(realpath(dirname(__DIR__)) ?: dirname(__DIR__)));
$uniprocurDocRootRaw = (string)($_SERVER['DOCUMENT_ROOT'] ?? '');
$uniprocurDocRoot = $uniprocurDocRootRaw !== ''
    ? str_replace('\\', '/', (string)(realpath($uniprocurDocRootRaw) ?: $uniprocurDocRootRaw)) : '';
$uniprocurProjectRoot = rtrim($uniprocurProjectRoot, '/');
$uniprocurDocRoot = rtrim($uniprocurDocRoot, '/');
if ($uniprocurDocRoot !== '' && strcasecmp($uniprocurProjectRoot, $uniprocurDocRoot) === 0) {
    $uniprocurCookiePath = '/';
} elseif ($uniprocurDocRoot !== '' && strncasecmp(
    $uniprocurProjectRoot, $uniprocurDocRoot . '/', strlen($uniprocurDocRoot) + 1
) === 0) {
    $relative = substr($uniprocurProjectRoot, strlen($uniprocurDocRoot) + 1);
    $uniprocurCookiePath = '/' . trim($relative, '/') . '/';
} else {
    $script = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? ''));
    $base = trim(dirname(dirname($script)), '/');
    $uniprocurCookiePath = $base === '' ? '/' : '/' . $base . '/';
}

// The ITPROFEL unified ERP uses PHPSESSID, path=/, and $_SESSION['user'].
// Inspect that *server-side* session, then close it BEFORE starting UPRSESS.
// Never accept user/role from browser JSON, localStorage, headers, or URL.
$uniprocurUnifiedInstall = strtolower(basename($uniprocurProjectRoot)) === 'procurement'
    && is_file(dirname($uniprocurProjectRoot) . '/root/api.php');
$uniprocurRootUser = null;
if ($uniprocurUnifiedInstall && !empty($_COOKIE['PHPSESSID'])
    && is_string($_COOKIE['PHPSESSID'])
    && preg_match('/\A[A-Za-z0-9,-]{16,128}\z/D', $_COOKIE['PHPSESSID'])) {
    session_name('PHPSESSID');
    ini_set('session.use_only_cookies', '1');
    ini_set('session.use_strict_mode', '1');
    if (session_start(['read_and_close' => true])) {
        $u = $_SESSION['user'] ?? null;
        if (is_array($u)) $uniprocurRootUser = $u;
    }
    // The read-only root session leaves its session ID in PHP; never reuse it.
    session_id('');
}

$uniprocurCookieName = 'UPRSESS_' . strtoupper(substr(hash('sha256', $uniprocurCookiePath), 0, 12));
// Resume an existing Procurement session, not the root ERP session.
// PHP strict mode still checks whether the cookie ID belongs to an existing session.
if (!empty($_COOKIE[$uniprocurCookieName])
    && is_string($_COOKIE[$uniprocurCookieName])
    && preg_match('/\A[A-Za-z0-9,-]{16,128}\z/D', $_COOKIE[$uniprocurCookieName])) {
    session_id($_COOKIE[$uniprocurCookieName]);
}
$uniprocurHttps = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off')
    || (string)($_SERVER['SERVER_PORT'] ?? '') === '443';
ini_set('session.use_only_cookies', '1');
ini_set('session.use_strict_mode', '1');
session_name($uniprocurCookieName);
session_set_cookie_params([
    'lifetime' => 0,
    'path' => $uniprocurCookiePath,
    'secure' => $uniprocurHttps,
    'httponly' => true,
    'samesite' => 'Lax',
]);
if (session_start() !== true) {
    error_log('UniProcur session initialization failed.');
    http_response_code(500);
    exit('Unable to initialize UniProcur session.');
}

if ($uniprocurUnifiedInstall) {
    require_once __DIR__ . '/uniprocur-root-session-bridge.php';
    uniprocurSyncRootIdentity($uniprocurRootUser);
}

<?php
/**
 * UniProcur project-scoped PHP session bootstrap.
 * Include before reading/writing $_SESSION or calling session_start().
 * Do not use PHP session cookies for Finance/Inventory machine-to-machine APIs.
 *
 * One shared namespace for Procurement Buyer, Manager, and a future HR login
 * served UNDER THE SAME UniProcur URL base path.
 * Requires PHP >= 7.3 for SameSite cookie options.
 */
if (session_status() === PHP_SESSION_ACTIVE) {
    return;
}

// Resolve the URL base from the on-disk project root when possible.
// This is stable for endpoints in database/, Manager pages, and a future
// login.php at the root of UniProcur. Fallback supports CLI/Apache aliases.
$uniprocurProjectRoot = str_replace('\\', '/', (string) (realpath(dirname(__DIR__)) ?: dirname(__DIR__)));
$uniprocurDocRootRaw = (string) ($_SERVER['DOCUMENT_ROOT'] ?? '');
$uniprocurDocRoot = $uniprocurDocRootRaw !== ''
    ? str_replace('\\', '/', (string) (realpath($uniprocurDocRootRaw) ?: $uniprocurDocRootRaw))
    : '';
$uniprocurProjectRoot = rtrim($uniprocurProjectRoot, '/');
$uniprocurDocRoot = rtrim($uniprocurDocRoot, '/');
if ($uniprocurDocRoot !== '' && strcasecmp($uniprocurProjectRoot, $uniprocurDocRoot) === 0) {
    $uniprocurCookiePath = '/';
} elseif ($uniprocurDocRoot !== '' && strncasecmp(
    $uniprocurProjectRoot,
    $uniprocurDocRoot . '/',
    strlen($uniprocurDocRoot) + 1
) === 0) {
    $uniprocurRelativePath = substr($uniprocurProjectRoot, strlen($uniprocurDocRoot) + 1);
    $uniprocurCookiePath = '/' . trim($uniprocurRelativePath, '/') . '/';
} else {
    $uniprocurScript = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
    $uniprocurBase = str_replace('\\', '/', dirname(dirname($uniprocurScript)));
    $uniprocurBase = trim($uniprocurBase, '/');
    $uniprocurCookiePath = $uniprocurBase === '' ? '/' : '/' . $uniprocurBase . '/';
}

// Distinct cookie names for /uniprocur2/ and /uniprocur2-main/.
// The path is stable on the SAME installation across all its API endpoints.
$uniprocurCookieName = 'UPRSESS_' . strtoupper(substr(hash('sha256', $uniprocurCookiePath), 0, 12));
$uniprocurHttps = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
    || (string) ($_SERVER['SERVER_PORT'] ?? '') === '443';

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
    error_log('UniProcur session initialization failed. Check PHP session.save_path and filesystem permissions.');
    http_response_code(500);
    exit('Unable to initialize UniProcur session.');
}

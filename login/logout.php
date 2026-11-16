<?php
/** UNIPROCUR_ITPROFEL_LOGOUT_V2: Sign out of Procurement and unified root session. */
declare(strict_types=1);
require_once __DIR__ . '/../database/uniprocur-session.php';
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    exit('Logout requires POST.');
}
$unified = !empty($uniprocurUnifiedInstall);
$rootSid = (string)($_COOKIE['PHPSESSID'] ?? '');
$params = session_get_cookie_params();
$procName = session_name();
$_SESSION = [];
if (ini_get('session.use_cookies')) {
    setcookie($procName, '', [
        'expires'=>time()-3600, 'path'=>(string)$params['path'],
        'domain'=>(string)$params['domain'], 'secure'=>(bool)$params['secure'],
        'httponly'=>true,'samesite'=>$params['samesite'] ?? 'Lax'
    ]);
}
session_destroy();
// In the unified ERP, also invalidate PHPSESSID; otherwise the root bridge
// will silently log the Buyer/Manager straight back in after Procurement logout.
if ($unified && preg_match('/\A[A-Za-z0-9,-]{16,128}\z/D', $rootSid)) {
    session_id('');
    session_name('PHPSESSID');
    ini_set('session.use_only_cookies','1');
    ini_set('session.use_strict_mode','1');
    session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>(bool)$uniprocurHttps,
        'httponly'=>true,'samesite'=>'Lax']);
    session_id($rootSid);
    if (session_start()) {
        $_SESSION = [];
        session_destroy();
    }
    setcookie('PHPSESSID','',['expires'=>time()-3600,'path'=>'/',
        'secure'=>(bool)$uniprocurHttps,'httponly'=>true,'samesite'=>'Lax']);
}
header('Cache-Control: no-store, max-age=0');
header('Location: ' . ($unified ? '/ITPROFEL/root/' : 'index.php'), true, 303);
exit;

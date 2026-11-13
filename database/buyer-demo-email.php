<?php
/**
 * UniProcur classroom localhost compatibility shim.
 * Used ONLY by legacy Buyer endpoints with no authenticated user_id.
 * Evaluated as an expression: (require __DIR__ . '/buyer-demo-email.php').
 *
 * Security: anonymous Buyer access is confined to loopback localhost XAMPP,
 * requires exactly one ACTIVE Buyer in the configured Procurement database,
 * and never overrides an authenticated session/non-Buyer account.
 * For a shared, remote, or real deployment, use HR-backed authentication.
 */
$uniBuyerHost = strtolower(trim((string) ($_SERVER['HTTP_HOST'] ?? '')));
$uniBuyerIp = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
if (!preg_match('/\A(?:localhost|127\.0\.0\.1)(?::[0-9]{1,5})?\z/D', $uniBuyerHost)
    || !in_array($uniBuyerIp, ['127.0.0.1', '::1'], true)) {
    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'message' => 'Buyer login required outside localhost.']);
    exit;
}
$uniBuyerDb = ($conn ?? null);
if (!($uniBuyerDb instanceof mysqli)) {
    $uniBuyerDb = ($db ?? null);
}
if (!($uniBuyerDb instanceof mysqli)) {
    error_log('Buyer demo shim: expected $conn or $db mysqli connection.');
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'message' => 'Procurement database connection missing.']);
    exit;
}
try {
    // LIMIT 2 deliberately detects ambiguity; never guess which buyer owns records.
    $uniBuyerResult = $uniBuyerDb->query("SELECT id, email FROM users WHERE LOWER(TRIM(role))='buyer' AND is_active=1 ORDER BY id LIMIT 2");
    $uniBuyerCandidates = $uniBuyerResult->fetch_all(MYSQLI_ASSOC);
    $uniBuyerResult->free();
    if (count($uniBuyerCandidates) !== 1 || trim((string) ($uniBuyerCandidates[0]['email'] ?? '')) === '') {
        http_response_code(count($uniBuyerCandidates) > 1 ? 409 : 401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false,
            'message' => count($uniBuyerCandidates) > 1
                ? 'Multiple active Buyer accounts. Sign in with the correct Buyer account.'
                : 'No active Buyer account found in this Procurement database. Check users table and SQL import.']);
        exit;
    }
    return (string) $uniBuyerCandidates[0]['email'];
} catch (Throwable $uniBuyerException) {
    error_log('Buyer demo shim: ' . $uniBuyerException->getMessage());
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'message' => 'Buyer lookup failed. Check Procurement database schema and PHP logs.']);
    exit;
}

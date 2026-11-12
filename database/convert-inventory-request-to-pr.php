<?php
/** LOCAL TEST ONLY. Inventory API -> Procurement PR draft (one PR per Inventory request).
 * Never touches Inventory stock or changes Inventory request status.
 * Run database/01_inventory_request_pr_links.sql in uniprocur2 FIRST.
 */
declare(strict_types=1);
date_default_timezone_set('Asia/Manila');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
if (session_status() !== PHP_SESSION_ACTIVE) session_start();

function respond(int $status, array $data): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

$host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
if (!in_array($ip, ['127.0.0.1', '::1'], true) ||
    !preg_match('/\A(localhost|127\.0\.0\.1)(:\d+)?\z/', $host)) {
    respond(403, ['success' => false, 'message' => 'Localhost-only integration test.']);
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    respond(405, ['success' => false, 'message' => 'POST required.']);
}
if (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) {
    respond(415, ['success' => false, 'message' => 'JSON request required.']);
}

$sessionToken = (string)($_SESSION['inventory_conversion_csrf'] ?? '');
$submittedToken = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
if ($sessionToken === '' || $submittedToken === '' || !hash_equals($sessionToken, $submittedToken)) {
    respond(419, ['success' => false, 'message' => 'Session expired. Refresh Material Requests and try again.']);
}
$body = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($body)) respond(400, ['success' => false, 'message' => 'Invalid JSON.']);
$number = trim((string)($body['request_number'] ?? ''));
$requiredDate = trim((string)($body['required_date'] ?? ''));
$justification = trim((string)($body['justification'] ?? ''));
if (!preg_match('/\AREQ-[A-Za-z0-9-]{1,64}\z/', $number)) {
    respond(422, ['success' => false, 'message' => 'Invalid Inventory request number.']);
}
if (!preg_match('/\A\d{4}-\d{2}-\d{2}\z/', $requiredDate)) {
    respond(422, ['success' => false, 'message' => 'Select a required date.']);
}
[$year,$month,$day] = array_map('intval', explode('-', $requiredDate));
if (!checkdate($month, $day, $year) || $requiredDate < date('Y-m-d')) {
    respond(422, ['success' => false, 'message' => 'Required date cannot be in the past.']);
}
if ($justification === '' || strlen($justification) > 5000) {
    respond(422, ['success' => false, 'message' => 'Enter a justification (up to 5000 characters).']);
}

require_once __DIR__ . '/buyer-po-common.php'; // Existing Buyer identity/session rules.
$buyer = buyerPoIdentity($conn);
$buyerId = (int)$buyer['id'];

$key = (string)(getenv('IMS_API_KEY') ?: ($_SERVER['IMS_API_KEY'] ?? ''));
if ($key === '') respond(503, ['success' => false, 'message' => 'Inventory API key is not configured in Apache.']);
if (!function_exists('curl_init')) respond(503, ['success' => false, 'message' => 'PHP cURL is not enabled.']);

// Never trust item lists sent by browser: fetch request from Inventory's API again.
$curl = curl_init('http://127.0.0.1/inventory_management/api/requests.php');
if ($curl === false) respond(502, ['success' => false, 'message' => 'Could not start Inventory connection.']);
curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 3,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_HTTPHEADER => ['Accept: application/json', 'X-API-Team: Procurement', 'X-API-Key: ' . $key],
    CURLOPT_COOKIE => '',
    CURLOPT_PROXY => '',
]);
$response = curl_exec($curl);
$httpCode = (int)curl_getinfo($curl, CURLINFO_HTTP_CODE);
curl_close($curl);
if (!is_string($response) || $httpCode !== 200 || strlen($response) > 2_000_000) {
    respond(502, ['success' => false, 'message' => 'Inventory API did not respond successfully.']);
}
$parsed = json_decode($response, true);
if (!is_array($parsed) || ($parsed['success'] ?? false) !== true || !is_array($parsed['data'] ?? null)) {
    respond(502, ['success' => false, 'message' => 'Invalid Inventory API response.']);
}
$source = null;
foreach ($parsed['data'] as $candidate) {
    if (is_array($candidate) && (string)($candidate['request_number'] ?? '') === $number) {
        $source = $candidate;
        break;
    }
}
if (!$source || strcasecmp(trim((string)($source['destination'] ?? '')), 'Procurement') !== 0 ||
    strcasecmp(trim((string)($source['status'] ?? '')), 'Pending') !== 0) {
    respond(409, ['success' => false, 'message' => 'Request is missing or is no longer Pending for Procurement.']);
}
$rawItems = $source['items'] ?? [];
if (!is_array($rawItems) || count($rawItems) < 1 || count($rawItems) > 100) {
    respond(422, ['success' => false, 'message' => 'Inventory request needs 1–100 valid item lines.']);
}
$lines = [];
$unmapped = [];
foreach ($rawItems as $raw) {
    if (!is_array($raw)) respond(422, ['success'=>false,'message'=>'Invalid Inventory item.']);
    $name = trim((string)($raw['item_name'] ?? ''));
    $unit = trim((string)($raw['unit'] ?? ''));
    $sourceCode = trim((string)($raw['item_code'] ?? ''));
    $quantity = (float)($raw['requested_quantity'] ?? 0);
    if ($name === '' || strlen($name) > 200 || $unit === '' || strlen($unit) > 20 ||
        !is_finite($quantity) || $quantity <= 0 || $quantity > 99999999.99) {
        respond(422, ['success' => false, 'message' => 'Inventory has an invalid name, unit, or quantity.']);
    }
    // Explicitly confirmed mapping only. Do not guess other inventory item codes.
    $mapped = ($sourceCode === 'RM-002' && strcasecmp($name, 'Black Leather') === 0);
    $code = $mapped ? 'LEA-0004' : '';
    $category = $mapped ? 'Leather' : 'Raw Materials';
    if (!$mapped) $unmapped[] = trim($name . ' (' . $sourceCode . ')');
    $lines[] = compact('code', 'category', 'name', 'unit') + ['quantity' => $quantity];
}

$transaction = false;
try {
    $conn->begin_transaction();
    $transaction = true;
    // Existing unique mapping is protected transactionally by a unique key.
    $lookup = $conn->prepare('SELECT l.pr_id, p.pr_number FROM inventory_request_pr_links l LEFT JOIN purchase_requisitions p ON p.id=l.pr_id WHERE l.inventory_request_number=? LIMIT 1 FOR UPDATE');
    $lookup->bind_param('s', $number);
    $lookup->execute();
    $existing = $lookup->get_result()->fetch_assoc();
    $lookup->close();
    if ($existing && $existing['pr_number'] !== null) {
        $conn->rollback();
        $transaction = false;
        respond(409, [
            'success'=>false, 'already_converted'=>true,
            'pr_number'=>(string)$existing['pr_number'],
            'message'=>'This Inventory request already has a Procurement PR: ' . $existing['pr_number']
        ]);
    }
    // A deleted PR might leave an orphan mapping (legacy draft-delete code).
    if ($existing && $existing['pr_number'] === null) {
        $delete = $conn->prepare('DELETE FROM inventory_request_pr_links WHERE inventory_request_number=?');
        $delete->bind_param('s', $number);
        $delete->execute();
        $delete->close();
    }
    $tempNumber = 'TMP-' . bin2hex(random_bytes(12));
    $department = 'Procurement';
    $departmentStmt = $conn->prepare('SELECT department FROM users WHERE id=? LIMIT 1');
    $departmentStmt->bind_param('i', $buyerId);
    $departmentStmt->execute();
    $deptRow = $departmentStmt->get_result()->fetch_assoc();
    $departmentStmt->close();
    if (is_array($deptRow) && trim((string)($deptRow['department'] ?? '')) !== '') {
        $department = substr(trim((string)$deptRow['department']), 0, 100);
    }
    $status = 'draft';
    $insert = $conn->prepare('INSERT INTO purchase_requisitions (pr_number, created_by, department, purpose, needed_by, status) VALUES (?, ?, ?, ?, ?, ?)');
    $insert->bind_param('sissss', $tempNumber, $buyerId, $department, $justification, $requiredDate, $status);
    $insert->execute();
    $prId = (int)$conn->insert_id;
    $insert->close();
    $prNumber = 'PR-' . date('Y') . '-' . str_pad((string)$prId, 4, '0', STR_PAD_LEFT);
    $update = $conn->prepare('UPDATE purchase_requisitions SET pr_number=? WHERE id=?');
    $update->bind_param('si', $prNumber, $prId);
    $update->execute();
    $update->close();
    $itemInsert = $conn->prepare('INSERT INTO pr_items (pr_id, item_code, category, item_name, unit, qty) VALUES (?, ?, ?, ?, ?, ?)');
    foreach ($lines as $line) {
        $itemInsert->bind_param('issssd', $prId, $line['code'], $line['category'], $line['name'], $line['unit'], $line['quantity']);
        $itemInsert->execute();
    }
    $itemInsert->close();
    $link = $conn->prepare('INSERT INTO inventory_request_pr_links (inventory_request_number, pr_id, buyer_id) VALUES (?, ?, ?)');
    $link->bind_param('sii', $number, $prId, $buyerId);
    $link->execute();
    $link->close();
    $conn->commit();
    $transaction = false;
    respond(201, [
        'success'=>true,
        'request_number'=>$number,
        'pr_id'=>$prId,
        'pr_number'=>$prNumber,
        'status'=>'draft',
        'required_date'=>$requiredDate,
        'justification'=>$justification,
        'items'=>$lines,
        'unmapped_items'=>$unmapped,
        'message'=>'Purchase Request draft created. Review before submitting to Manager.'
    ]);
} catch (Throwable $e) {
    if ($transaction) { try { $conn->rollback(); } catch (Throwable $ignored) {} }
    error_log('Inventory to PR conversion: ' . $e->getMessage());
    if ($e instanceof mysqli_sql_exception && (int)$e->getCode() === 1062) {
        respond(409, ['success'=>false, 'already_converted'=>true, 'message'=>'This Inventory request already has a linked PR. Refresh the page.']);
    }
    respond(500, ['success'=>false, 'message'=>'Unable to create draft. Check that the SQL migration was applied to uniprocur2 and inspect the PHP error log.']);
}

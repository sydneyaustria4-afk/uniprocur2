<?php
/**
 * LOCAL DEVELOPMENT ONLY: Procurement -> Inventory read-only API bridge.
 * Calls the Inventory API from PHP, keeping IMS_API_KEY out of the browser.
 * No Procurement or Inventory database writes.
 * Requires both projects on the SAME Apache/XAMPP server.
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');

function reply(int $status, array $payload): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    reply(405, ['success' => false, 'message' => 'GET only.']);
}

// Local-only protection. Replace with real Buyer-session authorization before
// connecting laptops via Radmin or publishing either app to the internet.
$remoteIp = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
$host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
if (!in_array($remoteIp, ['127.0.0.1', '::1'], true) ||
    !preg_match('/\A(localhost|127\.0\.0\.1)(:\d+)?\z/', $host)) {
    reply(403, ['success' => false, 'message' => 'Local test only.']);
}

// The same Apache SetEnv IMS_API_KEY already configured for the Inventory app.
$key = (string) (getenv('IMS_API_KEY') ?: ($_SERVER['IMS_API_KEY'] ?? ''));
if ($key === '') {
    reply(500, ['success' => false, 'message' => 'Inventory API key not configured in Apache.']);
}

if (!function_exists('curl_init')) {
    reply(500, ['success' => false, 'message' => 'PHP cURL extension is not enabled.']);
}

$url = 'http://127.0.0.1/inventory_management/api/requests.php';
$curl = curl_init($url);
if ($curl === false) {
    reply(500, ['success' => false, 'message' => 'Could not start Inventory API connection.']);
}
curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CONNECTTIMEOUT => 3,
    CURLOPT_TIMEOUT => 10,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_MAXREDIRS => 0,
    CURLOPT_HTTPHEADER => [
        'Accept: application/json',
        'X-API-Team: Procurement',
        'X-API-Key: ' . $key,
    ],
    CURLOPT_COOKIE => '', // Do not forward Inventory/Procurement browser sessions.
    CURLOPT_PROXY => '',
]);
$body = curl_exec($curl);
$status = (int) curl_getinfo($curl, CURLINFO_HTTP_CODE);
$error = curl_error($curl);
curl_close($curl);

if (!is_string($body)) {
    error_log('Inventory bridge: ' . $error);
    reply(502, ['success' => false, 'message' => 'Cannot contact Inventory API. Check Apache and the Inventory folder.']);
}
if ($status !== 200) {
    error_log('Inventory bridge: upstream HTTP ' . $status);
    reply(502, [
        'success' => false,
        'message' => $status === 401 ? 'Inventory API rejected the configured key.' : 'Inventory API returned an error (HTTP ' . $status . ').'
    ]);
}
if (strlen($body) > 2000000) {
    reply(502, ['success' => false, 'message' => 'Inventory response exceeded expected size.']);
}
$json = json_decode($body, true);
if (!is_array($json) || ($json['success'] ?? false) !== true || !is_array($json['data'] ?? null)) {
    reply(502, ['success' => false, 'message' => 'Unexpected Inventory API response.']);
}

// Restrict browser response to the minimum fields needed for the Buyer UI.
$requests = [];
foreach ($json['data'] as $request) {
    if (!is_array($request) || strcasecmp(trim((string)($request['destination'] ?? '')), 'Procurement') !== 0) {
        continue;
    }
    $items = [];
    foreach (($request['items'] ?? []) as $item) {
        if (!is_array($item)) continue;
        $items[] = [
            'request_item_id' => (int) ($item['request_item_id'] ?? 0),
            'item_code' => (string) ($item['item_code'] ?? ''),
            'item_name' => (string) ($item['item_name'] ?? ''),
            'quantity' => (float) ($item['requested_quantity'] ?? 0),
            'unit' => (string) ($item['unit'] ?? ''),
        ];
    }
    $requests[] = [
        'inventory_id' => (int) ($request['id'] ?? 0),
        'request_number' => (string) ($request['request_number'] ?? ''),
        'requester_team' => (string) ($request['requester_team'] ?? 'Inventory'),
        'request_date' => (string) ($request['request_date'] ?? ''),
        'status' => (string) ($request['status'] ?? ''),
        'remarks' => (string) ($request['remarks'] ?? ''),
        'items' => $items,
    ];
}
reply(200, ['success' => true, 'data' => $requests, 'read_only' => true]);

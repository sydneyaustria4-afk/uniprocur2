<?php
/** LOCAL DEMO ONLY. Mimics an Inventory acceptance event without modifying stock/GR tables. */
require_once __DIR__ . '/procurement_db_connection.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');

function inventoryDemoReply(int $status, array $data): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// Deliberately hard-disabled on any non-loopback request.
$host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
if (!preg_match('/\A(localhost|127\.0\.0\.1)(:\d+)?\z/', $host)
    || !in_array($ip, ['127.0.0.1', '::1'], true)) {
    inventoryDemoReply(403, ['success' => false, 'message' => 'Localhost-only demo. No live Inventory acceptance is supported.']);
}
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    inventoryDemoReply(200, ['success' => true, 'demo_mode' => true, 'message' => 'Local-only Inventory simulator; no warehouse stock is changed.']);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    inventoryDemoReply(405, ['success' => false, 'message' => 'POST required.']);
}
if (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) {
    inventoryDemoReply(415, ['success' => false, 'message' => 'JSON required.']);
}
$body = json_decode(file_get_contents('php://input') ?: '', true);
if (!is_array($body)) inventoryDemoReply(400, ['success' => false, 'message' => 'Invalid JSON.']);
$number = trim((string)($body['po_number'] ?? ''));
if (!preg_match('/\APO-[A-Za-z0-9-]{1,26}\z/', $number)) {
    inventoryDemoReply(422, ['success' => false, 'message' => 'Valid PO number required.']);
}
$transaction = false;
try {
    $conn->begin_transaction();
    $transaction = true;
    $stmt = $conn->prepare(
        "SELECT po.id, LOWER(po.status) AS status,
                t.confirmed_at, t.inventory_accepted_at,
                GREATEST(0, TIMESTAMPDIFF(SECOND, t.confirmed_at, NOW())) AS elapsed_seconds
         FROM purchase_orders po
         LEFT JOIN po_demo_tracking t ON t.po_id = po.id
         WHERE po.po_number = ? LIMIT 1 FOR UPDATE"
    );
    $stmt->bind_param('s', $number);
    $stmt->execute();
    $po = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$po) {
        $conn->rollback(); $transaction=false;
        inventoryDemoReply(404, ['success'=>false, 'message'=>'PO not found.']);
    }
    if ($po['inventory_accepted_at'] !== null) {
        $conn->rollback(); $transaction=false;
        inventoryDemoReply(200, ['success'=>true, 'already_accepted'=>true, 'message'=>'This PO was already accepted in local demo mode.']);
    }
    if (!in_array($po['status'], ['approved','issued','partial'], true)) {
        $conn->rollback(); $transaction=false;
        inventoryDemoReply(409, ['success'=>false, 'message'=>'PO must first be Manager-approved.']);
    }
    if ($po['confirmed_at'] === null || (int)$po['elapsed_seconds'] < 120) {
        $conn->rollback(); $transaction=false;
        inventoryDemoReply(409, ['success'=>false, 'message'=>'Wait until Out for Delivery is reached (2 minutes after Manager approval).']);
    }
    $poId = (int)$po['id'];
    $stmt = $conn->prepare(
        "UPDATE po_demo_tracking
         SET inventory_accepted_at = NOW(), accepted_source = 'local_demo'
         WHERE po_id = ? AND inventory_accepted_at IS NULL"
    );
    $stmt->bind_param('i', $poId);
    $stmt->execute();
    $updated = $stmt->affected_rows;
    $stmt->close();
    if ($updated !== 1) throw new RuntimeException('Tracking milestone was not saved.');
    $conn->commit(); $transaction=false;
    inventoryDemoReply(200, [
        'success'=>true,
        'message'=>"Inventory demo accepted {$number}. Delivery tracking is now complete (demo only).",
        'stock_updated'=>false,
        'goods_receipt_created'=>false
    ]);
} catch (Throwable $error) {
    if ($transaction) { try { $conn->rollback(); } catch (Throwable $ignored) {} }
    error_log('Local Inventory demo accept PO: '.$error->getMessage());
    inventoryDemoReply(500, ['success'=>false, 'message'=>'Demo action failed. Check the po_demo_tracking migration and PHP log.']);
}

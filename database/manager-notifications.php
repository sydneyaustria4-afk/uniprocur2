<?php
/** Manager bell: recorded PO submissions waiting for Manager review. No simulated events. */
declare(strict_types=1);
require_once __DIR__ . '/procurement_db_connection.php';
require_once __DIR__ . '/manager-api-common.php';
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');

try {
    $method = (string)($_SERVER['REQUEST_METHOD'] ?? '');
    if (!in_array($method, ['GET', 'POST'], true)) {
        header('Allow: GET, POST');
        managerSendJson(405, ['success'=>false, 'message'=>'GET or POST required.']);
    }
    $manager = requireActiveManager($conn);
    $managerId = (int)$manager['id'];
    if (empty($_SESSION['manager_po_notification_csrf'])) {
        $_SESSION['manager_po_notification_csrf'] = bin2hex(random_bytes(32));
    }

    // Deliberately show only current pending approvals, never resolved PO requests.
    $sql = "SELECT e.id, e.po_number, e.recorded_at, e.origin,
                   s.name AS supplier_name, po.total_amount
            FROM procurement_po_notification_events e
            INNER JOIN purchase_orders po ON po.id=e.po_id
            LEFT JOIN suppliers s ON s.id=po.supplier_id
            WHERE e.event_type='submitted'
              AND LOWER(po.status)='pending_approval'
              AND po.created_by <> ?
            ORDER BY e.recorded_at DESC, e.id DESC LIMIT 80";
    $stmt=$conn->prepare($sql);
    $stmt->bind_param('i',$managerId);$stmt->execute();
    $rows=$stmt->get_result()->fetch_all(MYSQLI_ASSOC);$stmt->close();
    $events=[];
    foreach ($rows as $row) {
        $no=(string)$row['po_number'];
        $legacy=$row['origin']==='backfill';
        $events[]=[
            'key'=>'posubmit:'.(int)$row['id'],
            'category'=>'Purchase Order',
            'type'=>'po_pending_approval',
            'title'=>($legacy ? 'Existing PO awaiting approval: ' : 'New PO awaiting approval: ').$no,
            'message'=>(string)($row['supplier_name'] ?? 'Supplier not recorded').
                ($legacy ? ' · Pending when notification history was installed.' : ' · Buyer submitted for Manager approval.'),
            'occurred_at'=>(string)$row['recorded_at'],
            'time_type'=>$legacy?'notification_imported_at':'submission_event_at',
            'url'=>'manager-view-purchase-order.html?po_number='.rawurlencode($no),
        ];
    }
    $stmt=$conn->prepare('SELECT event_key FROM procurement_manager_notification_reads WHERE manager_id=?');
    $stmt->bind_param('i',$managerId);$stmt->execute();
    $read=$stmt->get_result()->fetch_all(MYSQLI_ASSOC);$stmt->close();
    $readMap=[];
    foreach ($read as $r) $readMap[(string)$r['event_key']]=true;
    if ($method==='GET') {
        $unread=0;
        foreach ($events as &$event) {
            $event['read']=isset($readMap[$event['key']]);
            if (!$event['read']) ++$unread;
        }
        unset($event);
        managerSendJson(200, ['success'=>true, 'notifications'=>$events,
            'unread_count'=>$unread,
            'csrf_token'=>(string)$_SESSION['manager_po_notification_csrf'],
            'source'=>'procurement_po_notification_events',
            'poll_seconds'=>30]);
    }
    if (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''),'application/json')!==0) {
        managerSendJson(415,['success'=>false,'message'=>'JSON body required.']);
    }
    $token=(string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if ($token==='' || !hash_equals((string)$_SESSION['manager_po_notification_csrf'],$token)) {
        managerSendJson(419,['success'=>false,'message'=>'Notification session expired. Reload.']);
    }
    $body=json_decode(file_get_contents('php://input') ?: '', true);
    $keys=is_array($body)?($body['keys'] ?? null):null;
    if (!is_array($keys) || count($keys)<1 || count($keys)>80) {
        managerSendJson(422,['success'=>false,'message'=>'Provide 1 to 80 event keys.']);
    }
    $allowed=array_fill_keys(array_column($events,'key'),true);
    $unique=[];
    foreach ($keys as $key) {
        if (!is_string($key) || strlen($key)>120 || !isset($allowed[$key])) {
            managerSendJson(422,['success'=>false,'message'=>'Unknown or inaccessible notification.']);
        }
        $unique[$key]=true;
    }
    $conn->begin_transaction();
    try {
        $stmt=$conn->prepare('INSERT IGNORE INTO procurement_manager_notification_reads(manager_id,event_key,read_at) VALUES(?,?,NOW())');
        foreach (array_keys($unique) as $key) {
            $stmt->bind_param('is',$managerId,$key);$stmt->execute();
        }
        $stmt->close();$conn->commit();
    } catch(Throwable $e) { $conn->rollback();throw $e; }
    managerSendJson(200,['success'=>true,'marked_read'=>count($unique)]);
} catch(Throwable $error) {
    error_log('Manager PO notification API: '.$error->getMessage());
    managerSendJson(500,['success'=>false,
        'message'=>'Unable to load Manager PO notifications. Verify SQL migration, manager login and PHP logs.']);
}

<?php
/**
 * UniProcur Buyer notifications. Data-driven, read-only source detection.
 * Finance: authenticated Finance API decision audit (not merely RFQ submission).
 * Inventory: actual local XAMPP posted Goods Receipts (never demo timer/GR-TEST).
 * Only read acknowledgments are written to Procurement MySQL.
 * Cross-PC Inventory notifications require future Inventory API/webhook integration.
 */
declare(strict_types=1);
require_once __DIR__ . '/buyer-po-common.php';
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store, max-age=0');

function bnEvents(mysqli $db, int $buyerId): array {
    $events = [];
    $warnings = [];
    $sources = ['finance_decisions' => false, 'inventory_local_receipts' => false];

    // This table records a decision only when authenticated Finance API approves/rejects.
    // Multiple review rounds remain independently visible via decision id.
    try {
        $sql = 'SELECT d.id AS decision_id, d.quote_id, d.decision, d.note, d.recorded_at,
                       r.rfq_number, s.name AS supplier_name
                FROM procurement_finance_quote_decisions d
                INNER JOIN procurement_finance_quotes f ON f.id=d.finance_request_id
                INNER JOIN rfqs r ON r.id=d.rfq_id
                INNER JOIN purchase_requisitions pr ON pr.id=r.pr_id
                LEFT JOIN rfq_quotes q ON q.id=d.quote_id AND q.rfq_id=d.rfq_id
                LEFT JOIN suppliers s ON s.id=q.supplier_id
                WHERE f.buyer_id=? AND r.created_by=? AND pr.created_by=?
                  AND d.decision IN (\'approved\',\'rejected\')
                ORDER BY d.recorded_at DESC, d.id DESC LIMIT 80';
        $stmt = $db->prepare($sql);
        $stmt->bind_param('iii', $buyerId, $buyerId, $buyerId);
        $stmt->execute();
        $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        $sources['finance_decisions'] = true;
        foreach ($rows as $row) {
            $approved = $row['decision'] === 'approved';
            $rfq = (string) $row['rfq_number'];
            $quoteId = (int) $row['quote_id'];
            $supplier = trim((string) ($row['supplier_name'] ?? ''));
            $note = trim((string) ($row['note'] ?? ''));
            $summary = ($supplier !== '' ? $supplier . ' · ' : '') . 'Quote #' . $quoteId;
            if (!$approved && $note !== '') $summary .= ' · Reason: ' . substr($note, 0, 200);
            $events[] = [
                'key' => 'fin:' . (int) $row['decision_id'],
                'type' => $approved ? 'finance_approved' : 'finance_rejected',
                'category' => 'Finance',
                'title' => 'Finance ' . ($approved ? 'approved ' : 'rejected ') . $rfq,
                'message' => $summary,
                'occurred_at' => (string) $row['recorded_at'],
                'url' => $approved
                    ? 'award-confirmation.html?rfq_number=' . rawurlencode($rfq) . '&quote_id=' . $quoteId
                    : 'comparison-matrix.html?rfq_number=' . rawurlencode($rfq),
            ];
        }
    } catch (Throwable $error) {
        error_log('Buyer notifications Finance source: ' . $error->getMessage());
        $warnings[] = 'Finance decision history is unavailable. Verify the Finance handoff migration and API.';
    }

    // UNIPROCUR_BUYER_PO_DECISION_NOTIFICATIONS_V1
    // Actual Manager PO decisions, captured when Manager's existing API commits.
    try {
        $stmt = $db->prepare(
            "SELECT e.id, e.event_type, e.po_number, e.recorded_at,
                    u.full_name AS manager_name
             FROM procurement_po_notification_events e
             INNER JOIN purchase_orders po ON po.id=e.po_id
             LEFT JOIN users u ON u.id=e.manager_id
             WHERE e.event_type IN ('approved','rejected')
               AND e.buyer_id=? AND po.created_by=?
             ORDER BY e.recorded_at DESC, e.id DESC LIMIT 80"
        );
        $stmt->bind_param('ii', $buyerId, $buyerId);
        $stmt->execute();
        $rows=$stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        $sources['manager_po_decisions']=true;
        foreach ($rows as $row) {
            $no=(string)$row['po_number'];
            $approved=$row['event_type']==='approved';
            $events[] = [
                'key'=>'podecision:'.(int)$row['id'],
                'type'=>$approved?'manager_po_approved':'manager_po_rejected',
                'category'=>'Manager',
                'title'=>'Manager '.($approved?'approved ':'rejected ').$no,
                'message'=>'Manager decision saved in Procurement. '.($approved
                    ? 'The Purchase Order is approved.'
                    : 'The Purchase Order was rejected; review it before taking the next action.'),
                'occurred_at'=>(string)$row['recorded_at'],
                'url'=>'buyer-view-purchase-order.html?po_number='.rawurlencode($no),
            ];
        }
    } catch (Throwable $error) {
        error_log('Buyer notifications Manager PO source: '.$error->getMessage());
        $warnings[]='Manager Purchase Order decision notifications are unavailable. Run the PO notification SQL migration.';
    }
    // This is the SAME local Inventory database used by the existing real GR page.
    // Do not claim Radmin/cross-PC connectivity: this only works on local XAMPP.
    $host = strtolower(trim((string) ($_SERVER['HTTP_HOST'] ?? '')));
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    $local = (bool) preg_match('/\A(?:localhost|127\.0\.0\.1)(?::\d+)?\z/D', $host)
        && in_array($ip, ['127.0.0.1', '::1'], true);
    if ($local) {
        try {
            $sql = 'SELECT gr.id AS receipt_id, gr.goods_receipt_number, gr.po_number, gr.posted_at,
                           COUNT(ri.id) AS item_lines
                    FROM inventory_system_api_test.inventory_po_real_receipts gr
                    INNER JOIN inventory_system_api_test.inventory_po_real_receipt_items ri
                        ON ri.receipt_id=gr.id
                    INNER JOIN purchase_orders po ON po.po_number=gr.po_number
                    INNER JOIN rfqs r ON r.id=po.rfq_id
                    INNER JOIN purchase_requisitions pr ON pr.id=r.pr_id
                    WHERE po.created_by=? AND r.created_by=? AND pr.created_by=?
                      AND gr.posted_at IS NOT NULL
                    GROUP BY gr.id, gr.goods_receipt_number, gr.po_number, gr.posted_at
                    HAVING SUM(COALESCE(ri.accepted_qty,0)) > 0
                    ORDER BY gr.posted_at DESC, gr.id DESC LIMIT 80';
            $stmt = $db->prepare($sql);
            $stmt->bind_param('iii', $buyerId, $buyerId, $buyerId);
            $stmt->execute();
            $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
            $stmt->close();
            $sources['inventory_local_receipts'] = true;
            foreach ($rows as $row) {
                $po = (string) $row['po_number'];
                $gr = (string) $row['goods_receipt_number'];
                $events[] = [
                    'key' => 'gr:' . (int) $row['receipt_id'],
                    'type' => 'inventory_materials_received',
                    'category' => 'Inventory',
                    'title' => 'Inventory received materials',
                    'message' => $po . ' · Confirmed Goods Receipt ' . $gr . ' (accepted quantities saved). This does not automatically mean the entire PO is complete.',
                    'occurred_at' => (string) $row['posted_at'],
                    'url' => 'buyer-real-goods-receipts.html?po_number=' . rawurlencode($po),
                ];
            }
        } catch (Throwable $error) {
            error_log('Buyer notifications Inventory source: ' . $error->getMessage());
            $warnings[] = 'Local Inventory Goods Receipts are unavailable. Check Inventory tables or the XAMPP database connection.';
        }
    } else {
        $warnings[] = 'Inventory notifications are local-XAMPP only until the Inventory team provides the cross-PC integration API.';
    }

    usort($events, static function (array $a, array $b): int {
        $cmp = strcmp($b['occurred_at'], $a['occurred_at']);
        return $cmp !== 0 ? $cmp : strcmp($b['key'], $a['key']);
    });
    return [array_slice($events, 0, 100), $sources, $warnings];
}

try {
    $method = (string) ($_SERVER['REQUEST_METHOD'] ?? '');
    if (!in_array($method, ['GET','POST'], true)) {
        header('Allow: GET, POST');
        buyerPoJson(405, ['success' => false, 'message' => 'GET or POST required.']);
    }
    $buyer = buyerPoIdentity($conn);
    $buyerId = (int) $buyer['id'];
    if (empty($_SESSION['buyer_notification_csrf'])) {
        $_SESSION['buyer_notification_csrf'] = bin2hex(random_bytes(32));
    }
    [$events,$sources,$warnings] = bnEvents($conn,$buyerId);
    $stmt=$conn->prepare('SELECT event_key FROM procurement_buyer_notification_reads WHERE buyer_id=?');
    $stmt->bind_param('i',$buyerId);$stmt->execute();
    $readRows=$stmt->get_result()->fetch_all(MYSQLI_ASSOC);$stmt->close();
    $readMap=[];
    foreach ($readRows as $readRow) $readMap[(string)$readRow['event_key']]=true;

    if ($method === 'GET') {
        $unread=0;
        foreach ($events as &$event) {
            $event['read']=isset($readMap[$event['key']]);
            if (!$event['read']) ++$unread;
        }
        unset($event);
        buyerPoJson(200, [
            'success'=>true,'notifications'=>$events,'unread_count'=>$unread,
            'csrf_token'=>(string) $_SESSION['buyer_notification_csrf'],
            'source_status'=>$sources,'warnings'=>$warnings,
            'read_only_events'=>true,
            'note'=>'Finance decisions are from audited Finance callbacks; Inventory receipts are sourced from local XAMPP actual GR records only.'
        ]);
    }
    if (stripos((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') !== 0) {
        buyerPoJson(415,['success'=>false,'message'=>'JSON body required.']);
    }
    $token=(string)($_SERVER['HTTP_X_CSRF_TOKEN']??'');
    if ($token==='' || !hash_equals((string)$_SESSION['buyer_notification_csrf'],$token)) {
        buyerPoJson(419,['success'=>false,'message'=>'Notification session expired. Refresh and retry.']);
    }
    $body=json_decode(file_get_contents('php://input') ?: '',true);
    $keys=is_array($body)?($body['keys']??null):null;
    if (!is_array($keys)||count($keys)<1||count($keys)>100) {
        buyerPoJson(422,['success'=>false,'message'=>'Provide 1 to 100 notification keys.']);
    }
    $allowed=array_fill_keys(array_column($events,'key'),true);
    $unique=[];
    foreach ($keys as $key) {
        if (!is_string($key)||strlen($key)>120||!isset($allowed[$key])) {
            buyerPoJson(422,['success'=>false,'message'=>'Unknown or inaccessible notification. Refresh and retry.']);
        }
        $unique[$key]=true;
    }
    $conn->begin_transaction();
    try {
        $stmt=$conn->prepare('INSERT IGNORE INTO procurement_buyer_notification_reads(buyer_id,event_key,read_at) VALUES(?,?,NOW())');
        foreach (array_keys($unique) as $key) {
            $stmt->bind_param('is',$buyerId,$key);
            $stmt->execute();
        }
        $stmt->close();
        $conn->commit();
    } catch(Throwable $e) { $conn->rollback();throw $e; }
    buyerPoJson(200,['success'=>true,'marked_read'=>count($unique)]);
} catch(Throwable $error) {
    error_log('Buyer notification API: '.$error->getMessage());
    buyerPoJson(500,['success'=>false,'message'=>'Unable to load notifications. Check the SQL migration, PHP logs, and Finance/Inventory source tables.']);
}

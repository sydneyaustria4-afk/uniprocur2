<?php
/** ITPROFEL v1: server-side, durable Procurement -> Inventory event delivery. */
declare(strict_types=1);

function uniInventoryUrl(string $resource): string {
    $defaults = [
        'sync' => 'http://127.0.0.1/ITPROFEL/inventory_management/api/procurement-sync.php',
        'requests' => 'http://127.0.0.1/ITPROFEL/inventory_management/api/requests.php',
        'receipts' => 'http://127.0.0.1/ITPROFEL/inventory_management/api/delivery-receipts.php',
    ];
    $envs = ['sync'=>'INVENTORY_SYNC_URL','requests'=>'INVENTORY_REQUESTS_URL','receipts'=>'INVENTORY_RECEIPTS_URL'];
    if (!isset($defaults[$resource])) throw new InvalidArgumentException('Unknown Inventory API resource');
    $v = trim((string)(getenv($envs[$resource]) ?: ($_SERVER[$envs[$resource]] ?? $defaults[$resource])));
    $url = parse_url($v);
    // The supplied Inventory API is hosted on the same Apache server.
    // Never follow external URLs/redirects through internal bridge.
    if (!is_array($url) || ($url['scheme'] ?? '') !== 'http'
        || !in_array(strtolower((string)($url['host'] ?? '')), ['127.0.0.1','localhost'],true)
        || !empty($url['user']) || !empty($url['pass'])) {
        throw new RuntimeException('Inventory API must be an internal localhost HTTP URL. Check Apache SetEnv configuration.');
    }
    return $v;
}
function uniInventoryKey(): string {
    $v = (string)(getenv('IMS_API_KEY') ?: ($_SERVER['IMS_API_KEY'] ?? ''));
    if ($v === '' || preg_match('/[\r\n]/', $v)) throw new RuntimeException('IMS_API_KEY is missing or invalid.');
    return $v;
}
function uniInventoryCall(string $resource,string $method='GET',array $payload=[],array $query=[]): array {
    if (!function_exists('curl_init')) throw new RuntimeException('PHP cURL is disabled.');
    $url = uniInventoryUrl($resource);
    if ($query) $url .= (str_contains($url, '?') ? '&' : '?').http_build_query($query);
    $handle = curl_init($url);
    if ($handle === false) throw new RuntimeException('Cannot open Inventory API.');
    $opts = [
        CURLOPT_RETURNTRANSFER=>true, CURLOPT_CONNECTTIMEOUT=>3, CURLOPT_TIMEOUT=>9,
        CURLOPT_FOLLOWLOCATION=>false, CURLOPT_MAXREDIRS=>0,
        CURLOPT_HTTPHEADER=>[
            'Accept: application/json', 'X-API-Team: Procurement', 'X-API-Key: '.uniInventoryKey(),
            'Content-Type: application/json'
        ], CURLOPT_COOKIE=>'', CURLOPT_PROXY=>'',
    ];
    if ($method === 'POST') {
        $opts[CURLOPT_POST] = true;
        $opts[CURLOPT_POSTFIELDS] = json_encode($payload,JSON_THROW_ON_ERROR);
    }
    curl_setopt_array($handle,$opts);
    $response = curl_exec($handle);
    $status = (int)curl_getinfo($handle,CURLINFO_HTTP_CODE);
    $err = curl_error($handle);
    curl_close($handle);
    if (!is_string($response) || strlen($response)>2000000) throw new RuntimeException('Inventory API unavailable or response too large: '.$err);
    $result = json_decode($response,true);
    if (!is_array($result) || $status < 200 || $status >= 300 || ($result['success'] ?? false) !== true) {
        $msg = is_array($result) ? (string)($result['message'] ?? 'API error') : 'Invalid JSON response';
        throw new RuntimeException('Inventory API HTTP '.$status.': '.substr($msg,0,240));
    }
    return $result;
}
/** Must be called INSIDE the same transaction that approves the PR/PO. */
function uniInventoryQueue(mysqli $db,string $event,int $sourceId,string $requestNumber,?string $poNumber=null): int {
    if (!in_array($event,['pr_approved','po_approved'],true)) throw new InvalidArgumentException('Invalid event');
    $s=$db->prepare('INSERT IGNORE INTO procurement_inventory_sync_outbox (event_type,source_id,request_number,po_number) VALUES (?,?,?,?)');
    $s->bind_param('siss',$event,$sourceId,$requestNumber,$poNumber);
    $s->execute();$s->close();
    $s=$db->prepare('SELECT id FROM procurement_inventory_sync_outbox WHERE event_type=? AND source_id=? LIMIT 1');
    $s->bind_param('si',$event,$sourceId);$s->execute();$id=(int)($s->get_result()->fetch_assoc()['id']??0);$s->close();
    if ($id<1) throw new RuntimeException('Inventory outbox insert failed.');
    return $id;
}
function uniInventoryQueuePr(mysqli $db,int $prId): int {
    $s=$db->prepare('SELECT inventory_request_number FROM inventory_request_pr_links WHERE pr_id=? LIMIT 1');
    $s->bind_param('i',$prId);$s->execute();$row=$s->get_result()->fetch_assoc();$s->close();
    return $row ? uniInventoryQueue($db,'pr_approved',$prId,(string)$row['inventory_request_number']) : 0;
}
function uniInventoryQueuePo(mysqli $db,int $poId,string $poNumber): int {
    $s=$db->prepare('SELECT l.inventory_request_number FROM purchase_orders po JOIN rfqs r ON r.id=po.rfq_id JOIN inventory_request_pr_links l ON l.pr_id=r.pr_id WHERE po.id=? LIMIT 1');
    $s->bind_param('i',$poId);$s->execute();$row=$s->get_result()->fetch_assoc();$s->close();
    return $row ? uniInventoryQueue($db,'po_approved',$poId,(string)$row['inventory_request_number'],$poNumber) : 0;
}
/** Return true on verified sent/previously processed, false if retry needed. */
function uniInventorySendQueued(mysqli $db,int $id): bool {
    if (!$id) return true; // Native Procurement PRs/POs without a linked Inventory REQ.
    $s=$db->prepare('SELECT * FROM procurement_inventory_sync_outbox WHERE id=? LIMIT 1');
    $s->bind_param('i',$id);$s->execute();$row=$s->get_result()->fetch_assoc();$s->close();
    if (!$row) throw new RuntimeException('Inventory event not in outbox.');
    if ($row['status']==='sent') return true;
    $event=(string)$row['event_type'];$po=(string)($row['po_number']??'');$num=(string)$row['request_number'];
    // Never replay a PO dispatch after Procurement has recorded a receipt.
    if ($event==='po_approved') {
        $s=$db->prepare('SELECT status FROM purchase_orders WHERE id=?');
        $sourceId=(int)$row['source_id'];$s->bind_param('i',$sourceId);$s->execute();$status=(string)($s->get_result()->fetch_assoc()['status']??'');$s->close();
        if (!in_array($status,['approved'],true)) {
            error_log('Inventory outbox #'.$id.' skipped; PO status no longer approved: '.$status);
            return false;
        }
    }
    try {
        // If Inventory already applied the event and the response was lost,
        // DON'T repost PO sync: the Inventory handler can reset delivery dates.
        $check=uniInventoryCall('requests','GET',[],['request_number'=>$num]);
        foreach(($check['data']??[]) as $request) {
            if (($request['request_number']??'')!==$num) continue;
            if ($event==='pr_approved' && in_array($request['status']??'', ['Approved','Partially Approved'],true)) {
                $ok=true;break;
            }
            if ($event==='po_approved' && ($request['po_number']??'')===$po && in_array($request['delivery_status']??'', ['Out for Delivery','Partially Delivered','Delivered'],true)) {
                $ok=true;break;
            }
        }
        if (empty($ok)) {
            uniInventoryCall('sync','POST',['event'=>$event,'request_number'=>$num,'po_number'=>$po]);
        }
        $s=$db->prepare("UPDATE procurement_inventory_sync_outbox SET status='sent',last_error=NULL,attempts=attempts+1,last_attempt_at=NOW(),delivered_at=NOW() WHERE id=?");
        $s->bind_param('i',$id);$s->execute();$s->close();
        return true;
    }catch(Throwable $e){
        error_log('Inventory sync #'.$id.': '.$e->getMessage());
        $message=substr($e->getMessage(),0,500);
        $s=$db->prepare("UPDATE procurement_inventory_sync_outbox SET status='pending',last_error=?,attempts=attempts+1,last_attempt_at=NOW() WHERE id=?");
        $s->bind_param('si',$message,$id);$s->execute();$s->close();
        return false;
    }
}

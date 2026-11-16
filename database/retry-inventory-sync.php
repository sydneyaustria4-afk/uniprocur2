<?php
/** CLI-only safe outbox retries after Procurement approval has committed. */
declare(strict_types=1);
if (PHP_SAPI!=='cli') {http_response_code(404);exit;}
require_once __DIR__.'/procurement_db_connection.php';
require_once __DIR__.'/uniprocur-inventory-sync.php';
try {
    $rows=$conn->query("SELECT id,event_type,request_number,po_number FROM procurement_inventory_sync_outbox WHERE status='pending' ORDER BY id ASC LIMIT 100")->fetch_all(MYSQLI_ASSOC);
    if (!$rows) { echo "No pending Inventory sync events.\n"; exit(0); }
    $fail=0;
    foreach ($rows as $row) {
        $id=(int)$row['id'];$sent=uniInventorySendQueued($conn,$id);
        echo '#'.$id.' '.$row['event_type'].' '.$row['request_number'].' '.($sent?'SYNCED':'PENDING — see PHP error log')."\n";
        if (!$sent)$fail++;
    }
    exit($fail?1:0);
}catch(Throwable $e){fwrite(STDERR,'STOP: '.$e->getMessage()."\n");exit(2);}

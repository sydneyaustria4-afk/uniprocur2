<?php
/** CLI only: reconcile an authenticated, persisted Inventory DR when a callback failed. */
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
require_once __DIR__.'/uniprocur-inventory-receipt-core.php';
$poNumber=(string)($argv[1]??'');
if(!preg_match('/\APO-[A-Za-z0-9-]{1,30}\z/',$poNumber)){
    fwrite(STDERR,"Usage: php reconcile-inventory-receipts.php PO-2026-0001\n");exit(2);
}
try {
    $stmt=$conn->prepare('SELECT l.inventory_request_number FROM purchase_orders po JOIN rfqs r ON r.id=po.rfq_id JOIN inventory_request_pr_links l ON l.pr_id=r.pr_id WHERE po.po_number=? LIMIT 1');
    $stmt->bind_param('s',$poNumber);$stmt->execute();$r=$stmt->get_result()->fetch_assoc();$stmt->close();
    if(!$r)throw new DomainException('No linked Inventory Material Request for this PO.');
    $result=uniReceiptApply($conn,(string)$r['inventory_request_number'],$poNumber);
    echo "[SUCCESS] Verified Inventory Delivery Receipt reconciled: ".json_encode($result)."\n";
}catch(Throwable $e){fwrite(STDERR,"[STOP] ".$e->getMessage()."\nNo unverified receipt should be recorded.\n");exit(1);}

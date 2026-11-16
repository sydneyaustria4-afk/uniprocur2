<?php
/** ITPROFEL v1: verified receipt core; reusable by callback and CLI reconciliation. */
declare(strict_types=1);
require_once __DIR__ . "/procurement_db_connection.php";
require_once __DIR__ . "/uniprocur-inventory-sync.php";
function uniReceiptItemKey(string $name,string $unit): string {
    $name = strtolower(trim(preg_replace('/\s+/u',' ',$name) ?? $name));
    $unit = strtolower(trim($unit));
    $units = ['pcs'=>'pieces','pc'=>'pieces','piece'=>'pieces','pieces'=>'pieces',
              'sq ft'=>'square feet','sq. ft.'=>'square feet','sqft'=>'square feet',
              'square foot'=>'square feet','square feet'=>'square feet',
              'meter'=>'meters','m'=>'meters','meters'=>'meters',
              'kg'=>'kilograms','kilogram'=>'kilograms','kilograms'=>'kilograms'];
    return $name.'|'.($units[$unit]??$unit);
}
function uniReceiptSchemaReady(mysqli $db): bool {
    $q=$db->query("SELECT COUNT(*) n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('procurement_inventory_receipts','procurement_inventory_receipt_items')");
    return (int)($q->fetch_assoc()['n']??0)===2;
}
function uniReceiptApply(mysqli $db,string $requestNumber,string $poNumber): array {
    if (!uniReceiptSchemaReady($db)) throw new DomainException('Import 02_itprofel_inventory_sync.sql into Procurement MySQL first.');
    // Verify receipt against Inventory's own persisted, authenticated records.
    $live=uniInventoryCall('requests','GET',[],['request_number'=>$requestNumber]);
    $request=null;
    foreach (($live['data']??[]) as $record) {
        if (is_array($record)&&($record['request_number']??'')===$requestNumber) { $request=$record;break; }
    }
    if (!$request || strcasecmp((string)($request['destination']??''),'Procurement')!==0 ||
        strcasecmp((string)($request['requester_team']??''),'Inventory')!==0 ||
        (string)($request['po_number']??'')!==$poNumber) {
        throw new DomainException('Inventory request / PO reference mismatch. No Procurement data changed.');
    }
    $response=uniInventoryCall('receipts','GET',[],['request_number'=>$requestNumber]);
    $dr=$response['data']??null;
    if (!is_array($dr) || (string)($dr['request_number']??'')!==$requestNumber ||
        (string)($dr['delivery_status']??'')!=='Delivered' ||
        !preg_match('/\ADR-[A-Za-z0-9-]{1,76}\z/',(string)($dr['dr_number']??'')) ||
        !is_array($dr['items']??null) || !$dr['items']) {
        throw new DomainException('Inventory has no confirmed, persisted Delivery Receipt for this request.');
    }
    $drNum=(string)$dr['dr_number'];
    $receiptDate=(string)($dr['received_date'] ?: $dr['receipt_date'] ?: '');
    if (!preg_match('/\A\d{4}-\d{2}-\d{2}\z/',$receiptDate)) throw new DomainException('Inventory receipt date invalid.');
    $db->begin_transaction();
    try {
        $po=$db->prepare('SELECT po.id,po.status FROM purchase_orders po JOIN rfqs r ON r.id=po.rfq_id JOIN inventory_request_pr_links l ON l.pr_id=r.pr_id WHERE po.po_number=? AND l.inventory_request_number=? LIMIT 1 FOR UPDATE');
        $po->bind_param('ss',$poNumber,$requestNumber);$po->execute();$row=$po->get_result()->fetch_assoc();$po->close();
        if (!$row) throw new DomainException('This PO is not linked to the Inventory Material Request.');
        $poId=(int)$row['id'];$poStatus=strtolower((string)$row['status']);
        if (!in_array($poStatus,['approved','partial','received'],true)) throw new DomainException('PO is not approved or already received.');
        $s=$db->prepare('SELECT id,item_name,unit,qty_ordered FROM po_items WHERE po_id=? ORDER BY id FOR UPDATE');
        $s->bind_param('i',$poId);$s->execute();$orders=$s->get_result()->fetch_all(MYSQLI_ASSOC);$s->close();
        if (!$orders || count($orders)!==count($dr['items'])) throw new DomainException('Inventory receipt and PO item line count differ. Manual reconciliation required.');
        $index=[];
        foreach($orders as $it){
            $k=uniReceiptItemKey((string)$it['item_name'],(string)$it['unit']);
            if(isset($index[$k])) throw new DomainException('Duplicate PO item name/unit. Manual mapping required.');
            $index[$k]=$it;
        }
        $mapped=[];$allFull=true;$anyReceived=false;
        foreach($dr['items'] as $it){
            if (!is_array($it)) throw new DomainException('Invalid Inventory receipt item.');
            $k=uniReceiptItemKey((string)($it['item_name']??''),(string)($it['unit']??''));
            if (!isset($index[$k])) throw new DomainException('Unmatched Inventory item (name/unit). Fix item mapping before invoice: '.substr($k,0,120));
            $order=$index[$k];unset($index[$k]);
            $accepted=(float)($it['accepted_quantity']??-1);
            $delivered=(float)($it['delivered_quantity']??-1);
            $ordered=(float)$order['qty_ordered'];
            if (!is_finite($accepted)||!is_finite($delivered)||$accepted<0||$delivered<0||$accepted>$delivered+0.001||$accepted>$ordered+0.001) {
                throw new DomainException('Inventory quantities conflict with the PO.');
            }
            $anyReceived=$anyReceived||$accepted>0.001;
            $allFull=$allFull&&abs($accepted-$ordered)<0.001;
            $mapped[]=['id'=>(int)$order['id'],'accepted'=>$accepted,'delivered'=>$delivered,'rejected'=>max(0,$delivered-$accepted)];
        }
        if($index||!$anyReceived) throw new DomainException('No accepted goods or incomplete item mapping.');
        // Same DR cannot silently change once confirmed; require manual reconciliation.
        $canonical=json_encode($mapped,JSON_THROW_ON_ERROR);
        $hash=hash('sha256',$canonical);
        $s=$db->prepare('SELECT id,snapshot_hash FROM procurement_inventory_receipts WHERE request_number=? AND receipt_number=? LIMIT 1 FOR UPDATE');
        $s->bind_param('ss',$requestNumber,$drNum);$s->execute();$previous=$s->get_result()->fetch_assoc();$s->close();
        if ($previous && !hash_equals((string)$previous['snapshot_hash'],$hash)) throw new DomainException('Existing receipt quantities changed. Manual review required.');
        if (!$previous){
            $s=$db->prepare('INSERT INTO procurement_inventory_receipts (po_id,po_number,request_number,receipt_number,receipt_date,snapshot_hash) VALUES (?,?,?,?,?,?)');
            $s->bind_param('isssss',$poId,$poNumber,$requestNumber,$drNum,$receiptDate,$hash);$s->execute();$receiptId=(int)$db->insert_id;$s->close();
            $insert=$db->prepare('INSERT INTO procurement_inventory_receipt_items (receipt_id,po_item_id,delivered_qty,accepted_qty,rejected_qty) VALUES (?,?,?,?,?)');
            foreach ($mapped as $entry) {
                $id=(int)$entry['id'];$qty=$entry['accepted'];$shipped=$entry['delivered'];$rej=$entry['rejected'];
                $insert->bind_param('iiddd',$receiptId,$id,$shipped,$qty,$rej);$insert->execute();
            }
            $insert->close();
        }
        // No fake receipt: Inventory DR validated, every item mapped, totals checked.
        $update=$db->prepare('UPDATE po_items SET qty_received=?,delivery_status=? WHERE id=? AND po_id=?');
        foreach ($mapped as $entry) {
            $id=$entry['id'];$qty=$entry['accepted'];
            $target=(float)array_values(array_filter($orders,fn($x)=>(int)$x['id']===$id))[0]['qty_ordered'];
            $lineStatus=abs($qty-$target)<0.001?'complete':($qty>0?'partial':'pending');
            $update->bind_param('dsii',$qty,$lineStatus,$id,$poId);$update->execute();
        }
        $update->close();
        $newStatus=$allFull?'received':'partial';
        $s=$db->prepare('UPDATE purchase_orders SET status=? WHERE id=?');
        $s->bind_param('si',$newStatus,$poId);$s->execute();$s->close();
        $db->commit();
        return ['po_number'=>$poNumber,'request_number'=>$requestNumber,'receipt_number'=>$drNum,
            'status'=>$newStatus,'fully_received'=>$allFull,'already_recorded'=>(bool)$previous];
    }catch(Throwable $e){ $db->rollback(); throw $e; }
}

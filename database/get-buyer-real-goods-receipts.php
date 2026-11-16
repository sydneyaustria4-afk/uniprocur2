<?php
/** ITPROFEL v1: verified, Inventory API-sourced Delivery Receipts, read-only Buyer UI. */
declare(strict_types=1);
require_once __DIR__.'/buyer-po-common.php';
require_once __DIR__.'/uniprocur-verified-receipts.php';
header('X-Content-Type-Options: nosniff');
if(($_SERVER['REQUEST_METHOD']??'')!=='GET')buyerPoJson(405,['success'=>false,'message'=>'GET only.']);
$number=trim((string)($_GET['po_number']??''));
if(!preg_match('/\APO-[A-Za-z0-9-]{1,26}\z/',$number))buyerPoJson(422,['success'=>false,'message'=>'Valid PO number required.']);
try {
    $buyer=buyerPoIdentity($conn);$buyerId=(int)$buyer['id'];
    if(!uniVerifiedReceiptsReady($conn))buyerPoJson(503,['success'=>false,'message'=>'Import 02_itprofel_inventory_sync.sql first.']);
    $stmt=$conn->prepare('SELECT po.id,po.po_number,po.status AS po_status,pr.pr_number,s.name AS supplier_name FROM purchase_orders po JOIN rfqs r ON r.id=po.rfq_id JOIN purchase_requisitions pr ON pr.id=r.pr_id JOIN suppliers s ON s.id=po.supplier_id WHERE po.po_number=? AND po.created_by=? AND r.created_by=? AND pr.created_by=? LIMIT 1');
    $stmt->bind_param('siii',$number,$buyerId,$buyerId,$buyerId);$stmt->execute();$po=$stmt->get_result()->fetch_assoc();$stmt->close();
    if(!$po)buyerPoJson(404,['success'=>false,'message'=>'PO not found for this Buyer.']);
    $poId=(int)$po['id'];
    $stmt=$conn->prepare('SELECT pi.id,pi.item_name,pi.unit,pi.qty_ordered,pi.qty_received, COALESCE(SUM(ri.delivered_qty),0) AS real_delivered,COALESCE(SUM(ri.accepted_qty),0) AS real_accepted,COALESCE(SUM(ri.rejected_qty),0) AS real_rejected FROM po_items pi LEFT JOIN procurement_inventory_receipt_items ri ON ri.po_item_id=pi.id LEFT JOIN procurement_inventory_receipts gr ON gr.id=ri.receipt_id AND gr.po_id=pi.po_id WHERE pi.po_id=? GROUP BY pi.id,pi.item_name,pi.unit,pi.qty_ordered,pi.qty_received ORDER BY pi.id');
    $stmt->bind_param('i',$poId);$stmt->execute();$items=$stmt->get_result()->fetch_all(MYSQLI_ASSOC);$stmt->close();
    $full=(bool)$items;
    foreach($items as &$it){
        $it['real_delivered']=(float)$it['real_delivered'];$it['real_accepted']=(float)$it['real_accepted'];$it['real_rejected']=(float)$it['real_rejected'];
        $it['inventory_item_code']=''; // No fabricated item mapping; Inventory uses its own codes.
        $it['matches_real_receipts']=abs((float)$it['qty_received']-$it['real_accepted'])<0.001;
        if(!$it['matches_real_receipts']||abs((float)$it['qty_ordered']-$it['real_accepted'])>=0.001)$full=false;
    }unset($it);
    $stmt=$conn->prepare('SELECT gr.receipt_number AS goods_receipt_number,gr.receipt_date AS received_date,gr.verified_at AS posted_at,NULL AS notes,\'Inventory\' AS warehouse_name,COALESCE(SUM(ri.delivered_qty),0) AS delivered,COALESCE(SUM(ri.accepted_qty),0) AS accepted,COALESCE(SUM(ri.rejected_qty),0) AS rejected FROM procurement_inventory_receipts gr LEFT JOIN procurement_inventory_receipt_items ri ON ri.receipt_id=gr.id WHERE gr.po_id=? GROUP BY gr.id,gr.receipt_number,gr.receipt_date,gr.verified_at ORDER BY gr.id DESC');
    $stmt->bind_param('i',$poId);$stmt->execute();$receipts=$stmt->get_result()->fetch_all(MYSQLI_ASSOC);$stmt->close();
    buyerPoJson(200,['success'=>true,'read_only'=>true,'po'=>$po,'items'=>$items,'receipts'=>$receipts,
        'fully_received_from_real_gr'=>$full&&(bool)$receipts&&strtolower((string)$po['po_status'])==='received',
        'finance_posting_enabled'=>false,'message'=>'Verified Inventory Delivery Receipts. Supplier documents and Finance approval remain separate.']);
}catch(Throwable $e){error_log('ITPROFEL verified GR view: '.$e->getMessage());buyerPoJson(500,['success'=>false,'message'=>'Verified receipt data unavailable. Check SQL migration and server logs.']);}

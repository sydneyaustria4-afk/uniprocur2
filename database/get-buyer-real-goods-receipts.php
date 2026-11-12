<?php
/** Local XAMPP read-only verification of real Inventory GR records for a Buyer PO.
 * Local same-MySQL ONLY. Not the GR-TEST ledger and not invoice/Finance posting.
 */
declare(strict_types=1);
require_once __DIR__ . '/buyer-po-common.php';
header('X-Content-Type-Options: nosniff');

$host=strtolower((string)($_SERVER['HTTP_HOST']??''));
$ip=(string)($_SERVER['REMOTE_ADDR']??'');
if (!preg_match('/\A(?:localhost|127\.0\.0\.1)(?::\d+)?\z/', $host) || !in_array($ip,['127.0.0.1','::1'],true)) {
    buyerPoJson(403,['success'=>false,'message'=>'Local XAMPP only; not configured for Radmin.']);
}
if (($_SERVER['REQUEST_METHOD']??'')!=='GET') buyerPoJson(405,['success'=>false,'message'=>'GET only.']);
$number=trim((string)($_GET['po_number']??''));
if (!preg_match('/\APO-[A-Za-z0-9-]{1,30}\z/',$number)) {
    buyerPoJson(422,['success'=>false,'message'=>'Enter a valid Purchase Order number.']);
}
try {
    $buyer=buyerPoIdentity($conn);
    $buyerId=(int)$buyer['id'];
    $q=$conn->prepare("SELECT po.id,po.po_number,LOWER(po.status) AS po_status, pr.pr_number,
        s.name AS supplier_name, COALESCE(l.inventory_request_number,'') AS inventory_request_number
        FROM purchase_orders po
        JOIN rfqs r ON r.id=po.rfq_id
        JOIN purchase_requisitions pr ON pr.id=r.pr_id
        JOIN suppliers s ON s.id=po.supplier_id
        LEFT JOIN inventory_request_pr_links l ON l.pr_id=pr.id
        WHERE po.po_number=? AND po.created_by=? AND r.created_by=? AND pr.created_by=? LIMIT 1");
    $q->bind_param('siii',$number,$buyerId,$buyerId,$buyerId);
    $q->execute(); $po=$q->get_result()->fetch_assoc(); $q->close();
    if (!$po) buyerPoJson(404,['success'=>false,'message'=>'PO not found for active Buyer.']);
    $poId=(int)$po['id'];
    $q=$conn->prepare('SELECT pi.id AS po_item_id,pi.item_name,pi.unit,pi.qty_ordered,COALESCE(pi.qty_received,0) AS qty_received,
        i.item_code AS inventory_item_code,
        COALESCE(SUM(rli.delivered_qty),0) AS real_delivered,
        COALESCE(SUM(rli.accepted_qty),0) AS real_accepted,
        COALESCE(SUM(rli.rejected_qty),0) AS real_rejected
        FROM po_items pi
        LEFT JOIN inventory_system_api_test.inventory_po_item_mappings m ON m.procurement_po_item_id=pi.id
        LEFT JOIN inventory_system_api_test.items i ON i.id=m.inventory_item_id
        LEFT JOIN inventory_system_api_test.inventory_po_real_receipt_items rli ON rli.procurement_po_item_id=pi.id
        WHERE pi.po_id=?
        GROUP BY pi.id,pi.item_name,pi.unit,pi.qty_ordered,pi.qty_received,i.item_code ORDER BY pi.id');
    $q->bind_param('i',$poId); $q->execute(); $items=$q->get_result()->fetch_all(MYSQLI_ASSOC);$q->close();
    $q=$conn->prepare('SELECT gr.goods_receipt_number,gr.received_date,gr.posted_at,gr.notes,
        w.warehouse_name, SUM(ri.delivered_qty) AS delivered, SUM(ri.accepted_qty) AS accepted, SUM(ri.rejected_qty) AS rejected
        FROM inventory_system_api_test.inventory_po_real_receipts gr
        JOIN inventory_system_api_test.warehouses w ON w.id=gr.warehouse_id
        JOIN inventory_system_api_test.inventory_po_real_receipt_items ri ON ri.receipt_id=gr.id
        WHERE gr.po_number=? GROUP BY gr.id,gr.goods_receipt_number,gr.received_date,gr.posted_at,gr.notes,w.warehouse_name ORDER BY gr.id DESC');
    $q->bind_param('s',$number);$q->execute();$receipts=$q->get_result()->fetch_all(MYSQLI_ASSOC);$q->close();
    $allFull = count($items)>0;
    foreach($items as &$item) {
        $item['qty_ordered']=(float)$item['qty_ordered'];
        $item['qty_received']=(float)$item['qty_received'];
        $item['real_accepted']=(float)$item['real_accepted'];
        $item['real_delivered']=(float)$item['real_delivered'];
        $item['real_rejected']=(float)$item['real_rejected'];
        $item['remaining']=max(0,$item['qty_ordered']-$item['qty_received']);
        $item['matches_real_receipts']=abs($item['real_accepted']-$item['qty_received'])<0.001;
        if ($item['remaining']>0.001 || !$item['matches_real_receipts']) $allFull=false;
    }
    unset($item);
    $fullyReceived = $allFull && count($receipts)>0 && $po['po_status']==='received';
    buyerPoJson(200,[
        'success'=>true,'local_only'=>true,'read_only'=>true,
        'po'=>$po,'items'=>$items,'receipts'=>$receipts,
        'fully_received_from_real_gr'=>$fullyReceived,
        'invoice_automatically_ready'=>false,
        'finance_posting_enabled'=>false,
        'message'=>'Real receiving is separate from GR-TEST. Full receipt permits later invoice verification but does not establish a 3-way match or auto-post to Finance.'
    ]);
} catch(Throwable $e) {
    error_log('Real local GR buyer verification: '.$e->getMessage());
    buyerPoJson(500,['success'=>false,'message'=>'Failed reading real Goods Receipts. Check migration and MySQL grants.']);
}

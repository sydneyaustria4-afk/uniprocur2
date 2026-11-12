<?php
/** Read-only Buyer Invoice Dashboard. This endpoint never posts to Finance. */
require_once __DIR__ . '/buyer-po-common.php';
if ($_SERVER['REQUEST_METHOD'] !== 'GET') buyerPoJson(405, ['success'=>false,'message'=>'GET required.']);
try {
    $buyer = buyerPoIdentity($conn);
    $buyerId = (int)$buyer['id'];
    $sql = "SELECT i.id, i.invoice_number, i.po_id, i.total_amount, i.status,
                   DATE_FORMAT(i.invoice_date,'%Y-%m-%d') AS invoice_date,
                   DATE_FORMAT(i.due_date,'%Y-%m-%d') AS due_date,
                   DATE_FORMAT(i.created_at,'%Y-%m-%d %H:%i:%s') AS created_at,
                   po.po_number, s.name AS supplier_name, s.payment_terms,
                   src.source_kind, src.match_status,
                   COALESCE(items.item_summary,'') AS item_summary,
                   COALESCE(items.item_count,0) AS item_count
            FROM invoices AS i
            LEFT JOIN purchase_orders AS po ON po.id=i.po_id
            LEFT JOIN suppliers AS s ON s.id=po.supplier_id
            LEFT JOIN buyer_invoice_source_local AS src ON src.invoice_id=i.id
            LEFT JOIN (
              SELECT invoice_id, COUNT(*) AS item_count,
                     GROUP_CONCAT(DISTINCT item_name ORDER BY item_name SEPARATOR ', ') AS item_summary
              FROM invoice_items GROUP BY invoice_id
            ) items ON items.invoice_id=i.id
            WHERE i.created_by=?
            ORDER BY i.created_at DESC, i.id DESC";
    $stmt=$conn->prepare($sql);
    if (!$stmt) throw new RuntimeException('Invoice listing query preparation failed.');
    $stmt->bind_param('i',$buyerId);
    $stmt->execute();
    $invoices=$stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    // Do not infer 3-way match from invoice status or data presence.
    buyerPoJson(200,[
      'success'=>true,
      'buyer'=>['full_name'=>$buyer['full_name'],'email'=>$buyer['email']],
      'invoices'=>$invoices,
      'message'=>'Status reflects stored invoice status. Goods Receipt 3-way match is not independently verified.'
    ]);
} catch (Throwable $e) {
    error_log('Buyer invoice listing: '.$e->getMessage());
    buyerPoJson(500,['success'=>false,'message'=>'Unable to load invoices. Check Apache/PHP error logs and the invoices table.']);
}

<?php
/** Procurement-only invoice export checks. Re-check before enqueue, fail closed.
 * The local Inventory schema below is intentionally required: until Inventory
 * exposes trusted persisted receiving data across PCs, real handoff is blocked.
 * A buyer-checked document flag is a recorded declaration, NOT document authentication.
 */
declare(strict_types=1);

function fihMoneyCents($v): int {
    $text = (string)$v;
    if (!preg_match('/\A(?:0|[1-9][0-9]{0,9})(?:\.[0-9]{1,2})?\z/D', $text)) {
        throw new DomainException('An amount is invalid or has more than two decimal places.');
    }
    $parts = explode('.', $text);
    return ((int)$parts[0]) * 100 + (int)str_pad($parts[1] ?? '0', 2, '0');
}
function fihInvoice(mysqli $db, string $number, int $buyerId): ?array {
    $sql = 'SELECT i.id AS invoice_id, i.invoice_number, i.po_id, i.supplier_id, i.created_by,
            i.status AS invoice_status, i.invoice_date, i.due_date, i.total_amount,
            po.po_number, po.status AS po_status, po.total_amount AS po_total,
            po.order_date, po.supplier_id AS po_supplier_id,
            s.name AS supplier_name, s.payment_terms,
            src.supplier_invoice_reference, src.source_kind, src.document_checked,
            src.match_status, src.verified_at
        FROM invoices i
        JOIN purchase_orders po ON po.id=i.po_id
        JOIN rfqs r ON r.id=po.rfq_id
        JOIN purchase_requisitions pr ON pr.id=r.pr_id
        JOIN suppliers s ON s.id=po.supplier_id
        LEFT JOIN buyer_invoice_source_local src ON src.invoice_id=i.id
        WHERE i.invoice_number=? AND i.created_by=? AND po.created_by=?
          AND r.created_by=? AND pr.created_by=? LIMIT 1';
    $q=$db->prepare($sql);
    $q->bind_param('siiii', $number,$buyerId,$buyerId,$buyerId,$buyerId);
    $q->execute();$row=$q->get_result()->fetch_assoc();$q->close();
    return $row ?: null;
}
function fihVerifiedSnapshot(mysqli $db, array $inv): array {
    if (strtolower((string)$inv['invoice_status']) !== 'ready_to_post'
        || strtolower((string)$inv['po_status']) !== 'received') {
        throw new DomainException('PO must be Received and invoice Ready to Post.');
    }
    if (($inv['source_kind'] ?? '') !== 'supplier_document'
        || (int)($inv['document_checked'] ?? 0) !== 1
        || ($inv['match_status'] ?? '') !== 'matched'
        || empty($inv['verified_at'])) {
        throw new DomainException('CLASSROOM DEMO and unverified invoices cannot enter Finance. A recorded supplier-document review and real 3-way match are required.');
    }
    if (trim((string)($inv['supplier_invoice_reference'] ?? '')) === '') {
        throw new DomainException('Supplier invoice reference is missing.');
    }
    if ((int)$inv['supplier_id'] !== (int)$inv['po_supplier_id']) {
        throw new DomainException('Supplier does not match the Purchase Order.');
    }
    if ($inv['invoice_date'] < $inv['order_date'] || $inv['due_date'] < $inv['invoice_date']) {
        throw new DomainException('Invoice or due date is inconsistent.');
    }
    $invoiceId=(int)$inv['invoice_id'];$poId=(int)$inv['po_id'];$poNumber=(string)$inv['po_number'];
    $q=$db->prepare('SELECT pi.id, pi.item_name, pi.unit, pi.qty_ordered, pi.qty_received,pi.unit_price,
            ii.id AS invoice_line_id, ii.item_name AS billed_item_name, ii.unit AS billed_unit,
            ii.qty_billed,ii.unit_price AS billed_unit_price,ii.subtotal AS billed_subtotal
        FROM po_items pi LEFT JOIN invoice_items ii ON ii.po_item_id=pi.id AND ii.invoice_id=?
        WHERE pi.po_id=? ORDER BY pi.id');
    $q->bind_param('ii',$invoiceId,$poId);$q->execute();$rows=$q->get_result()->fetch_all(MYSQLI_ASSOC);$q->close();
    $q=$db->prepare('SELECT COUNT(*) AS n FROM invoice_items WHERE invoice_id=?');
    $q->bind_param('i',$invoiceId);$q->execute();$n=(int)$q->get_result()->fetch_assoc()['n'];$q->close();
    if (!$rows || count($rows)!==$n) throw new DomainException('Invoice lines must match the complete PO exactly.');
    $q=$db->prepare('SELECT ri.procurement_po_item_id AS item_id,
              SUM(ri.accepted_qty) AS accepted
        FROM inventory_system_api_test.inventory_po_real_receipt_items ri
        JOIN inventory_system_api_test.inventory_po_real_receipts gr ON gr.id=ri.receipt_id
        WHERE gr.po_id=? AND gr.po_number=? AND gr.posted_at IS NOT NULL
        GROUP BY ri.procurement_po_item_id');
    $q->bind_param('is',$poId,$poNumber);$q->execute();$received=$q->get_result()->fetch_all(MYSQLI_ASSOC);$q->close();
    $actual=[];foreach($received as $x)$actual[(int)$x['item_id']]=(float)$x['accepted'];
    $q=$db->prepare('SELECT goods_receipt_number,received_date FROM inventory_system_api_test.inventory_po_real_receipts
        WHERE po_id=? AND po_number=? AND posted_at IS NOT NULL ORDER BY id');
    $q->bind_param('is',$poId,$poNumber);$q->execute();$receipts=$q->get_result()->fetch_all(MYSQLI_ASSOC);$q->close();
    if (!$receipts) throw new DomainException('No posted real Inventory Goods Receipts found.');
    $items=[];$total=0;
    foreach($rows as $line) {
        $id=(int)$line['id'];
        if (!$line['invoice_line_id'] || !$line['qty_billed'] || !$line['billed_unit_price']) {
            throw new DomainException('An invoice line is missing.');
        }
        $ordered=(float)$line['qty_ordered'];$saved=(float)$line['qty_received'];$gr=$actual[$id]??0.0;
        $billed=(float)$line['qty_billed'];
        if ($ordered<=0 || $gr<=0 || abs($ordered-$saved)>0.001 || abs($saved-$gr)>0.001 || abs($billed-$gr)>0.001
            || (string)$line['item_name'] !== (string)$line['billed_item_name']
            || (string)$line['unit'] !== (string)$line['billed_unit']
            || fihMoneyCents($line['unit_price']) !== fihMoneyCents($line['billed_unit_price'])) {
            throw new DomainException('PO / posted GR / invoice quantity, item, unit or price differs.');
        }
        $price=fihMoneyCents($line['billed_unit_price']);
        $expected=(int)round($billed*$price);
        if ($expected!==fihMoneyCents($line['billed_subtotal'])) {
            throw new DomainException('Invoice line subtotal does not match billed quantity × unit price.');
        }
        $total+=$expected;
        $items[]=['po_item_id'=>$id,'item_name'=>$line['item_name'],'unit'=>$line['unit'],
            'ordered_qty'=>$line['qty_ordered'],'received_qty'=>$line['qty_received'],
            'billed_qty'=>$line['qty_billed'],'unit_price_pre_vat'=>$line['billed_unit_price'],
            'line_total_pre_vat'=>$line['billed_subtotal']];
    }
    if ($total<=0 || $total!==fihMoneyCents($inv['total_amount']) || $total!==fihMoneyCents($inv['po_total'])) {
        throw new DomainException('Invoice line totals do not match invoice and PO totals (pre-VAT).');
    }
    return [
        'invoice_number'=>$inv['invoice_number'],
        'supplier_invoice_reference'=>$inv['supplier_invoice_reference'],
        'po_number'=>$poNumber,
        'supplier'=>['id'=>(int)$inv['supplier_id'],'name'=>$inv['supplier_name'],'payment_terms'=>$inv['payment_terms']],
        'invoice_date'=>$inv['invoice_date'],'due_date'=>$inv['due_date'],
        'amount_pre_vat'=>(string)$inv['total_amount'],
        'tax_status'=>'NOT_VERIFIED_PRE_VAT_ONLY',
        'document_review'=>'BUYER_DECLARED_REVIEW_NOT_INDEPENDENT_DOCUMENT_AUTHENTICATION',
        'three_way_match'=>'RECHECKED_AGAINST_LOCAL_POSTED_INVENTORY_GOODS_RECEIPTS',
        'goods_receipts'=>$receipts,'items'=>$items
    ];
}

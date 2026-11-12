<?php
/** Local XAMPP ONLY. Supplier invoice capture and PO/real GR/invoice 3-way matching.
 * Procurement DB writes ONLY; Inventory is read-only. NO Finance posting.
 * Not designed for Radmin/public use. See README for deployment limits.
 */
declare(strict_types=1);
date_default_timezone_set('Asia/Manila');
require_once __DIR__ . '/buyer-po-common.php';
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');

function ilReply(int $status, array $data): void { buyerPoJson($status, $data); }
function ilStringDate(string $value): bool {
    if (!preg_match('/\A\d{4}-\d{2}-\d{2}\z/', $value)) return false;
    [$y,$m,$d]=array_map('intval',explode('-',$value));
    return checkdate($m,$d,$y);
}
function ilMoneyCents($value, bool $allowZero = false): int {
    $s=(string)$value;
    if (!preg_match('/\A(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,2})?\z/',$s)) {
        throw new DomainException('Use positive numbers with up to 2 decimal places (maximum 8 digits before decimal).');
    }
    $parts=explode('.',$s);
    $c=((int)$parts[0])*100 + (int)str_pad($parts[1]??'0',2,'0');
    if (!$allowZero && $c<=0) throw new DomainException('Quantities and prices must be greater than zero.');
    return $c;
}
function ilCentsText(int $cents): string { return sprintf('%d.%02d', intdiv($cents,100), $cents%100); }
function ilLineCents(int $qtyHundredths,int $unitPriceCents): int {
    // DECIMAL(12,2) supports at most 999999999999 cents. Check before multiplying.
    if ($qtyHundredths<=0 || $unitPriceCents<=0 || $unitPriceCents>intdiv(99999999999900,$qtyHundredths))
        throw new DomainException('Invoice line total exceeds supported amount.');
    return (int)round($qtyHundredths*$unitPriceCents/100);
}
function ilPo(mysqli $db, int $buyerId, string $poNumber): ?array {
    $q=$db->prepare('SELECT po.id,po.po_number,po.status,po.total_amount,po.order_date,po.created_by,po.supplier_id,
        s.name AS supplier_name,pr.pr_number
        FROM purchase_orders po
        JOIN suppliers s ON s.id=po.supplier_id
        JOIN rfqs r ON r.id=po.rfq_id
        JOIN purchase_requisitions pr ON pr.id=r.pr_id
        WHERE po.po_number=? AND po.created_by=? AND r.created_by=? AND pr.created_by=? LIMIT 1');
    $q->bind_param('siii',$poNumber,$buyerId,$buyerId,$buyerId);
    $q->execute();$v=$q->get_result()->fetch_assoc();$q->close();
    return $v ?: null;
}
function ilPoItems(mysqli $db,int $poId): array {
    $q=$db->prepare('SELECT id AS po_item_id,item_name,unit,qty_ordered,qty_received,unit_price,subtotal
                     FROM po_items WHERE po_id=? ORDER BY id');
    $q->bind_param('i',$poId);$q->execute();$data=$q->get_result()->fetch_all(MYSQLI_ASSOC);$q->close();return $data;
}
function ilReceiptTotals(mysqli $db,int $poId,string $poNumber): array {
    // Match real GR by both PO ID and PO number; never include GR-TEST rows.
    $q=$db->prepare('SELECT rli.procurement_po_item_id AS po_item_id,
        SUM(rli.accepted_qty) AS accepted, SUM(rli.rejected_qty) AS rejected
        FROM inventory_system_api_test.inventory_po_real_receipt_items rli
        JOIN inventory_system_api_test.inventory_po_real_receipts gr ON gr.id=rli.receipt_id
        WHERE gr.po_id=? AND gr.po_number=?
        GROUP BY rli.procurement_po_item_id');
    $q->bind_param('is',$poId,$poNumber);$q->execute();$arr=$q->get_result()->fetch_all(MYSQLI_ASSOC);$q->close();
    $result=[];foreach($arr as $row)$result[(int)$row['po_item_id']]=$row;
    return $result;
}
function ilReceiptNumbers(mysqli $db, int $poId, string $poNumber): array {
    $q=$db->prepare('SELECT goods_receipt_number,received_date
        FROM inventory_system_api_test.inventory_po_real_receipts WHERE po_id=? AND po_number=? ORDER BY id');
    $q->bind_param('is',$poId,$poNumber);$q->execute();$r=$q->get_result()->fetch_all(MYSQLI_ASSOC);$q->close();return $r;
}
function ilInvoice(mysqli $db,int $poId, int $buyerId): ?array {
    $q=$db->prepare('SELECT i.*,src.supplier_invoice_reference,src.source_kind,src.document_checked,
        src.source_notes,src.match_status,src.match_summary,src.verified_at
        FROM invoices i LEFT JOIN buyer_invoice_source_local src ON src.invoice_id=i.id
        WHERE i.po_id=? AND i.created_by=? ORDER BY i.id DESC LIMIT 1');
    $q->bind_param('ii',$poId,$buyerId);$q->execute();$v=$q->get_result()->fetch_assoc();$q->close();return $v?:null;
}
function ilInvoiceLines(mysqli $db,int $invoiceId): array {
    $q=$db->prepare('SELECT id,po_item_id,item_name,unit,qty_billed,unit_price,subtotal FROM invoice_items WHERE invoice_id=? ORDER BY id');
    $q->bind_param('i',$invoiceId);$q->execute();$v=$q->get_result()->fetch_all(MYSQLI_ASSOC);$q->close();return $v;
}
function ilMatch(mysqli $db,array $po,array $poItems,?array $invoice, array $lines): array {
    $messages=[];$itemResults=[];$all=true;
    $check=function(bool $pass,string $message) use (&$messages,&$all): void {
        $messages[]=['passed'=>$pass,'message'=>$message];
        if(!$pass)$all=false;
    };
    $poId=(int)$po['id'];$receiptTotals=ilReceiptTotals($db,$poId,(string)$po['po_number']);
    $receipts=ilReceiptNumbers($db,$poId,(string)$po['po_number']);
    $check(strtolower((string)$po['status'])==='received','Purchase Order status is Received.');
    $check(count($receipts)>0,'At least one real Inventory Goods Receipt exists (GR-TEST excluded).');
    $byPoId=[];$lineCount=[];$sumInvoiceCents=0;
    foreach($lines as $line) {
        $id=(int)$line['po_item_id'];$lineCount[$id]=($lineCount[$id]??0)+1;
        try {
            $q=ilMoneyCents((string)$line['qty_billed']);
            $p=ilMoneyCents((string)$line['unit_price']);
            $sumInvoiceCents+=ilLineCents($q,$p);
        } catch(Throwable $e) {$all=false;continue;}
        $byPoId[$id]=$line;
    }
    $check(count($poItems)>0 && count($lines)===count($poItems), 'Invoice contains exactly one line per ordered PO item.');
    foreach($poItems as $line) {
        $id=(int)$line['po_item_id'];$inv=$byPoId[$id]??null;
        $gr=(float)($receiptTotals[$id]['accepted']??0);
        $ordered=(float)$line['qty_ordered'];$received=(float)$line['qty_received'];
        $validGR=abs($ordered-$received)<0.001&&abs($received-$gr)<0.001;
        $quantityOK=$inv && abs((float)$inv['qty_billed']-$gr)<0.001;
        $priceOK=$inv && abs((float)$inv['unit_price']-(float)$line['unit_price'])<0.001;
        $itemOK=$inv && $inv['item_name']===$line['item_name'] && $inv['unit']===$line['unit'] && ($lineCount[$id]??0)===1;
        $all=$all && $validGR && $quantityOK && $priceOK && $itemOK;
        $itemResults[]=['po_item_id'=>$id,'item_name'=>$line['item_name'],
            'po_qty'=>$ordered,'po_received'=>$received,'real_gr_accepted'=>$gr,
            'invoice_qty'=>$inv?$inv['qty_billed']:null,'po_unit_price'=>$line['unit_price'],
            'invoice_unit_price'=>$inv?$inv['unit_price']:null,
            'receipt_matched'=>$validGR,'invoice_quantity_matched'=>(bool)$quantityOK,
            'price_matched'=>(bool)$priceOK,'line_identity_matched'=>(bool)$itemOK];
    }
    if($invoice) {
        $check((int)$invoice['supplier_id']===(int)$po['supplier_id'],'Invoice supplier matches Purchase Order supplier.');
        $totalCents=ilMoneyCents((string)$invoice['total_amount']);
        $poCents=ilMoneyCents((string)$po['total_amount']);
        $check($sumInvoiceCents===$totalCents,'Invoice line sum equals the supplier-stated invoice total.');
        $check($poCents===$totalCents,'Invoice total equals stored PO total (pre-VAT; tax handling not implemented).');
        $check((string)$invoice['invoice_date']>=(string)$po['order_date'],'Invoice date is not before PO date.');
        $check((string)$invoice['due_date']>=(string)$invoice['invoice_date'],'Due date is not earlier than Invoice date.');
    } else {
        $check(false,'Supplier invoice has not been recorded yet.');
    }
    return ['data_matched'=>$all,'checks'=>$messages,'items'=>$itemResults,'real_receipts'=>$receipts,
        'supplier_document_verified'=>(bool)($invoice && ($invoice['source_kind']??'')==='supplier_document' && (int)($invoice['document_checked']??0)===1),
        'pre_vat_only'=>true];
}
function ilLocalGuard(): void {
    $host=strtolower(trim((string)($_SERVER['HTTP_HOST']??'')));
    if(!preg_match('/\A(?:localhost|127\.0\.0\.1)(?::\d+)?\z/',$host)
       || !in_array((string)($_SERVER['REMOTE_ADDR']??''),['127.0.0.1','::1'],true)) {
        ilReply(403,['success'=>false,'message'=>'This local test is disabled outside localhost. Do not use over Radmin.']);
    }
}

ilLocalGuard();
$method=(string)($_SERVER['REQUEST_METHOD']??'');
if(!in_array($method,['GET','POST'],true))ilReply(405,['success'=>false,'message'=>'GET or POST only.']);
$transaction=false;
try {
    $buyer=buyerPoIdentity($conn);$buyerId=(int)$buyer['id'];
    if($method==='GET') {
        if(empty($_SESSION['buyer_invoice_local_csrf']))$_SESSION['buyer_invoice_local_csrf']=bin2hex(random_bytes(32));
        $list=$conn->prepare("SELECT po.po_number,LOWER(po.status) AS status,s.name AS supplier_name
            FROM purchase_orders po JOIN rfqs r ON r.id=po.rfq_id
            JOIN purchase_requisitions pr ON pr.id=r.pr_id JOIN suppliers s ON s.id=po.supplier_id
            WHERE po.created_by=? AND r.created_by=? AND pr.created_by=? AND LOWER(po.status) IN ('received','partial')
            ORDER BY po.id DESC LIMIT 40");
        $list->bind_param('iii',$buyerId,$buyerId,$buyerId);$list->execute();
        $orders=$list->get_result()->fetch_all(MYSQLI_ASSOC);$list->close();
        $number=trim((string)($_GET['po_number']??''));
        if($number==='')$number=(string)($orders[0]['po_number']??'');
        if($number!==''&&!preg_match('/\APO-[A-Za-z0-9-]{1,26}\z/',$number))ilReply(422,['success'=>false,'message'=>'Invalid PO number.']);
        $po=$number!==''?ilPo($conn,$buyerId,$number):null;
        if($number!==''&&!$po)ilReply(404,['success'=>false,'message'=>'Purchase Order not found for this Buyer.']);
        $items=$po?ilPoItems($conn,(int)$po['id']):[];
        $invoice=$po?ilInvoice($conn,(int)$po['id'],$buyerId):null;
        $lines=$invoice?ilInvoiceLines($conn,(int)$invoice['id']):[];
        $match=$po?ilMatch($conn,$po,$items,$invoice,$lines):null;
        ilReply(200,['success'=>true,'local_only'=>true,'finance_posting_enabled'=>false,
            'csrf_token'=>(string)$_SESSION['buyer_invoice_local_csrf'], 'orders'=>$orders,
            'po'=>$po,'po_items'=>$items,'invoice'=>$invoice,'invoice_items'=>$lines,'match'=>$match]);
    }
    if(stripos((string)($_SERVER['CONTENT_TYPE']??''),'application/json')!==0)
        ilReply(415,['success'=>false,'message'=>'Send JSON.']);
    $token=(string)($_SERVER['HTTP_X_CSRF_TOKEN']??'');
    if($token===''||!hash_equals((string)($_SESSION['buyer_invoice_local_csrf']??''),$token))
        ilReply(419,['success'=>false,'message'=>'Session verification expired. Reload this page.']);
    $body=json_decode(file_get_contents('php://input')?:'',true);
    if(!is_array($body))ilReply(400,['success'=>false,'message'=>'Invalid request JSON.']);
    $action=(string)($body['action']??'');
    if(!in_array($action,['save','verify'],true))ilReply(422,['success'=>false,'message'=>'Invalid action.']);
    $number=trim((string)($body['po_number']??''));
    if(!preg_match('/\APO-[A-Za-z0-9-]{1,26}\z/',$number))ilReply(422,['success'=>false,'message'=>'Valid PO number required.']);
    $po=ilPo($conn,$buyerId,$number);
    if(!$po)ilReply(404,['success'=>false,'message'=>'PO not found for this Buyer.']);
    if(!in_array(strtolower((string)$po['status']),['received','partial'],true))ilReply(409,['success'=>false,'message'=>'PO must have real Goods Receipts first.']);
    $poId=(int)$po['id'];
    $conn->begin_transaction();$transaction=true;
    // Serialize invoice create/verify for this PO, preventing duplicate clicks.
    $lock=$conn->prepare('SELECT id FROM purchase_orders WHERE id=? FOR UPDATE');
    $lock->bind_param('i',$poId);$lock->execute();$lock->get_result()->fetch_assoc();$lock->close();
    // Re-read the PO after locking it, so matching never uses a stale status/total.
    $po=ilPo($conn,$buyerId,$number);
    if(!$po || !in_array(strtolower((string)$po['status']),['received','partial'],true))
        throw new DomainException('PO is no longer eligible for Invoice verification.');
    $old=ilInvoice($conn,$poId,$buyerId);
    $poItems=ilPoItems($conn,$poId);
    if($action==='save') {
        $ref=trim((string)($body['supplier_invoice_reference']??''));
        $source=(string)($body['source_kind']??'demo');
        $notes=trim((string)($body['source_notes']??''));
        $checked=($body['document_checked']??false)===true;
        $invDate=(string)($body['invoice_date']??'');$dueDate=(string)($body['due_date']??'');
        if(!preg_match('/\A[A-Za-z0-9][A-Za-z0-9._\/-]{2,79}\z/',$ref))
            throw new DomainException('Enter a supplier invoice reference (3–80 characters, letters/numbers and . _ / -).');
        if(!in_array($source,['demo','supplier_document'],true))throw new DomainException('Choose a valid invoice source.');
        if($source==='supplier_document'&&!$checked)
            throw new DomainException('Confirm you personally checked the actual supplier invoice document.');
        if(strlen($notes)>255)throw new DomainException('Notes must be 255 characters or fewer.');
        if(!ilStringDate($invDate)||!ilStringDate($dueDate)||$dueDate<$invDate)
            throw new DomainException('Enter valid Invoice and Due dates (Due not before Invoice).');
        $cents=ilMoneyCents($body['total_amount']??'');
        if($cents>999999999999)throw new DomainException('Invoice amount is too large.');
        $lines=$body['items']??null;
        if(!is_array($lines)||count($lines)!==count($poItems)||count($poItems)===0)
            throw new DomainException('Invoice must contain exactly one line per PO item.');
        $received=[];$sum=0;$byId=[];
        foreach($poItems as $item)$byId[(int)$item['po_item_id']]=$item;
        foreach($lines as $line) {
            if(!is_array($line))throw new DomainException('Invalid Invoice line.');
            $id=filter_var($line['po_item_id']??null,FILTER_VALIDATE_INT);
            if(!$id||!isset($byId[$id])||isset($received[$id]))throw new DomainException('Duplicate or unrelated PO line in Invoice.');
            $received[$id]=true;
            $qty=ilMoneyCents($line['qty_billed']??'');
            $price=ilMoneyCents($line['unit_price']??'');
            $sum+=ilLineCents($qty,$price);
            if($sum>999999999999)throw new DomainException('Invoice line total is too large.');
        }
        // Discrepancies are saved pending_match; the separate verification action explains them.
        if($old && !in_array(strtolower((string)$old['status']),['pending_match','discrepancy'],true))
            ilReply(409,['success'=>false,'message'=>'This invoice is locked. Ready/posted invoices cannot be edited in this local demo.']);
        $total=ilCentsText($cents);$srcChecked=($source==='supplier_document'&&$checked)?1:0;
        if($old) {
            $id=(int)$old['id'];
            $q=$conn->prepare("UPDATE invoices SET invoice_date=?,due_date=?,total_amount=?,status='pending_match' WHERE id=? AND created_by=?");
            $q->bind_param('sssii',$invDate,$dueDate,$total,$id,$buyerId);$q->execute();$q->close();
            $q=$conn->prepare('DELETE FROM invoice_items WHERE invoice_id=?');$q->bind_param('i',$id);$q->execute();$q->close();
            // For existing invoice without local source metadata, insert below via upsert.
        } else {
            $tmp='TMP-'.bin2hex(random_bytes(9));$status='pending_match';
            $supplierId=(int)$po['supplier_id'];
            $q=$conn->prepare('INSERT INTO invoices(invoice_number,po_id,supplier_id,created_by,invoice_date,due_date,total_amount,status) VALUES(?,?,?,?,?,?,?,?)');
            $q->bind_param('siiissss',$tmp,$poId,$supplierId,$buyerId,$invDate,$dueDate,$total,$status);
            $q->execute();$id=(int)$conn->insert_id;$q->close();
            $numberInternal='INV-'.date('Y').'-'.str_pad((string)$id,4,'0',STR_PAD_LEFT);
            $q=$conn->prepare('UPDATE invoices SET invoice_number=? WHERE id=?');
            $q->bind_param('si',$numberInternal,$id);$q->execute();$q->close();
        }
        $q=$conn->prepare('INSERT INTO invoice_items(invoice_id,po_item_id,item_name,unit,qty_billed,unit_price) VALUES(?,?,?,?,?,?)');
        foreach($lines as $line) {
            $itemId=(int)$line['po_item_id'];$poLine=$byId[$itemId];
            $itemName=(string)$poLine['item_name'];$unit=(string)$poLine['unit'];
            $qty=ilCentsText(ilMoneyCents($line['qty_billed']));
            $price=ilCentsText(ilMoneyCents($line['unit_price']));
            $q->bind_param('iissss',$id,$itemId,$itemName,$unit,$qty,$price);$q->execute();
        }$q->close();
        $supplierId=(int)$po['supplier_id'];
        $q=$conn->prepare("INSERT INTO buyer_invoice_source_local(invoice_id,supplier_id,supplier_invoice_reference,source_kind,source_notes,document_checked,match_status,match_summary,verified_at,verified_by)
            VALUES(?,?,?,?,?,?,'unverified','',NULL,NULL)
            ON DUPLICATE KEY UPDATE supplier_invoice_reference=VALUES(supplier_invoice_reference),source_kind=VALUES(source_kind),source_notes=VALUES(source_notes),document_checked=VALUES(document_checked),match_status='unverified',match_summary='',verified_at=NULL,verified_by=NULL");
        $q->bind_param('iisssi',$id,$supplierId,$ref,$source,$notes,$srcChecked);$q->execute();$q->close();
        $conn->commit();$transaction=false;
        ilReply(200,['success'=>true,'invoice_saved'=>true,'invoice_id'=>$id,'message'=>'Invoice saved as pending_match. Verify separately; no Finance posting.']);
    }
    if(!$old)ilReply(409,['success'=>false,'message'=>'Record the supplier invoice first.']);
    if(!in_array(strtolower((string)$old['status']),['pending_match','discrepancy','ready_to_post'],true))
        ilReply(409,['success'=>false,'message'=>'Posted or otherwise locked invoices cannot be verified here.']);
    if(($old['supplier_invoice_reference']??'')==='')
        ilReply(409,['success'=>false,'message'=>'Invoice has no local source record.']);
    $lines=ilInvoiceLines($conn,(int)$old['id']);
    $match=ilMatch($conn,$po,$poItems,$old,$lines);
    $ready=$match['data_matched'] && $match['supplier_document_verified'];
    $status=$ready?'ready_to_post':($match['data_matched']?'pending_match':'discrepancy');
    $matchStatus=$ready?'matched':($match['data_matched']?'data_only_demo':'discrepancy');
    $summary=$ready?'3-way match passed; manually checked supplier document':($match['data_matched']?'Data matches, but demo/unverified document; not eligible for Finance posting':'Mismatch detected; review PO/real GR/invoice details');
    $id=(int)$old['id'];$q=$conn->prepare('UPDATE invoices SET status=? WHERE id=? AND created_by=?');
    $q->bind_param('sii',$status,$id,$buyerId);$q->execute();$q->close();
    $q=$conn->prepare('UPDATE buyer_invoice_source_local SET match_status=?,match_summary=?,verified_at=NOW(),verified_by=? WHERE invoice_id=?');
    $q->bind_param('ssii',$matchStatus,$summary,$buyerId,$id);$q->execute();$q->close();
    $conn->commit();$transaction=false;
    ilReply(200,['success'=>true,'status'=>$status,'data_matched'=>$match['data_matched'],
        'supplier_document_verified'=>$match['supplier_document_verified'],
        'finance_posting_enabled'=>false,'message'=>$summary,'match'=>$match]);
} catch(DomainException $e) {
    if($transaction){try{$conn->rollback();}catch(Throwable $ignored){}}
    ilReply(422,['success'=>false,'message'=>$e->getMessage()]);
} catch(mysqli_sql_exception $e) {
    if($transaction){try{$conn->rollback();}catch(Throwable $ignored){}}
    error_log('Buyer invoice local db: '.$e->getMessage());
    if((int)$e->getCode()===1062)ilReply(409,['success'=>false,'message'=>'Supplier invoice reference already exists or invoice number is duplicated.']);
    ilReply(500,['success'=>false,'message'=>'Database request failed. Check migration, table schema and Apache/PHP logs.']);
} catch(Throwable $e) {
    if($transaction){try{$conn->rollback();}catch(Throwable $ignored){}}
    error_log('Buyer invoice local: '.$e->getMessage());
    ilReply(500,['success'=>false,'message'=>'Invoice integration failed; inspect Apache/PHP error log. No Finance posting was attempted.']);
}

<?php
/** Buyer-side Procurement outbox: queue a verified real-supplier invoice for Finance pickup.
 * It NEVER writes Finance DB, deducts budget, or marks invoices posted.
 * Classroom demo invoices are refused server-side even if status=ready_to_post.
 */
declare(strict_types=1);
date_default_timezone_set('Asia/Manila');
require_once __DIR__ . '/buyer-po-common.php';
require_once __DIR__ . '/finance-invoice-handoff-common.php';
header('X-Content-Type-Options: nosniff');
$inTransaction=false;
try {
    $method=(string)($_SERVER['REQUEST_METHOD']??'');
    if (!in_array($method,['GET','POST'],true)) buyerPoJson(405,['success'=>false,'message'=>'GET or POST required.']);
    $buyer=buyerPoIdentity($conn);$buyerId=(int)$buyer['id'];
    if (empty($_SESSION['buyer_invoice_finance_csrf'])) $_SESSION['buyer_invoice_finance_csrf']=bin2hex(random_bytes(32));
    if ($method==='GET') $number=(string)($_GET['invoice_number']??'');
    else {
        if (stripos((string)($_SERVER['CONTENT_TYPE']??''),'application/json')!==0)
            buyerPoJson(415,['success'=>false,'message'=>'JSON required.']);
        $token=(string)($_SERVER['HTTP_X_CSRF_TOKEN']??'');
        if ($token===''||!hash_equals((string)$_SESSION['buyer_invoice_finance_csrf'],$token))
            buyerPoJson(419,['success'=>false,'message'=>'Session expired. Reload View Invoice.']);
        $body=json_decode(file_get_contents('php://input')?:'',true);
        if (!is_array($body)||json_last_error()!==JSON_ERROR_NONE)
            buyerPoJson(400,['success'=>false,'message'=>'Invalid JSON.']);
        $number=$body['invoice_number']??'';
        if (($body['confirm_queue_only']??null)!==true)
            buyerPoJson(422,['success'=>false,'message'=>'Confirm this is a Procurement-to-Finance queue submission, not an accounting posting.']);
    }
    if (!is_string($number)||!preg_match('/\A[A-Za-z0-9][A-Za-z0-9._-]{0,63}\z/D',$number))
        buyerPoJson(422,['success'=>false,'message'=>'Valid invoice number required.']);
    $invoice=fihInvoice($conn,$number,$buyerId);
    if (!$invoice) buyerPoJson(404,['success'=>false,'message'=>'Invoice not found for active Buyer.']);
    if ($method==='GET') {
        $q=$conn->prepare('SELECT request_ref,request_version,handoff_status,submitted_at,decided_at,finance_reference,finance_note FROM procurement_finance_invoice_handoffs WHERE invoice_id=? LIMIT 1');
        $invoiceId=(int)$invoice['invoice_id'];$q->bind_param('i',$invoiceId);$q->execute();$handoff=$q->get_result()->fetch_assoc();$q->close();
        $eligible=false;$reason='';
        if ($handoff) {
            $reason=match ($handoff['handoff_status']) {
                'pending'=>'Queued in Procurement; awaiting Finance pickup.',
                'received'=>'Finance acknowledged receipt; accounting posting still pending.',
                'posted'=>'Finance confirmed accounting posting.',
                'rejected'=>'Finance rejected this handoff. Review the reason and correct the record before resubmitting (not enabled by this patch).',
                default=>'Finance handoff already exists.'
            };
        } else {
            try { fihVerifiedSnapshot($conn,$invoice);$eligible=true;$reason='Verified numerical match and buyer-declared document review; eligible for Procurement queue.'; }
            catch(DomainException $e) {$reason=$e->getMessage();}
            catch(Throwable $e) {error_log('Invoice handoff eligibility: '.$e->getMessage());$reason='Posted Inventory GR verification unavailable. Handoff is blocked until local Inventory data is accessible.';}
        }
        buyerPoJson(200,['success'=>true,'invoice_number'=>$number,'invoice_status'=>$invoice['invoice_status'],
            'is_demo'=>($invoice['source_kind']??'')==='demo','eligible_for_queue'=>$eligible,
            'reason'=>$reason,'handoff'=>$handoff?:null,
            'csrf_token'=>(string)$_SESSION['buyer_invoice_finance_csrf'],
            'actual_finance_connection'=>false,
            'note'=>'Queue is local Procurement only. Finance team must fetch and independently verify supplier documents and tax.']);
    }
    $conn->begin_transaction();$inTransaction=true;
    // Serialize duplicate Buyer clicks for the same invoice.
    $q=$conn->prepare('SELECT id FROM invoices WHERE id=? AND created_by=? FOR UPDATE');
    $invoiceId=(int)$invoice['invoice_id'];$q->bind_param('ii',$invoiceId,$buyerId);$q->execute();$locked=$q->get_result()->fetch_assoc();$q->close();
    if (!$locked) throw new DomainException('Invoice is no longer accessible.');
    $invoice=fihInvoice($conn,$number,$buyerId);
    $q=$conn->prepare('SELECT request_ref,handoff_status FROM procurement_finance_invoice_handoffs WHERE invoice_id=? FOR UPDATE');
    $q->bind_param('i',$invoiceId);$q->execute();$already=$q->get_result()->fetch_assoc();$q->close();
    if ($already) {
        $conn->commit();$inTransaction=false;
        if ($already['handoff_status']==='rejected') buyerPoJson(409,['success'=>false,'message'=>'Finance rejected this record. Resubmission requires manual remediation; never silently reuse a rejected handoff.']);
        buyerPoJson(200,['success'=>true,'already_queued'=>true,'handoff_status'=>$already['handoff_status'],'request_ref'=>$already['request_ref'],
            'message'=>'This invoice already has a Finance handoff. No duplicate created.']);
    }
    $snapshot=fihVerifiedSnapshot($conn,$invoice); // Fails closed for demo, missing/changed GR or docs.
    $json=json_encode($snapshot,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR);
    $sha=hash('sha256',$json);$ref=bin2hex(random_bytes(16));$poId=(int)$invoice['po_id'];
    $stmt=$conn->prepare("INSERT INTO procurement_finance_invoice_handoffs
      (invoice_id,invoice_number,po_id,buyer_id,request_ref,request_version,handoff_status,snapshot_sha256,snapshot_json)
      VALUES (?,?,?,?,?,1,'pending',?,?)");
    $stmt->bind_param('isiisss',$invoiceId,$number,$poId,$buyerId,$ref,$sha,$json);
    $stmt->execute();$id=(int)$conn->insert_id;$stmt->close();
    $actor='buyer:'.$buyerId;$event='submitted';$note='Verified local numerical 3-way match; buyer-declared document review. Tax and genuine documents require Finance review.';
    $stmt=$conn->prepare('INSERT INTO procurement_finance_invoice_events
        (handoff_id,invoice_id,request_version,event_kind,actor_ref,note) VALUES (?,?,1,?,?,?)');
    $stmt->bind_param('iisss',$id,$invoiceId,$event,$actor,$note);$stmt->execute();$stmt->close();
    $conn->commit();$inTransaction=false;
    buyerPoJson(200,['success'=>true,'request_ref'=>$ref,'handoff_status'=>'pending',
        'queued_locally'=>true,'finance_posted'=>false,
        'message'=>'Invoice queued in Procurement for Finance team pickup. No Finance ledger entry/payment has been recorded.']);
} catch(DomainException $e) {
    if($inTransaction)$conn->rollback();
    buyerPoJson(409,['success'=>false,'message'=>$e->getMessage()]);
} catch(Throwable $e) {
    if($inTransaction){try{$conn->rollback();}catch(Throwable $ignored){}}
    error_log('Buyer Finance invoice queue: '.$e->getMessage());
    buyerPoJson(500,['success'=>false,'message'=>'Finance invoice handoff failed. Check SQL migration and PHP/Inventory logs. No Finance posting was attempted.']);
}

<?php
/** PROCUREMENT-side API for Finance team's future integrator.
 * Finance must GET queued invoice snapshots and POST acknowledgments.
 * This endpoint DOES NOT write to the Finance database or initiate payment.
 * Reuses the independent per-install secret from finance-quote-api.php.
 */
declare(strict_types=1);
date_default_timezone_set('Asia/Manila');
require_once __DIR__ . '/procurement_db_connection.php';
require_once __DIR__ . '/finance-invoice-handoff-common.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
function fiaReply(int $code,array $data): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
    exit;
}
function fiaAuth(): void {
    $file=getenv('UNIPROCUR_FINANCE_TOKEN_FILE') ?: dirname(__DIR__,3).'/uniprocur_secrets/finance_integration_token.txt';
    $expected=is_file($file)?trim((string)@file_get_contents($file)):'';
    $provided=trim((string)($_SERVER['HTTP_X_FINANCE_INTEGRATION_KEY']??''));
    if(!preg_match('/\A[a-fA-F0-9]{64}\z/D',$expected))fiaReply(503,['success'=>false,'message'=>'Procurement Finance integration key not configured.']);
    if(!preg_match('/\A[a-fA-F0-9]{64}\z/D',$provided)||!hash_equals(strtolower($expected),strtolower($provided)))
        fiaReply(401,['success'=>false,'message'=>'Valid Finance integration key required.']);
}
function fiaField(mixed $v,string $name,int $min,int $max): string {
    if(!is_string($v)||strlen(trim($v))<$min||strlen($v)>$max||!preg_match('/\A[A-Za-z0-9._@:\-]+\z/D',$v))
        fiaReply(422,['success'=>false,'message'=>'Invalid '.$name.'.']);
    return $v;
}
$started=false;
try {
    $method=(string)($_SERVER['REQUEST_METHOD']??'');
    if(!in_array($method,['GET','POST'],true))fiaReply(405,['success'=>false,'message'=>'GET/POST only.']);
    fiaAuth();
    if($method==='GET') {
        $status=(string)($_GET['status']??'pending');
        if(!in_array($status,['pending','received','posted','rejected','all'],true))
            fiaReply(422,['success'=>false,'message'=>'status must be pending, received, posted, rejected or all.']);
        $sql="SELECT h.request_ref,h.request_version,h.handoff_status,h.snapshot_sha256,
                  h.snapshot_json,h.submitted_at,h.updated_at,h.finance_reference,h.decided_at,
                  h.finance_note
               FROM procurement_finance_invoice_handoffs h
               WHERE (?='all' OR h.handoff_status=?) ORDER BY h.submitted_at DESC,h.id DESC LIMIT 50";
        $q=$conn->prepare($sql);$q->bind_param('ss',$status,$status);$q->execute();$rows=$q->get_result()->fetch_all(MYSQLI_ASSOC);$q->close();
        foreach($rows as &$row) {
            $row['request_version']=(int)$row['request_version'];
            $row['invoice_snapshot']=json_decode((string)$row['snapshot_json'],true);
            unset($row['snapshot_json']);
        }unset($row);
        fiaReply(200,['success'=>true,'count'=>count($rows),'max_results'=>50,'finance_requests'=>$rows,
            'note'=>'Snapshots are buyer-submitted pre-VAT data only. Finance must independently review tax and genuine supplier documents before posting.']);
    }
    if(stripos((string)($_SERVER['CONTENT_TYPE']??''),'application/json')!==0)
        fiaReply(415,['success'=>false,'message'=>'JSON required.']);
    $body=json_decode(file_get_contents('php://input')?:'',true);
    if(!is_array($body)||json_last_error()!==JSON_ERROR_NONE)fiaReply(400,['success'=>false,'message'=>'Invalid JSON.']);
    $ref=$body['request_ref']??null;
    if(!is_string($ref)||!preg_match('/\A[a-f0-9]{32}\z/D',$ref))fiaReply(422,['success'=>false,'message'=>'Invalid request_ref.']);
    $version=filter_var($body['request_version']??null,FILTER_VALIDATE_INT);
    $sha=$body['snapshot_sha256']??null;
    if(!$version||$version<1||!is_string($sha)||!preg_match('/\A[a-f0-9]{64}\z/D',$sha))
        fiaReply(422,['success'=>false,'message'=>'Valid request version and snapshot hash required.']);
    $status=$body['status']??null;
    if(!is_string($status)||!in_array($status,['received','posted','rejected'],true))
        fiaReply(422,['success'=>false,'message'=>'Finance status must be received, posted or rejected.']);
    $decisionRef=fiaField($body['decision_reference']??null,'decision_reference',6,100);
    $reviewer=fiaField($body['reviewer_ref']??null,'reviewer_ref',3,100);
    $finReference=$body['finance_reference']??'';
    if($finReference!=='' )$finReference=fiaField($finReference,'finance_reference',3,100);
    if($status==='posted'&&$finReference==='')fiaReply(422,['success'=>false,'message'=>'Finance accounting reference required for posted.']);
    $note=$body['note']??'';
    if(!is_string($note)||strlen($note)>500||($status==='rejected'&&trim($note)===''))
        fiaReply(422,['success'=>false,'message'=>'Rejection requires a note, maximum 500 characters.']);

    $conn->begin_transaction();$started=true;
    $q=$conn->prepare('SELECT * FROM procurement_finance_invoice_handoffs WHERE request_ref=? FOR UPDATE');
    $q->bind_param('s',$ref);$q->execute();$h=$q->get_result()->fetch_assoc();$q->close();
    if(!$h){$conn->rollback();$started=false;fiaReply(404,['success'=>false,'message'=>'Handoff not found.']);}
    if((int)$h['request_version']!==$version||!hash_equals((string)$h['snapshot_sha256'],$sha)){
        $conn->rollback();$started=false;fiaReply(409,['success'=>false,'message'=>'Stale request/version/snapshot. Re-fetch Finance queue.']);
    }
    $before=(string)$h['handoff_status'];
    if($before===$status&&$h['decision_reference']===$decisionRef){
        $conn->rollback();$started=false;fiaReply(200,['success'=>true,'idempotent'=>true,'status'=>$status,'request_ref'=>$ref]);
    }
    if(!in_array($before,['pending','received'],true)||($before==='pending'&&$status==='posted')||($before==='received'&&$status==='received')){
        $conn->rollback();$started=false;
        fiaReply(409,['success'=>false,'message'=>'Invalid Finance transition. Use pending -> received -> posted, or reject pending/received.']);
    }
    // Prevent reuse of a decision id across different requests.
    $q=$conn->prepare('SELECT id FROM procurement_finance_invoice_events WHERE decision_reference=? LIMIT 1');
    $q->bind_param('s',$decisionRef);$q->execute();$taken=$q->get_result()->fetch_assoc();$q->close();
    if($taken){$conn->rollback();$started=false;fiaReply(409,['success'=>false,'message'=>'Decision reference already used.']);}
    $invoiceId=(int)$h['invoice_id'];
    if($status==='posted') {
        $inv=fihInvoice($conn,(string)$h['invoice_number'],(int)$h['buyer_id']);
        if(!$inv||strtolower((string)$inv['invoice_status'])!=='ready_to_post')
            throw new DomainException('Invoice is no longer Ready to Post. Finance posting blocked.');
        // Rerun the exact local PO–GR–Invoice validation before changing Procurement status.
        $snapshot=fihVerifiedSnapshot($conn,$inv);
        $currentHash=hash('sha256',json_encode($snapshot,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR));
        if(!hash_equals((string)$h['snapshot_sha256'],$currentHash))
            throw new DomainException('Invoice or receiving data changed since Finance handoff; posting blocked.');
        $q=$conn->prepare("UPDATE invoices SET status='posted' WHERE id=? AND status='ready_to_post'");
        $q->bind_param('i',$invoiceId);$q->execute();$changed=$q->affected_rows;$q->close();
        if($changed!==1)throw new DomainException('Invoice status changed during posting.');
    }
    $id=(int)$h['id'];
    $q=$conn->prepare('UPDATE procurement_finance_invoice_handoffs
      SET handoff_status=?,updated_at=NOW(),finance_reference=?,finance_reviewer=?,finance_note=?,decision_reference=?,decided_at=NOW()
      WHERE id=? AND handoff_status=?');
    $q->bind_param('sssssis',$status,$finReference,$reviewer,$note,$decisionRef,$id,$before);
    $q->execute();$updated=$q->affected_rows;$q->close();
    if($updated!==1)throw new RuntimeException('Finance handoff state changed.');
    $q=$conn->prepare('INSERT INTO procurement_finance_invoice_events
       (handoff_id,invoice_id,request_version,event_kind,decision_reference,actor_ref,note)
       VALUES (?,?,?,?,?,?,?)');
    $q->bind_param('iiissss',$id,$invoiceId,$version,$status,$decisionRef,$reviewer,$note);$q->execute();$q->close();
    $conn->commit();$started=false;
    fiaReply(200,['success'=>true,'request_ref'=>$ref,'status'=>$status,'invoice_number'=>$h['invoice_number'],
      'procurement_invoice_posted'=>$status==='posted',
      'note'=>$status==='posted'?'Finance reported posting; Procurement invoice status updated. Actual Finance ledger must be recorded by Finance.':'Finance decision saved in Procurement only.']);
} catch(DomainException $e) {
    if($started)$conn->rollback();
    fiaReply(409,['success'=>false,'message'=>$e->getMessage()]);
} catch(Throwable $e) {
    if($started){try{$conn->rollback();}catch(Throwable $ignored){}}
    error_log('Finance invoice API: '.$e->getMessage());
    fiaReply(500,['success'=>false,'message'=>'Finance invoice API failed. Check SQL migration, Inventory availability and PHP logs.']);
}

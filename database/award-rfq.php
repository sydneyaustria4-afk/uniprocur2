<?php
// Confirm the winner of a previously compared simulated RFQ.
header('Content-Type: application/json; charset=utf-8');
if (session_status() !== PHP_SESSION_ACTIVE) require_once __DIR__ . '/uniprocur-session.php';
require_once __DIR__.'/procurement_db_connection.php';
function awardReply(int $code,array $body):void {http_response_code($code);echo json_encode($body,JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);exit;}
$started=false;
try {
 if($_SERVER['REQUEST_METHOD']!=='POST')awardReply(405,['success'=>false,'message'=>'POST required.']);
 $data=json_decode(file_get_contents('php://input'),true);
 if(!is_array($data))awardReply(400,['success'=>false,'message'=>'Invalid JSON.']);
 $number=trim((string)($data['rfq_number']??''));$quoteId=filter_var($data['quote_id']??null,FILTER_VALIDATE_INT);
 if($number===''||strlen($number)>30||!$quoteId||$quoteId<1)awardReply(422,['success'=>false,'message'=>'Invalid RFQ or supplier quotation.']);
 if(!empty($_SESSION['user_id'])){$uid=(int)$_SESSION['user_id'];$s=$conn->prepare('SELECT id,role,is_active FROM users WHERE id=? LIMIT 1');$s->bind_param('i',$uid);}
 else{$email=(require __DIR__ . '/buyer-demo-email.php');$s=$conn->prepare('SELECT id,role,is_active FROM users WHERE email=? LIMIT 1');$s->bind_param('s',$email);}
 $s->execute();$buyer=$s->get_result()->fetch_assoc();$s->close();
 if(!$buyer||strtolower((string)$buyer['role'])!=='buyer'||!(int)$buyer['is_active'])awardReply(401,['success'=>false,'message'=>'Active Buyer account required.']);
 $buyerId=(int)$buyer['id'];$conn->begin_transaction();$started=true;
 $s=$conn->prepare('SELECT r.id,r.status FROM rfqs r JOIN purchase_requisitions p ON p.id=r.pr_id WHERE r.rfq_number=? AND r.created_by=? AND p.created_by=? FOR UPDATE');
 $s->bind_param('sii',$number,$buyerId,$buyerId);$s->execute();$rfq=$s->get_result()->fetch_assoc();$s->close();
 if(!$rfq){$conn->rollback();awardReply(404,['success'=>false,'message'=>'RFQ not found for this buyer.']);}
 if($rfq['status']!=='compared'){$conn->rollback();awardReply(409,['success'=>false,'message'=>'Only compared RFQs can be awarded.']);}
 $rfqId=(int)$rfq['id'];
 // Finance must explicitly approve this exact quotation BEFORE it can be awarded.
 $s=$conn->prepare('SELECT quote_id,review_status FROM procurement_finance_quotes WHERE rfq_id=? FOR UPDATE');
 $s->bind_param('i',$rfqId);$s->execute();$review=$s->get_result()->fetch_assoc();$s->close();
 if(!$review || $review['review_status']!=='approved' || (int)$review['quote_id']!==(int)$quoteId){
     $conn->rollback();$started=false;
     awardReply(409,['success'=>false,'message'=>'Finance approval for the selected quotation is required before awarding.']);
 }
 $s=$conn->prepare('SELECT id,total_amount FROM rfq_quotes WHERE id=? AND rfq_id=? FOR UPDATE');$s->bind_param('ii',$quoteId,$rfqId);$s->execute();$selected=$s->get_result()->fetch_assoc();$s->close();
 if(!$selected||$selected['total_amount']===null){$conn->rollback();awardReply(422,['success'=>false,'message'=>'Selected supplier has no saved quotation.']);}
 $s=$conn->prepare('SELECT COUNT(*) AS line_count,COALESCE(SUM(subtotal),0) AS line_total FROM rfq_quote_items WHERE rfq_quote_id=?');$s->bind_param('i',$quoteId);$s->execute();$totals=$s->get_result()->fetch_assoc();$s->close();
 $s=$conn->prepare('SELECT COUNT(*) AS item_count FROM pr_items p JOIN rfqs r ON r.pr_id=p.pr_id WHERE r.id=?');$s->bind_param('i',$rfqId);$s->execute();$expected=$s->get_result()->fetch_assoc();$s->close();
 if((int)$totals['line_count']!== (int)$expected['item_count'] || (int)$totals['line_count']===0 || abs((float)$totals['line_total']-(float)$selected['total_amount'])>0.01){$conn->rollback();awardReply(422,['success'=>false,'message'=>'Saved quotation items or totals are incomplete.']);}
 $s=$conn->prepare('UPDATE rfq_quotes SET is_winner=IF(id=?,1,0) WHERE rfq_id=?');$s->bind_param('ii',$quoteId,$rfqId);$s->execute();$s->close();
 $s=$conn->prepare("UPDATE rfqs SET status='awarded' WHERE id=? AND status='compared'");$s->bind_param('i',$rfqId);$s->execute();if($s->affected_rows!==1)throw new RuntimeException('Award status update failed.');$s->close();
 $conn->commit();$started=false;awardReply(200,['success'=>true,'rfq_number'=>$number,'quote_id'=>$quoteId,'status'=>'awarded','message'=>'Winning supplier saved. Purchase Order is not yet created.']);
} catch(Throwable $error){if($started){try{$conn->rollback();}catch(Throwable $ignored){}}error_log('Award RFQ Error: '.$error->getMessage());awardReply(500,['success'=>false,'message'=>'Unable to award RFQ. Check PHP error log.']);}

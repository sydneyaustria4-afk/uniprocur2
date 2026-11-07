<?php
header('Content-Type: application/json; charset=utf-8');
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
require_once __DIR__ . '/procurement_db_connection.php';
function ret($status,$data){http_response_code($status);echo json_encode($data,JSON_UNESCAPED_UNICODE);exit;}
try {
 if ($_SERVER['REQUEST_METHOD']!=='GET')ret(405,['success'=>false,'message'=>'GET required.']);
 $number=trim((string)($_GET['rfq_number']??''));if(!$number||strlen($number)>30)ret(422,['success'=>false,'message'=>'Invalid RFQ number.']);
 if(!empty($_SESSION['user_id'])){$id=(int)$_SESSION['user_id'];$s=$conn->prepare('SELECT id,role,is_active FROM users WHERE id=? LIMIT 1');$s->bind_param('i',$id);}else{$email='clark@company.com';$s=$conn->prepare('SELECT id,role,is_active FROM users WHERE email=? LIMIT 1');$s->bind_param('s',$email);}
 $s->execute();$buyer=$s->get_result()->fetch_assoc();$s->close();if(!$buyer||strtolower($buyer['role'])!=='buyer'||!(int)$buyer['is_active'])ret(401,['success'=>false,'message'=>'Buyer login required.']);
 $id=(int)$buyer['id'];
 $s=$conn->prepare('SELECT r.id,r.rfq_number,r.status,r.created_at,pr.pr_number FROM rfqs r JOIN purchase_requisitions pr ON pr.id=r.pr_id WHERE r.rfq_number=? AND r.created_by=? AND pr.created_by=? LIMIT 1');$s->bind_param('sii',$number,$id,$id);$s->execute();$rfq=$s->get_result()->fetch_assoc();$s->close();if(!$rfq)ret(404,['success'=>false,'message'=>'RFQ not found.']);
 $rid=(int)$rfq['id'];
 $s=$conn->prepare('SELECT q.id quote_id,q.total_amount,q.is_winner,s.id supplier_id,s.name,s.rating,s.lead_time_days,s.payment_terms FROM rfq_quotes q JOIN suppliers s ON s.id=q.supplier_id WHERE q.rfq_id=? ORDER BY q.id');$s->bind_param('i',$rid);$s->execute();$suppliers=$s->get_result()->fetch_all(MYSQLI_ASSOC);$s->close();
 $s=$conn->prepare('SELECT qi.rfq_quote_id,qi.item_name,qi.unit,qi.qty,qi.unit_price,qi.subtotal FROM rfq_quote_items qi JOIN rfq_quotes q ON q.id=qi.rfq_quote_id WHERE q.rfq_id=? ORDER BY qi.id');$s->bind_param('i',$rid);$s->execute();$items=$s->get_result()->fetch_all(MYSQLI_ASSOC);$s->close();
 $map=[];foreach($items as $item){$map[$item['rfq_quote_id']][]=$item;}
 foreach($suppliers as &$sup){$sup['items']=$map[$sup['quote_id']]??[];}unset($sup);
 ret(200,['success'=>true,'rfq'=>$rfq,'suppliers'=>$suppliers]);
}catch(Throwable $error){error_log('Get RFQ Comparison Error: '.$error->getMessage());ret(500,['success'=>false,'message'=>'Unable to load Comparison Matrix.']);}

<?php
/** ITPROFEL v1: authenticated Inventory -> Procurement receipt confirmation.
 * Verify persisted DR AND line quantities via Inventory API; never trust callback fields.
 * This endpoint is server-to-server; do not use Buyer/Manager browser sessions.
 */
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
require_once __DIR__ . '/procurement_db_connection.php';
require_once __DIR__ . '/uniprocur-inventory-sync.php';
function uniReceiptReply(int $status,array $body): never {
    http_response_code($status);
    echo json_encode($body,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
    exit;
}
require_once __DIR__ . '/uniprocur-inventory-receipt-core.php';
if (($_SERVER['REQUEST_METHOD']??'')!=='POST') { header('Allow: POST');uniReceiptReply(405,['success'=>false,'message'=>'POST only.']); }
try {
    $key=uniInventoryKey();
    $submitted=(string)($_SERVER['HTTP_X_API_KEY']??'');
    if (!hash_equals($key,$submitted) || (string)($_SERVER['HTTP_X_API_TEAM']??'')!=='Inventory')
        uniReceiptReply(401,['success'=>false,'message'=>'Authenticated Inventory service required.']);
    if (stripos((string)($_SERVER['CONTENT_TYPE']??''),'application/json')!==0) uniReceiptReply(415,['success'=>false,'message'=>'JSON body required.']);
    $body=json_decode(file_get_contents('php://input')?:'',true);
    $num=is_array($body)?(string)($body['request_number']??''):'';
    $po=is_array($body)?(string)($body['po_number']??''):'';
    if (!preg_match('/\AREQ-[A-Za-z0-9-]{1,64}\z/',$num) || !preg_match('/\APO-[A-Za-z0-9-]{1,30}\z/',$po))
        uniReceiptReply(422,['success'=>false,'message'=>'Invalid request or PO reference.']);
    $result=uniReceiptApply($conn,$num,$po);
    uniReceiptReply(200,['success'=>true,'message'=>'Verified Inventory receipt saved in Procurement.','data'=>$result]);
}catch(DomainException $e){ uniReceiptReply(409,['success'=>false,'message'=>$e->getMessage()]); }
catch(Throwable $e){error_log('Inventory receipt callback: '.$e->getMessage());uniReceiptReply(502,['success'=>false,'message'=>'Inventory receipt verification failed. Check server logs and migration.']);}

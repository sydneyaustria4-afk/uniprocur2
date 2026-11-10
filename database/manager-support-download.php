<?php
/** Serve a private file only to the Manager who created its support ticket. */
require_once __DIR__ . '/procurement_db_connection.php';
require_once __DIR__ . '/manager-api-common.php';

if (($_SERVER['REQUEST_METHOD']??'')!=='GET') managerSendJson(405,['success'=>false,'message'=>'GET required.']);
$manager=requireActiveManager($conn);
$id=filter_input(INPUT_GET,'file_id',FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
if(!$id) managerSendJson(400,['success'=>false,'message'=>'Invalid attachment.']);
$stmt=$conn->prepare('SELECT f.original_name,f.storage_name,f.file_size FROM procurement_support_ticket_files f JOIN procurement_support_tickets t ON t.id=f.ticket_id WHERE f.id=? AND t.requester_user_id=? LIMIT 1');
$actorId=(int)$manager['id'];
$stmt->bind_param('ii',$id,$actorId);
$stmt->execute();$row=$stmt->get_result()->fetch_assoc();$stmt->close();
if(!$row) managerSendJson(404,['success'=>false,'message'=>'Attachment not found.']);
$stored=(string)$row['storage_name'];
if(!preg_match('/\A[a-f0-9]{40}\.(?:doc|docx|xls|xlsx|pdf|jpg|jpeg|png)\z/',$stored)) managerSendJson(404,['success'=>false,'message'=>'Attachment not found.']);
$path=dirname(__DIR__,3).DIRECTORY_SEPARATOR.'uniprocur_private'.DIRECTORY_SEPARATOR.'support_attachments'.DIRECTORY_SEPARATOR.$stored;
if(!is_file($path)||!is_readable($path)) managerSendJson(404,['success'=>false,'message'=>'Attachment file missing.']);
$name=basename(str_replace('\\','/',(string)$row['original_name']));
$name=preg_replace('/[\r\n"\\]/','_',$name);
header('Content-Type: application/octet-stream');
header('X-Content-Type-Options: nosniff');
header('Content-Disposition: attachment; filename="support_attachment"; filename*=UTF-8\'\''.rawurlencode($name));
header('Cache-Control: private, no-store');
header('Content-Length: '.filesize($path));
readfile($path);
exit;

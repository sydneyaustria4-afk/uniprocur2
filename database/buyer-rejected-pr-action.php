<?php
/** Rejected Purchase Request editing + resubmission; preserves original PR identity. */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
if (session_status() !== PHP_SESSION_ACTIVE) {
    require_once __DIR__ . '/uniprocur-session.php';
}
require_once __DIR__ . '/procurement_db_connection.php';
require_once __DIR__ . '/procurement-audit-log.php';

function rejectReply(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}
function rejectBuyer(mysqli $db): array {
    if (!empty($_SESSION['user_id'])) {
        $id=(int)$_SESSION['user_id'];
        $stmt=$db->prepare('SELECT id,full_name,email,role,is_active FROM users WHERE id=? LIMIT 1');
        $stmt->bind_param('i',$id);
    } else {
        // Existing classroom fallback, restricted to a loopback request only.
        if (!in_array((string)($_SERVER['REMOTE_ADDR'] ?? ''), ['127.0.0.1','::1'], true)) {
            rejectReply(401,['success'=>false,'message'=>'Buyer login session is required.']);
        }
        $email=(require __DIR__ . '/buyer-demo-email.php');
        $stmt=$db->prepare('SELECT id,full_name,email,role,is_active FROM users WHERE email=? LIMIT 1');
        $stmt->bind_param('s',$email);
    }
    $stmt->execute();$buyer=$stmt->get_result()->fetch_assoc();$stmt->close();
    if (!$buyer || strtolower((string)$buyer['role'])!=='buyer' || !(bool)$buyer['is_active']) {
        rejectReply(401,['success'=>false,'message'=>'A valid active Buyer account is required.']);
    }
    return $buyer;
}
function rejectTableExists(mysqli $db, string $table): bool {
    $sql='SELECT 1 FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=? LIMIT 1';
    $stmt=$db->prepare($sql);$stmt->bind_param('s',$table);$stmt->execute();
    $exists=$stmt->get_result()->num_rows>0;$stmt->close();return $exists;
}
function rejectItems(mysqli $db, int $prId): array {
    $hasDescriptions=rejectTableExists($db,'procurement_pr_item_descriptions');
    $sql='SELECT p.id,p.item_code,p.category,p.item_name,p.unit,p.qty,'.
        ($hasDescriptions ? "COALESCE(d.description,'')" : "''").' AS description '.
        'FROM pr_items p '.($hasDescriptions?'LEFT JOIN procurement_pr_item_descriptions d ON d.item_id=p.id ':'').
        'WHERE p.pr_id=? ORDER BY p.id ASC';
    $stmt=$db->prepare($sql);$stmt->bind_param('i',$prId);$stmt->execute();
    $rows=$stmt->get_result()->fetch_all(MYSQLI_ASSOC);$stmt->close();return $rows;
}
function rejectSchema(mysqli $db): void {
    // DDL is executed before transaction (MySQL DDL implicitly commits).
    $db->query("CREATE TABLE IF NOT EXISTS procurement_pr_rejection_history (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        pr_id INT NOT NULL,
        pr_number VARCHAR(70) NOT NULL,
        manager_id INT NULL,
        rejected_at DATETIME NULL,
        rejection_reason TEXT NULL,
        manager_remarks TEXT NULL,
        revised_by INT NOT NULL,
        revised_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_pr_history(pr_id,id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->query("CREATE TABLE IF NOT EXISTS procurement_pr_revision_baselines (
        pr_id INT NOT NULL PRIMARY KEY,
        needed_by DATE NOT NULL,
        purpose TEXT NOT NULL,
        items_json LONGTEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->query("CREATE TABLE IF NOT EXISTS procurement_pr_item_descriptions (
        item_id INT NOT NULL PRIMARY KEY,
        pr_id INT NOT NULL,
        description VARCHAR(1500) NOT NULL DEFAULT '',
        INDEX idx_pr_item_descriptions (pr_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

$transaction=false;
try {
    $buyer=rejectBuyer($conn);$buyerId=(int)$buyer['id'];
    $method=strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? ''));
    if ($method==='GET') {
        $number=trim((string)($_GET['pr_number'] ?? ''));
        if (!preg_match('/\APR-[A-Za-z0-9-]{3,70}\z/D',$number)) rejectReply(400,['success'=>false,'message'=>'Valid PR number required.']);
        $stmt=$conn->prepare("SELECT id,pr_number,status,purpose,DATE_FORMAT(needed_by,'%Y-%m-%d') needed_by,
                rejection_reason,manager_remarks,DATE_FORMAT(approved_at,'%Y-%m-%d %H:%i:%s') rejected_at,
                DATE_FORMAT(created_at,'%Y-%m-%d %H:%i:%s') created_at
                FROM purchase_requisitions WHERE pr_number=? AND created_by=? LIMIT 1");
        $stmt->bind_param('si',$number,$buyerId);$stmt->execute();$pr=$stmt->get_result()->fetch_assoc();$stmt->close();
        if (!$pr) rejectReply(404,['success'=>false,'message'=>'PR not found for this Buyer.']);
        $archivedCheck=$conn->prepare("SELECT id FROM procurement_audit_logs WHERE reference_number=? AND action_name='PR Archived' LIMIT 1");
        $archivedCheck->bind_param('s',$number);$archivedCheck->execute();
        $alreadyArchived=$archivedCheck->get_result()->num_rows>0;$archivedCheck->close();
        if($alreadyArchived) rejectReply(410,['success'=>false,'message'=>'This PR was deleted from active lists.']);
        $id=(int)$pr['id'];$items=rejectItems($conn,$id);
        $history=[];$baseline=null;
        if (rejectTableExists($conn,'procurement_pr_rejection_history')) {
            $stmt=$conn->prepare('SELECT rejected_at,rejection_reason,manager_remarks,revised_at FROM procurement_pr_rejection_history WHERE pr_id=? ORDER BY id ASC');
            $stmt->bind_param('i',$id);$stmt->execute();$history=$stmt->get_result()->fetch_all(MYSQLI_ASSOC);$stmt->close();
        }
        if (rejectTableExists($conn,'procurement_pr_revision_baselines')) {
            $stmt=$conn->prepare("SELECT DATE_FORMAT(needed_by,'%Y-%m-%d') needed_by,purpose,items_json FROM procurement_pr_revision_baselines WHERE pr_id=? LIMIT 1");
            $stmt->bind_param('i',$id);$stmt->execute();$raw=$stmt->get_result()->fetch_assoc();$stmt->close();
            if ($raw) $baseline=['needed_by'=>$raw['needed_by'],'purpose'=>$raw['purpose'],'items'=>json_decode($raw['items_json'],true) ?: []];
        }
        $token='';
        if (strtolower((string)$pr['status'])==='rejected') {
            if (empty($_SESSION['buyer_rejected_pr_csrf'])) $_SESSION['buyer_rejected_pr_csrf']=bin2hex(random_bytes(32));
            $token=(string)$_SESSION['buyer_rejected_pr_csrf'];
        }
        rejectReply(200,['success'=>true,'purchase_request'=>$pr,'items'=>$items,'history'=>$history,'baseline'=>$baseline,
            'buyer'=>['full_name'=>$buyer['full_name'],'email'=>$buyer['email']],'csrf_token'=>$token]);
    }
    if ($method!=='POST')rejectReply(405,['success'=>false,'message'=>'Use GET or POST.']);
    if (stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''),'application/json')!==0)rejectReply(415,['success'=>false,'message'=>'JSON payload required.']);
    $data=json_decode(file_get_contents('php://input') ?: '',true);
    if (!is_array($data)) rejectReply(400,['success'=>false,'message'=>'Invalid JSON.']);
    $received=(string)($data['csrf_token']??'');$expected=(string)($_SESSION['buyer_rejected_pr_csrf']??'');
    if ($received===''||$expected===''||!hash_equals($received,$expected))rejectReply(419,['success'=>false,'message'=>'Session expired. Refresh the PR editor.']);
    $number=trim((string)($data['pr_number']??''));
    if (!preg_match('/\APR-[A-Za-z0-9-]{3,70}\z/D',$number))rejectReply(400,['success'=>false,'message'=>'Invalid PR number.']);
    $action=(string)($data['action']??'');
    if (!in_array($action,['save','resubmit'],true))rejectReply(422,['success'=>false,'message'=>'Unsupported action.']);
    $neededBy=(string)($data['needed_by']??'');
    $dt=DateTimeImmutable::createFromFormat('!Y-m-d',$neededBy,new DateTimeZone('Asia/Manila'));
    $today=(new DateTimeImmutable('today',new DateTimeZone('Asia/Manila')))->format('Y-m-d');
    if (!$dt||$dt->format('Y-m-d')!==$neededBy||$neededBy<$today)rejectReply(422,['success'=>false,'message'=>'Required Date must be today or a future date.']);
    $purpose=trim((string)($data['purpose']??''));
    if ($purpose===''||strlen($purpose)>5000)rejectReply(422,['success'=>false,'message'=>'Justification is required (max 5,000 bytes).']);
    $incoming=$data['items']??null;
    if (!is_array($incoming)||count($incoming)<1||count($incoming)>100)rejectReply(422,['success'=>false,'message'=>'Please include 1 to 100 items.']);
    $items=[];
    foreach($incoming as $idx=>$row){
        if (!is_array($row))rejectReply(422,['success'=>false,'message'=>'Invalid item row.']);
        $name=trim((string)($row['name']??''));$code=trim((string)($row['code']??''));
        $category=trim((string)($row['category']??''));$unit=trim((string)($row['unit']??''));
        $description=trim((string)($row['description']??''));$qty=$row['quantity']??null;
        if ($name===''||strlen($name)>200||strlen($code)>30||strlen($category)>100||
            $unit===''||strlen($unit)>20||strlen($description)>1500||!is_numeric($qty)||
            !is_finite((float)$qty)||(float)$qty<=0||(float)$qty>99999999.99) {
            rejectReply(422,['success'=>false,'message'=>'Check the item name, unit, description and quantity for row '.($idx+1).'.']);
        }
        $items[]=['name'=>$name,'code'=>$code,'category'=>$category,'unit'=>$unit,'description'=>$description,'qty'=>(float)$qty];
    }
    rejectSchema($conn);
    $conn->begin_transaction();$transaction=true;
    $stmt=$conn->prepare('SELECT id,status,approved_by,approved_at,rejection_reason,manager_remarks,purpose,needed_by FROM purchase_requisitions WHERE pr_number=? AND created_by=? LIMIT 1 FOR UPDATE');
    $stmt->bind_param('si',$number,$buyerId);$stmt->execute();$pr=$stmt->get_result()->fetch_assoc();$stmt->close();
    if (!$pr){$conn->rollback();$transaction=false;rejectReply(404,['success'=>false,'message'=>'PR not found for this Buyer.']);}
    if (strtolower((string)$pr['status'])!=='rejected'){$conn->rollback();$transaction=false;rejectReply(409,['success'=>false,'message'=>'This PR is no longer Rejected. Refresh the page.']);}
    $archivedCheck=$conn->prepare("SELECT id FROM procurement_audit_logs WHERE reference_number=? AND action_name='PR Archived' LIMIT 1");
     $archivedCheck->bind_param('s',$number);$archivedCheck->execute();
     $alreadyArchived=$archivedCheck->get_result()->num_rows>0;$archivedCheck->close();
     if($alreadyArchived){$conn->rollback();$transaction=false;rejectReply(410,['success'=>false,'message'=>'This rejected PR was deleted and cannot be revised.']);}
     $id=(int)$pr['id'];
     // Snapshot the initially rejected version only once, even after many Save Draft actions.
    $stmt=$conn->prepare('SELECT pr_id FROM procurement_pr_revision_baselines WHERE pr_id=? LIMIT 1');
    $stmt->bind_param('i',$id);$stmt->execute();$baselineExists=$stmt->get_result()->num_rows>0;$stmt->close();
    if (!$baselineExists) {
        $initialJson=json_encode(rejectItems($conn,$id),JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
        if ($initialJson===false) throw new RuntimeException('Unable to snapshot original items.');
        $stmt=$conn->prepare('INSERT INTO procurement_pr_revision_baselines(pr_id,needed_by,purpose,items_json)VALUES(?,?,?,?)');
        $stmt->bind_param('isss',$id,$pr['needed_by'],$pr['purpose'],$initialJson);$stmt->execute();$stmt->close();
    }
    if ($action==='resubmit') {
        $stmt=$conn->prepare('INSERT INTO procurement_pr_rejection_history(pr_id,pr_number,manager_id,rejected_at,rejection_reason,manager_remarks,revised_by)VALUES(?,?,?,?,?,?,?)');
        $managerId=$pr['approved_by']===null?null:(int)$pr['approved_by'];
        $stmt->bind_param('isisssi',$id,$number,$managerId,$pr['approved_at'],$pr['rejection_reason'],$pr['manager_remarks'],$buyerId);
        $stmt->execute();$stmt->close();
        $stmt=$conn->prepare("UPDATE purchase_requisitions SET purpose=?,needed_by=?,status='submitted',approved_by=NULL,approved_at=NULL,rejection_reason=NULL,manager_remarks=NULL WHERE id=? AND created_by=? AND status='rejected'");
    } else {
        $stmt=$conn->prepare("UPDATE purchase_requisitions SET purpose=?,needed_by=? WHERE id=? AND created_by=? AND status='rejected'");
    }
    $stmt->bind_param('ssii',$purpose,$neededBy,$id,$buyerId);$stmt->execute();$stmt->close();
    $stmt=$conn->prepare('DELETE FROM procurement_pr_item_descriptions WHERE pr_id=?');$stmt->bind_param('i',$id);$stmt->execute();$stmt->close();
    $stmt=$conn->prepare('DELETE FROM pr_items WHERE pr_id=?');$stmt->bind_param('i',$id);$stmt->execute();$stmt->close();
    $stmt=$conn->prepare('INSERT INTO pr_items(pr_id,item_code,category,item_name,unit,qty)VALUES(?,?,?,?,?,?)');
    $descStmt=$conn->prepare('INSERT INTO procurement_pr_item_descriptions(item_id,pr_id,description)VALUES(?,?,?)');
    foreach($items as $item) {
        $stmt->bind_param('issssd',$id,$item['code'],$item['category'],$item['name'],$item['unit'],$item['qty']);
        $stmt->execute();$itemId=(int)$conn->insert_id;
        if ($item['description']!=='') {
            $descStmt->bind_param('iis',$itemId,$id,$item['description']);$descStmt->execute();
        }
    }
    $stmt->close();$descStmt->close();
    if ($action==='resubmit') {
        $stmt=$conn->prepare('DELETE FROM procurement_pr_revision_baselines WHERE pr_id=?');
        $stmt->bind_param('i',$id);$stmt->execute();$stmt->close();
    }
    procurementAuditLog($conn,$buyer,'Purchase Request',$action==='resubmit'?'Resubmitted':'Revised',$number,
        $action==='resubmit'?'Rejected PR resubmitted to Manager; the prior rejection is archived.':'Rejected PR corrections saved; awaits resubmission.');
    $conn->commit();$transaction=false;
    rejectReply(200,['success'=>true,'status'=>$action==='resubmit'?'submitted':'rejected',
        'pr_number'=>$number,'message'=>$action==='resubmit'?'PR resubmitted for Manager approval.':'Draft corrections saved. PR remains rejected.']);
} catch(Throwable $error) {
    if ($transaction)try{$conn->rollback();}catch(Throwable $ignored){}
    error_log('Rejected PR workflow: '.$error->getMessage());
    rejectReply(500,['success'=>false,'message'=>'Could not save revisions. Check the PHP error log and MySQL CREATE TABLE permission. Changes were rolled back.']);
}

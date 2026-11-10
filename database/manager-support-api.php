<?php
/**
 * Manager Support: GET own tickets + CSRF token, POST new ticket and attachments.
 * Manager identity comes from the existing role/session (or localhost-only demo).
 * No email or automatic support-team workflow is implied.
 */
require_once __DIR__ . '/procurement_db_connection.php';
require_once __DIR__ . '/manager-api-common.php';

header('Cache-Control: private, no-store, max-age=0');
date_default_timezone_set('Asia/Manila');

function supportListFiles(mysqli $conn, array $tickets): array
{
    if (!$tickets) return [];
    $ids = array_map(static fn($ticket): int => (int) $ticket['id'], $tickets);
    $list = implode(',', $ids); // IDs strictly originate from filtered DB rows.
    $out = [];
    $result = $conn->query("SELECT id,ticket_id,original_name,file_size FROM procurement_support_ticket_files WHERE ticket_id IN ($list) ORDER BY id");
    while ($row = $result->fetch_assoc()) {
        $out[(int) $row['ticket_id']][] = [
            'id' => (int) $row['id'],
            'original_name' => $row['original_name'],
            'file_size' => (int) $row['file_size']
        ];
    }
    return $out;
}

function supportUploadedFiles(): array
{
    if (!isset($_FILES['attachments'])) return [];
    $f = $_FILES['attachments'];
    $names = is_array($f['name']) ? $f['name'] : [$f['name']];
    $tmpNames = is_array($f['tmp_name']) ? $f['tmp_name'] : [$f['tmp_name']];
    $sizes = is_array($f['size']) ? $f['size'] : [$f['size']];
    $errors = is_array($f['error']) ? $f['error'] : [$f['error']];
    if (count($names) > 4) managerSendJson(422, ['success' => false, 'message' => 'Maximum 4 files per request.']);
    $files = [];
    $totalBytes = 0;
    $allowed = [
        'png' => ['image/png'],
        'jpg' => ['image/jpeg'],
        'jpeg' => ['image/jpeg'],
        'pdf' => ['application/pdf'],
        'doc' => ['application/msword','application/vnd.ms-office','application/octet-stream'],
        'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/zip','application/octet-stream'],
        'xls' => ['application/vnd.ms-excel','application/vnd.ms-office','application/octet-stream'],
        'xlsx' => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/zip','application/octet-stream'],
    ];
    $finfo = new finfo(FILEINFO_MIME_TYPE);
    foreach ($names as $i => $name) {
        $error = (int) ($errors[$i] ?? UPLOAD_ERR_NO_FILE);
        if ($error === UPLOAD_ERR_NO_FILE) continue;
        if ($error !== UPLOAD_ERR_OK) managerSendJson(422, ['success' => false, 'message' => 'Attachment upload failed (PHP upload error '. $error .'). Check php.ini upload limits.']);
        $original = basename(str_replace('\\', '/', (string) $name));
        $size = (int) ($sizes[$i] ?? 0);
        $tmp = (string) ($tmpNames[$i] ?? '');
        $ext = strtolower(pathinfo($original, PATHINFO_EXTENSION));
        if (!$original || strlen($original) > 240 || !isset($allowed[$ext]) || $size < 1 || $size > 20*1024*1024 || !is_uploaded_file($tmp)) {
            managerSendJson(422, ['success' => false, 'message' => 'Attachment is invalid. Use DOC, DOCX, XLS, XLSX, PDF, JPG or PNG, up to 20 MB each.']);
        }
        $mime = (string) ($finfo->file($tmp) ?: '');
        if (!in_array($mime, $allowed[$ext], true)) {
            managerSendJson(422, ['success' => false, 'message' => 'Attachment contents do not match the allowed file type: ' . $original]);
        }
        $totalBytes += $size;
        if ($totalBytes > 25*1024*1024) managerSendJson(422, ['success'=>false,'message'=>'Attachments must be 25 MB total or less.']);
        $files[] = ['original'=>$original,'size'=>$size,'tmp'=>$tmp,'ext'=>$ext,'mime'=>$mime];
    }
    return $files;
}

try {
    $manager = requireActiveManager($conn);
    $actorId = (int) $manager['id'];
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'GET') {
        $stmt = $conn->prepare(
            'SELECT id,requester_name,category,reference_number,subject,status,
                    DATE_FORMAT(created_at,\'%Y-%m-%d %H:%i:%s\') AS created_at
             FROM procurement_support_tickets WHERE requester_user_id=? ORDER BY id DESC LIMIT 200'
        );
        $stmt->bind_param('i',$actorId);
        $stmt->execute();
        $result=$stmt->get_result();
        $tickets=$result->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        $fileLists=supportListFiles($conn,$tickets);
        foreach($tickets as &$row){
            $row['id']=(int)$row['id'];
            $year=substr($row['created_at'],0,4);
            $row['ticket_number']='SUP-'.$year.'-'.str_pad((string)$row['id'],4,'0',STR_PAD_LEFT);
            $row['status_display']=ucwords(str_replace('_',' ',$row['status']));
            $row['attachments']=$fileLists[$row['id']]??[];
        }
        unset($row);
        managerSendJson(200,[
            'success'=>true,
            'manager'=>['full_name'=>$manager['full_name'],'email'=>$manager['email']],
            'csrf_token'=>managerCsrfToken(),
            'tickets'=>$tickets,
            'email_notifications_connected'=>false,
            'support_replies_connected'=>false
        ]);
    }
    if ($method !== 'POST') managerSendJson(405,['success'=>false,'message'=>'Only GET and POST supported.']);
    if (empty($_POST) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
        managerSendJson(413,['success'=>false,'message'=>'Request is too large. Increase php.ini post_max_size and upload_max_filesize, then restart Apache.']);
    }
    $token = (string) ($_POST['csrf_token'] ?? '');
    if (!$token || !hash_equals(managerCsrfToken(),$token)) managerSendJson(403,['success'=>false,'message'=>'Your session has expired. Refresh Support and try again.']);
    $category=trim((string)($_POST['category'] ?? ''));
    $subject=trim((string)($_POST['subject'] ?? ''));
    $reference=trim((string)($_POST['reference'] ?? ''));
    $validCategories=['Dashboard','Purchase Request','Purchase Order','RFQ Workspace','Supplier Management','Suppliers','Reports','Other'];
    if (!in_array($category,$validCategories,true) || strlen($subject)<10 || strlen($subject)>4000 || strlen($reference)>80) {
        managerSendJson(422,['success'=>false,'message'=>'Select a valid category and enter an issue description (10–4000 characters).']);
    }
    if (preg_match('/[\x00-\x1F]/',$reference)) managerSendJson(422,['success'=>false,'message'=>'Invalid reference.']);
    $files = supportUploadedFiles();
    $storageDir=dirname(__DIR__,3).DIRECTORY_SEPARATOR.'uniprocur_private'.DIRECTORY_SEPARATOR.'support_attachments';
    if ($files && !is_dir($storageDir) && !mkdir($storageDir,0700,true) && !is_dir($storageDir)) {
        throw new RuntimeException('Support file storage is unavailable.');
    }
    $stored=[];
    $conn->begin_transaction();
    try {
        $stmt=$conn->prepare('INSERT INTO procurement_support_tickets (requester_user_id,requester_name,requester_role,category,reference_number,subject) VALUES (?,?,?,?,?,?)');
        $name=(string)$manager['full_name'];
        $role='manager';
        $stmt->bind_param('isssss',$actorId,$name,$role,$category,$reference,$subject);
        $stmt->execute();
        $ticketId=(int)$conn->insert_id;
        $stmt->close();
        if ($files) {
            $attach=$conn->prepare('INSERT INTO procurement_support_ticket_files (ticket_id,original_name,storage_name,mime_type,file_size) VALUES (?,?,?,?,?)');
            foreach($files as $item){
                $newName=bin2hex(random_bytes(20)).'.'.$item['ext'];
                $destination=$storageDir.DIRECTORY_SEPARATOR.$newName;
                if (!move_uploaded_file($item['tmp'],$destination)) throw new RuntimeException('Could not save an uploaded attachment.');
                $stored[]=$destination;
                $originalName=$item['original'];$mime=$item['mime'];$size=(int)$item['size'];
                $attach->bind_param('isssi',$ticketId,$originalName,$newName,$mime,$size);
                $attach->execute();
            }
            $attach->close();
        }
        $conn->commit();
    } catch(Throwable $error) {
        $conn->rollback();
        foreach($stored as $file) if(is_file($file)) @unlink($file);
        throw $error;
    }
    managerSendJson(201,[
        'success'=>true,
        'ticket_id'=>$ticketId,
        'ticket_number'=>'SUP-'.date('Y').'-'.str_pad((string)$ticketId,4,'0',STR_PAD_LEFT),
        'status'=>'open',
        'message'=>'Your support ticket was saved to Procurement MySQL. No email has been sent.'
    ]);
} catch(Throwable $error) {
    error_log('Manager Support API error: '.$error->getMessage());
    managerSendJson(500,[
        'success'=>false,
        'message'=>'Unable to save or load support tickets. Run the SQL migration and check XAMPP PHP / MySQL logs.'
    ]);
}

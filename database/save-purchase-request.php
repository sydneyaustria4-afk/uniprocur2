<?php
header('Content-Type: application/json; charset=utf-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    require_once __DIR__ . '/uniprocur-session.php';
}

date_default_timezone_set('Asia/Manila');
require_once __DIR__ . '/procurement_db_connection.php';

require_once __DIR__ . '/procurement-audit-log.php';


function sendJson(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function cleanValue($value, int $maxLength): string
{
    $value = trim((string)($value ?? ''));
    $value = preg_replace('/[\x00-\x1F\x7F]/u', '', $value) ?? '';
    return substr($value, 0, $maxLength);
}

function getActiveBuyer(mysqli $conn): array
{
    if (!empty($_SESSION['user_id'])) {
        $userId = (int)$_SESSION['user_id'];
        $stmt = $conn->prepare(
            "SELECT id, full_name, email, role, department, is_active
             FROM users WHERE id = ? LIMIT 1"
        );
        $stmt->bind_param('i', $userId);
    } else {
        // Matches the demo-buyer fallback in the existing PR endpoint.
        $email = (require __DIR__ . '/buyer-demo-email.php');
        $stmt = $conn->prepare(
            "SELECT id, full_name, email, role, department, is_active
             FROM users WHERE email = ? LIMIT 1"
        );
        $stmt->bind_param('s', $email);
    }

    $stmt->execute();
    $buyer = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$buyer || $buyer['role'] !== 'buyer' || !(bool)$buyer['is_active']) {
        throw new RuntimeException(
            'A valid active buyer account is required to save a Purchase Request.'
        );
    }

    return $buyer;
}

function getUploadedFiles(): array
{
    if (!isset($_FILES['attachments'])) {
        return [];
    }

    $files = $_FILES['attachments'];
    if (!is_array($files['name'] ?? null)) {
        throw new RuntimeException('The attachment upload data is invalid.');
    }

    $allowed = ['doc', 'docx', 'xls', 'xlsx', 'pdf', 'jpg', 'jpeg', 'png'];
    $normalized = [];
    $totalSize = 0;
    $count = count($files['name']);

    if ($count > 10) {
        throw new RuntimeException('You can upload up to 10 attachments per request.');
    }

    for ($i = 0; $i < $count; $i++) {
        $name = (string)($files['name'][$i] ?? '');
        $error = (int)($files['error'][$i] ?? UPLOAD_ERR_NO_FILE);

        if ($error === UPLOAD_ERR_NO_FILE || $name === '') {
            continue;
        }

        if ($error !== UPLOAD_ERR_OK) {
            throw new RuntimeException(
                'An attachment could not be uploaded. Check the PHP upload size limits.'
            );
        }

        $size = (int)($files['size'][$i] ?? 0);
        $totalSize += $size;

        if ($size <= 0 || $size > 20 * 1024 * 1024 || $totalSize > 40 * 1024 * 1024) {
            throw new RuntimeException(
                'Each file must be up to 20MB and total attachments must be up to 40MB.'
            );
        }

        $originalName = basename(str_replace('\\', '/', $name));
        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

        if (!in_array($extension, $allowed, true)) {
            throw new RuntimeException('Unsupported attachment type: ' . $originalName);
        }

        $tmpName = (string)($files['tmp_name'][$i] ?? '');
        if ($tmpName === '' || !is_uploaded_file($tmpName)) {
            throw new RuntimeException('An uploaded attachment could not be verified.');
        }

        $normalized[] = [
            'tmp_name' => $tmpName,
            'original_name' => cleanValue($originalName, 255),
            'extension' => $extension,
            'size' => $size
        ];
    }

    return $normalized;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJson(405, ['success' => false, 'message' => 'Use POST to save a Purchase Request.']);
}

$transactionStarted = false;
$movedFiles = [];

try {
    $raw = $_POST['request'] ?? '';
    if (!is_string($raw) || $raw === '') {
        sendJson(400, ['success' => false, 'message' => 'Purchase Request details were not received.']);
    }

    $request = json_decode($raw, true);
    if (!is_array($request) || json_last_error() !== JSON_ERROR_NONE) {
        sendJson(400, ['success' => false, 'message' => 'Purchase Request details are not valid JSON.']);
    }

    $action = strtolower(cleanValue($request['action'] ?? 'submitted', 20));
    if (!in_array($action, ['draft', 'submitted'], true)) {
        sendJson(400, ['success' => false, 'message' => 'Invalid Purchase Request action.']);
    }
    $status = $action === 'draft' ? 'draft' : 'submitted';

    $requiredDate = (string)($request['requiredDate'] ?? '');
    $dateParts = explode('-', $requiredDate);
    if (
        count($dateParts) !== 3 ||
        !ctype_digit($dateParts[0]) ||
        !ctype_digit($dateParts[1]) ||
        !ctype_digit($dateParts[2]) ||
        !checkdate((int)$dateParts[1], (int)$dateParts[2], (int)$dateParts[0])
    ) {
        sendJson(400, ['success' => false, 'message' => 'Please select a valid required date.']);
    }

    // UNIPROCUR_REQUIRED_DATE_SERVER_GUARD_20261113
    // Enforce a real current/future date server-side (including drafts).
    if (!preg_match('/\A\d{4}-\d{2}-\d{2}\z/D', $requiredDate) ||
        $requiredDate < (new DateTimeImmutable('today', new DateTimeZone('Asia/Manila')))->format('Y-m-d')) {
        sendJson(422, ['success' => false, 'message' => 'Required Date cannot be in the past. Choose today or a future date.']);
    }

    $purpose = cleanValue($request['justification'] ?? '', 5000);
    if ($status === 'submitted' && $purpose === '') {
        sendJson(400, ['success' => false, 'message' => 'Please enter a justification.']);
    }

    $itemsInput = $request['items'] ?? [];
    if (!is_array($itemsInput) || count($itemsInput) > 100) {
        sendJson(400, ['success' => false, 'message' => 'The item list is invalid.']);
    }

    $items = [];
    foreach ($itemsInput as $index => $item) {
        if (!is_array($item)) {
            throw new RuntimeException('An item row is invalid.');
        }

        $code = cleanValue($item['code'] ?? '', 30);
        $category = cleanValue($item['category'] ?? '', 100);
        $name = cleanValue($item['name'] ?? '', 200);
        $unit = cleanValue($item['unit'] ?? '', 20);
        $quantityRaw = trim((string)($item['quantity'] ?? ''));

        // UNIPROCUR_SAVE_DRAFT_QTY_VALIDATION_V1
        // pr_items.qty is DECIMAL(10,2) CHECK (qty > 0). This applies to
        // submitted AND draft PRs. Never insert zero for an unfinished row.
        if ($status === 'submitted' && ($name === '' || $unit === '')) {
            throw new InvalidArgumentException(
                'Complete the item name and unit for item ' . ($index + 1) . '.'
            );
        }
        if (!preg_match('/\A(?:\d+(?:\.\d{1,2})?|\.\d{1,2})\z/D', $quantityRaw)) {
            throw new InvalidArgumentException(
                'Item ' . ($index + 1) . ': enter a positive quantity with at most two decimal places, or remove the unfinished row.'
            );
        }
        $quantity = (float)$quantityRaw;
        if (!is_finite($quantity) || $quantity < 0.01 || $quantity > 99999999.99) {
            throw new InvalidArgumentException(
                'Item ' . ($index + 1) . ': quantity must be between 0.01 and 99999999.99.'
            );
        }

        $items[] = [
            'code' => $code,
            'category' => $category,
            'name' => $name,
            'unit' => $unit,
            'quantity' => number_format($quantity, 2, '.', '')
        ];
    }

    if ($status === 'submitted' && count($items) === 0) {
        sendJson(400, ['success' => false, 'message' => 'Add at least one complete item before submitting.']);
    }

    $buyer = getActiveBuyer($conn);
    $buyerId = (int)$buyer['id'];
    $department = cleanValue($buyer['department'] ?? '', 100);
    if ($department === '') {
        $department = 'Procurement';
    }

    $files = getUploadedFiles();
    $requestId = isset($request['requestId']) && is_numeric($request['requestId'])
        ? (int)$request['requestId']
        : 0;

    $conn->begin_transaction();
    $transactionStarted = true;

    if ($requestId > 0) {
        $find = $conn->prepare(
            "SELECT pr_number, status
             FROM purchase_requisitions
             WHERE id = ? AND created_by = ?
             LIMIT 1 FOR UPDATE"
        );
        $find->bind_param('ii', $requestId, $buyerId);
        $find->execute();
        $existing = $find->get_result()->fetch_assoc();
        $find->close();

        if (!$existing) {
            throw new RuntimeException('The saved draft was not found for this buyer.');
        }
        if (strtolower((string)$existing['status']) !== 'draft') {
            throw new RuntimeException('Only a Draft Purchase Request can be updated or submitted.');
        }

        $requestNumber = (string)$existing['pr_number'];

        $update = $conn->prepare(
            "UPDATE purchase_requisitions
             SET status = ?, department = ?, purpose = ?, needed_by = ?
             WHERE id = ? AND created_by = ?"
        );
        $update->bind_param('ssssii', $status, $department, $purpose, $requiredDate, $requestId, $buyerId);
        $update->execute();
        $update->close();

        $deleteItems = $conn->prepare('DELETE FROM pr_items WHERE pr_id = ?');
        $deleteItems->bind_param('i', $requestId);
        $deleteItems->execute();
        $deleteItems->close();
    } else {
        $temporaryNumber = 'TMP-' . bin2hex(random_bytes(12));
        $insertPr = $conn->prepare(
            "INSERT INTO purchase_requisitions
                (pr_number, created_by, department, purpose, needed_by, status)
             VALUES (?, ?, ?, ?, ?, ?)"
        );
        $insertPr->bind_param('sissss', $temporaryNumber, $buyerId, $department, $purpose, $requiredDate, $status);
        $insertPr->execute();
        $requestId = (int)$conn->insert_id;
        $insertPr->close();

        $requestNumber = 'PR-' . date('Y') . '-' . str_pad((string)$requestId, 4, '0', STR_PAD_LEFT);
        $updateNumber = $conn->prepare('UPDATE purchase_requisitions SET pr_number = ? WHERE id = ?');
        $updateNumber->bind_param('si', $requestNumber, $requestId);
        $updateNumber->execute();
        $updateNumber->close();
    }

    if (count($items) > 0) {
        $insertItem = $conn->prepare(
            'INSERT INTO pr_items (pr_id, item_code, category, item_name, unit, qty)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        foreach ($items as $item) {
            $insertItem->bind_param(
                'issssd',
                $requestId,
                $item['code'],
                $item['category'],
                $item['name'],
                $item['unit'],
                $item['quantity']
            );
            $insertItem->execute();
        }
        $insertItem->close();
    }

    if (count($files) > 0) {
        $uploadDirectory = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'purchase-requests';
        if (!is_dir($uploadDirectory) && !mkdir($uploadDirectory, 0755, true) && !is_dir($uploadDirectory)) {
            throw new RuntimeException('The server could not create the attachment folder.');
        }

        $htaccessPath = $uploadDirectory . DIRECTORY_SEPARATOR . '.htaccess';
        if (!file_exists($htaccessPath)) {
            file_put_contents(
                $htaccessPath,
                "Options -Indexes\n<FilesMatch \".*\">\n    Require all denied\n</FilesMatch>\n"
            );
        }

        $insertAttachment = $conn->prepare(
            'INSERT INTO purchase_requisition_attachments
                (pr_id, original_name, stored_name, mime_type, file_size, relative_path)
             VALUES (?, ?, ?, ?, ?, ?)'
        );

        foreach ($files as $file) {
            $storedName = bin2hex(random_bytes(16)) . '.' . $file['extension'];
            $destination = $uploadDirectory . DIRECTORY_SEPARATOR . $storedName;
            $relativePath = 'uploads/purchase-requests/' . $storedName;

            if (!move_uploaded_file($file['tmp_name'], $destination)) {
                throw new RuntimeException('The server could not save attachment ' . $file['original_name'] . '.');
            }
            $movedFiles[] = $destination;

            $mimeType = 'application/octet-stream';
            if (function_exists('finfo_open')) {
                $fileInfo = finfo_open(FILEINFO_MIME_TYPE);
                if ($fileInfo) {
                    $detected = finfo_file($fileInfo, $destination);
                    if (is_string($detected) && $detected !== '') {
                        $mimeType = $detected;
                    }
                    finfo_close($fileInfo);
                }
            }

            $insertAttachment->bind_param(
                'isssis',
                $requestId,
                $file['original_name'],
                $storedName,
                $mimeType,
                $file['size'],
                $relativePath
            );
            $insertAttachment->execute();
        }
        $insertAttachment->close();
    }

   
    // Record a real PR submission in the Audit Trail.
    // Keep this inside the same transaction as the PR.
    if ($status === 'submitted') {
        procurementAuditLog(
            $conn,
            $buyer,
            'Purchase Request',
            'Submitted',
            $requestNumber,
            "Purchase Request {$requestNumber} submitted."
        );
    }

    $conn->commit();
    $transactionStarted = false;


    sendJson(200, [
        'success' => true,
        'message' => $status === 'draft'
            ? 'Purchase Request draft saved successfully.'
            : 'Purchase Request submitted successfully.',
        'request_id' => $requestId,
        'request_number' => $requestNumber,
        'status' => $status,
        'items_saved' => count($items),
        'attachments_saved' => count($files)
    ]);

} catch (Throwable $error) {
    if ($transactionStarted) {
        try {
            $conn->rollback();
        } catch (Throwable $rollbackError) {
            error_log('Purchase Request rollback error: ' . $rollbackError->getMessage());
        }
    }

    foreach ($movedFiles as $path) {
        if (is_file($path)) {
            @unlink($path);
        }
    }

    error_log('Save Purchase Request Error: ' . $error->getMessage());

    if ($error instanceof InvalidArgumentException) {
        sendJson(422, ['success' => false, 'message' => $error->getMessage()]);
    }

    $message = $error instanceof mysqli_sql_exception
        ? 'A database error prevented the Purchase Request from being saved. Check the database and PHP error log.'
        : ($error instanceof RuntimeException
            ? $error->getMessage()
            : 'Unable to save the Purchase Request. Check the PHP error log.');

    sendJson(500, ['success' => false, 'message' => $message]);
}

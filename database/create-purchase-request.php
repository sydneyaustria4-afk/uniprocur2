
<?php



header('Content-Type: application/json; charset=utf-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    require_once __DIR__ . '/uniprocur-session.php';
}

date_default_timezone_set('Asia/Manila');

require_once __DIR__ . '/procurement_db_connection.php';

require_once __DIR__ . '/procurement-audit-log.php';


function jsonResponse(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function cleanText($value, int $maxLength): string
{
    $value = trim((string)($value ?? ''));
    $value = preg_replace('/[\x00-\x1F\x7F]/u', '', $value) ?? '';
    return substr($value, 0, $maxLength);
}

function getBuyer(mysqli $conn): array
{
    // Use the PHP login session when it provides user_id.
    if (!empty($_SESSION['user_id'])) {
        $userId = (int)$_SESSION['user_id'];

        $stmt = $conn->prepare(
            "SELECT id, full_name, email, role, department, is_active
             FROM users WHERE id = ? LIMIT 1"
        );

        $stmt->bind_param('i', $userId);

    } else {
        // Prototype fallback: the seeded Clark buyer account.
        // Replace this when the PHP login/session flow is connected.
        $demoBuyerEmail = (require __DIR__ . '/buyer-demo-email.php');

        $stmt = $conn->prepare(
            "SELECT id, full_name, email, role, department, is_active
             FROM users WHERE email = ? LIMIT 1"
        );

        $stmt->bind_param('s', $demoBuyerEmail);
    }

    $stmt->execute();
    $buyer = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$buyer || $buyer['role'] !== 'buyer' || !(bool)$buyer['is_active']) {
        throw new RuntimeException(
            'A valid active buyer account is required to submit a Purchase Request.'
        );
    }

    return $buyer;
}

function uploadedFiles(): array
{
    if (!isset($_FILES['attachments'])) {
        return [];
    }

    $files = $_FILES['attachments'];

    if (!is_array($files['name'] ?? null)) {
        throw new RuntimeException(
            'The attachment upload data is invalid. Please select the files again.'
        );
    }

    $normalized = [];
    $count = count($files['name']);
    $totalSize = 0;

    if ($count > 10) {
        throw new RuntimeException(
            'You can upload up to 10 attachments per Purchase Request.'
        );
    }

    $allowedExtensions = [
        'doc', 'docx', 'xls', 'xlsx',
        'pdf', 'jpg', 'jpeg', 'png'
    ];

    for ($i = 0; $i < $count; $i++) {

        $name = (string)($files['name'][$i] ?? '');
        $error = (int)($files['error'][$i] ?? UPLOAD_ERR_NO_FILE);

        if ($error === UPLOAD_ERR_NO_FILE || $name === '') {
            continue;
        }

        if ($error !== UPLOAD_ERR_OK) {
            if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) {
                throw new RuntimeException(
                    'An attachment is larger than the server upload limit. Check PHP upload_max_filesize and post_max_size.'
                );
            }

            throw new RuntimeException(
                'An attachment could not be uploaded. Please try again.'
            );
        }

        $size = (int)($files['size'][$i] ?? 0);

        if ($size <= 0 || $size > 20 * 1024 * 1024) {
            throw new RuntimeException(
                'Each attachment must be smaller than or equal to 20MB.'
            );
        }

        $totalSize += $size;

        if ($totalSize > 40 * 1024 * 1024) {
            throw new RuntimeException(
                'The combined attachment size must not exceed 40MB.'
            );
        }

        $originalName = basename(str_replace('\\', '/', $name));
        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

        if (!in_array($extension, $allowedExtensions, true)) {
            throw new RuntimeException(
                'Unsupported attachment type: ' . $originalName
            );
        }

        $tmpName = (string)($files['tmp_name'][$i] ?? '');

        if ($tmpName === '' || !is_uploaded_file($tmpName)) {
            throw new RuntimeException(
                'An uploaded attachment could not be verified. Please try again.'
            );
        }

        $normalized[] = [
            'tmp_name' => $tmpName,
            'original_name' => cleanText($originalName, 255),
            'extension' => $extension,
            'size' => $size
        ];
    }

    return $normalized;
}


// Accept POST only.
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(405, [
        'success' => false,
        'message' => 'Use POST to submit a Purchase Request.'
    ]);
}

$transactionStarted = false;
$movedFiles = [];

try {

    // Receive request JSON from JavaScript.
    $rawRequest = $_POST['request'] ?? '';

    if (!is_string($rawRequest) || $rawRequest === '') {
        jsonResponse(400, [
            'success' => false,
            'message' => 'Purchase Request details were not received.'
        ]);
    }

    $request = json_decode($rawRequest, true);

    if (!is_array($request) || json_last_error() !== JSON_ERROR_NONE) {
        jsonResponse(400, [
            'success' => false,
            'message' => 'Purchase Request details are not valid JSON.'
        ]);
    }


    // Validate required date.
    $requiredDate = (string)($request['requiredDate'] ?? '');
    $dateParts = explode('-', $requiredDate);

    if (
        count($dateParts) !== 3 ||
        !ctype_digit($dateParts[0]) ||
        !ctype_digit($dateParts[1]) ||
        !ctype_digit($dateParts[2]) ||
        !checkdate(
            (int)$dateParts[1],
            (int)$dateParts[2],
            (int)$dateParts[0]
        )
    ) {
        jsonResponse(400, [
            'success' => false,
            'message' => 'Please select a valid required date.'
        ]);
    }


    // UNIPROCUR_REQUIRED_DATE_SERVER_GUARD_20261113
    if (!preg_match('/\A\d{4}-\d{2}-\d{2}\z/D', $requiredDate) ||
        $requiredDate < (new DateTimeImmutable('today', new DateTimeZone('Asia/Manila')))->format('Y-m-d')) {
        jsonResponse(422, ['success' => false, 'message' => 'Required Date cannot be in the past. Choose today or a future date.']);
    }

    // Validate justification.
    $justification = cleanText(
        $request['justification'] ?? '',
        5000
    );

    if ($justification === '') {
        jsonResponse(400, [
            'success' => false,
            'message' => 'Please enter a justification.'
        ]);
    }


    // Validate requested items.
    $itemsInput = $request['items'] ?? null;

    if (
        !is_array($itemsInput) ||
        count($itemsInput) === 0 ||
        count($itemsInput) > 100
    ) {
        jsonResponse(400, [
            'success' => false,
            'message' => 'Add between 1 and 100 items before submitting.'
        ]);
    }

    $items = [];

    foreach ($itemsInput as $index => $item) {

        if (!is_array($item)) {
            throw new RuntimeException(
                'One of the selected items is invalid.'
            );
        }

        $itemName = cleanText($item['name'] ?? '', 200);
        $unit = cleanText($item['unit'] ?? '', 20);
        $itemCode = cleanText($item['code'] ?? '', 30);
        $category = cleanText($item['category'] ?? '', 100);
        $quantityRaw = (string)($item['quantity'] ?? '');

        if (
            $itemName === '' ||
            $unit === '' ||
            !is_numeric($quantityRaw)
        ) {
            throw new RuntimeException(
                'Complete the name, unit, and quantity for item ' . ($index + 1) . '.'
            );
        }

        $quantity = (float)$quantityRaw;

        if (
            !is_finite($quantity) ||
            $quantity <= 0 ||
            $quantity > 99999999.99
        ) {
            throw new RuntimeException(
                'Enter a valid quantity for item ' . ($index + 1) . '.'
            );
        }

        $items[] = [
            'code' => $itemCode,
            'category' => $category,
            'name' => $itemName,
            'unit' => $unit,
            'quantity' => number_format($quantity, 2, '.', '')
        ];
    }


    // Get buyer account.
    $files = uploadedFiles();
    $buyer = getBuyer($conn);

    $buyerId = (int)$buyer['id'];

    $department = cleanText(
        $buyer['department'] ?? '',
        100
    );

    if ($department === '') {
        $department = 'Procurement';
    }


    // Begin one transaction for the PR and all its items.
    $conn->begin_transaction();
    $transactionStarted = true;

    // Use a temporary unique number so the database can assign an ID first.
    $temporaryNumber = 'TMP-' . bin2hex(random_bytes(12));

    $insertPr = $conn->prepare(
        "INSERT INTO purchase_requisitions
            (pr_number, created_by, department, purpose, needed_by, status)
         VALUES (?, ?, ?, ?, ?, 'submitted')"
    );

    $insertPr->bind_param(
        'sisss',
        $temporaryNumber,
        $buyerId,
        $department,
        $justification,
        $requiredDate
    );

    $insertPr->execute();

    $prId = (int)$conn->insert_id;

    $insertPr->close();


    // Generate the final PR number using the assigned ID.
    $requestNumber = 'PR-' . date('Y') . '-' .
        str_pad((string)$prId, 4, '0', STR_PAD_LEFT);

    $updatePr = $conn->prepare(
        'UPDATE purchase_requisitions SET pr_number = ? WHERE id = ?'
    );

    $updatePr->bind_param(
        'si',
        $requestNumber,
        $prId
    );

    $updatePr->execute();
    $updatePr->close();


    // Save all PR items.
    $insertItem = $conn->prepare(
        'INSERT INTO pr_items
            (pr_id, item_code, category, item_name, unit, qty)
         VALUES (?, ?, ?, ?, ?, ?)'
    );

    foreach ($items as $item) {

        $insertItem->bind_param(
            'issssd',
            $prId,
            $item['code'],
            $item['category'],
            $item['name'],
            $item['unit'],
            $item['quantity']
        );

        $insertItem->execute();
    }

    $insertItem->close();


    // Save attachments when files were selected.
    if (count($files) > 0) {

        $uploadDirectory =
            dirname(__DIR__) .
            DIRECTORY_SEPARATOR . 'uploads' .
            DIRECTORY_SEPARATOR . 'purchase-requests';

        if (
            !is_dir($uploadDirectory) &&
            !mkdir($uploadDirectory, 0755, true) &&
            !is_dir($uploadDirectory)
        ) {
            throw new RuntimeException(
                'The server could not create the attachment folder.'
            );
        }

        // Prevent direct browsing of uploaded files.
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

            $storedName =
                bin2hex(random_bytes(16)) .
                '.' . $file['extension'];

            $destination =
                $uploadDirectory .
                DIRECTORY_SEPARATOR . $storedName;

            $relativePath =
                'uploads/purchase-requests/' . $storedName;

            if (!move_uploaded_file($file['tmp_name'], $destination)) {
                throw new RuntimeException(
                    'The server could not save attachment ' .
                    $file['original_name'] . '.'
                );
            }

            $movedFiles[] = $destination;

            $mimeType = 'application/octet-stream';

            if (function_exists('finfo_open')) {

                $fileInfo = finfo_open(FILEINFO_MIME_TYPE);

                if ($fileInfo) {

                    $detectedMime = finfo_file(
                        $fileInfo,
                        $destination
                    );

                    if (
                        is_string($detectedMime) &&
                        $detectedMime !== ''
                    ) {
                        $mimeType = $detectedMime;
                    }

                    finfo_close($fileInfo);
                }
            }

            $insertAttachment->bind_param(
                'isssis',
                $prId,
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


procurementAuditLog(
    $conn,
    $buyer,
    'Purchase Request',
    'Submitted',
    $requestNumber,
    "Purchase Request {$requestNumber} submitted."
);








    // Commit only when all records and files are saved.
    $conn->commit();
    $transactionStarted = false;


    // Tell JavaScript the save succeeded.
    jsonResponse(201, [
        'success' => true,
        'message' => 'Purchase Request submitted successfully.',
        'request_id' => $prId,
        'request_number' => $requestNumber,
        'status' => 'submitted',
        'items_saved' => count($items),
        'attachments_saved' => count($files),
        'buyer' => [
            'full_name' => $buyer['full_name'],
            'email' => $buyer['email']
        ]
    ]);

} catch (Throwable $error) {

    if ($transactionStarted) {
        try {
            $conn->rollback();
        } catch (Throwable $rollbackError) {
            error_log(
                'Purchase Request rollback error: ' .
                $rollbackError->getMessage()
            );
        }
    }

    // Remove any files already moved if the database transaction fails.
    foreach ($movedFiles as $path) {
        if (is_file($path)) {
            @unlink($path);
        }
    }

    error_log(
        'Create Purchase Request Error: ' .
        $error->getMessage()
    );

    $message = $error instanceof mysqli_sql_exception
        ? 'A database error prevented the Purchase Request from being saved. Check the database schema and XAMPP error log.'
        : (
            $error instanceof RuntimeException
                ? $error->getMessage()
                : 'Unable to submit the Purchase Request. Check the server error log.'
        );

    jsonResponse(500, [
        'success' => false,
        'message' => $message
    ]);
}

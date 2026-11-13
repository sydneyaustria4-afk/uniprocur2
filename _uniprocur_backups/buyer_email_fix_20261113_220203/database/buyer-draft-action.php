
<?php
header('Content-Type: application/json; charset=utf-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    require_once __DIR__ . '/uniprocur-session.php';
}

require_once __DIR__ . '/procurement_db_connection.php';

function sendJson(int $status, array $data): void
{
    http_response_code($status);
    echo json_encode(
        $data,
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJson(405, [
        'success' => false,
        'message' => 'Use POST for this action.'
    ]);
}

$transactionStarted = false;
$filesToDelete = [];

try {
    // 1. Identify the active Buyer.
    if (!empty($_SESSION['user_id'])) {
        $userId = (int) $_SESSION['user_id'];

        $buyerStmt = $conn->prepare(
            "SELECT id, role, is_active
             FROM users
             WHERE id = ?
             LIMIT 1"
        );

        $buyerStmt->bind_param('i', $userId);
    } else {
        // Existing local prototype fallback.
        $email = 'clark@company.com';

        $buyerStmt = $conn->prepare(
            "SELECT id, role, is_active
             FROM users
             WHERE email = ?
             LIMIT 1"
        );

        $buyerStmt->bind_param('s', $email);
    }

    $buyerStmt->execute();
    $buyer = $buyerStmt->get_result()->fetch_assoc();
    $buyerStmt->close();

    if (
        !$buyer ||
        $buyer['role'] !== 'buyer' ||
        !(bool) $buyer['is_active']
    ) {
        sendJson(401, [
            'success' => false,
            'message' => 'An active Buyer account is required.'
        ]);
    }

    $buyerId = (int) $buyer['id'];

    // 2. Receive action from JavaScript.
    $input = json_decode(
        file_get_contents('php://input'),
        true
    );

    if (!is_array($input)) {
        sendJson(400, [
            'success' => false,
            'message' => 'Invalid request data.'
        ]);
    }

    $action = strtolower(trim((string) ($input['action'] ?? '')));
    $prNumber = trim((string) ($input['pr_number'] ?? ''));

    if (!in_array($action, ['delete', 'submit'], true)) {
        sendJson(400, [
            'success' => false,
            'message' => 'Invalid Purchase Request action.'
        ]);
    }

    if ($prNumber === '' || strlen($prNumber) > 50) {
        sendJson(400, [
            'success' => false,
            'message' => 'A valid PR number is required.'
        ]);
    }

    // 3. Lock and verify the Buyer's own draft.
    $conn->begin_transaction();
    $transactionStarted = true;

    $findStmt = $conn->prepare(
        "SELECT id, pr_number, purpose, needed_by, status
         FROM purchase_requisitions
         WHERE pr_number = ?
           AND created_by = ?
         LIMIT 1
         FOR UPDATE"
    );

    $findStmt->bind_param('si', $prNumber, $buyerId);
    $findStmt->execute();

    $request = $findStmt->get_result()->fetch_assoc();
    $findStmt->close();

    if (!$request) {
        $conn->rollback();
        $transactionStarted = false;

        sendJson(404, [
            'success' => false,
            'message' => 'Purchase Request not found.'
        ]);
    }

    if (strtolower($request['status']) !== 'draft') {
        $conn->rollback();
        $transactionStarted = false;

        sendJson(409, [
            'success' => false,
            'message' => 'Only draft Purchase Requests can use this action.'
        ]);
    }

    $requestId = (int) $request['id'];

    // =========================================
    // ACTION A: SUBMIT FOR APPROVAL
    // =========================================

    if ($action === 'submit') {

        if (
            trim((string) $request['purpose']) === '' ||
            empty($request['needed_by'])
        ) {
            $conn->rollback();
            $transactionStarted = false;

            sendJson(422, [
                'success' => false,
                'message' => 'Complete the justification and required date before submitting.'
            ]);
        }

        // Make sure every requested item is complete.
        $itemStmt = $conn->prepare(
            "SELECT
                COUNT(*) AS total_items,
                COALESCE(
                    SUM(
                        CASE
                            WHEN TRIM(COALESCE(item_name, '')) = ''
                              OR TRIM(COALESCE(unit, '')) = ''
                              OR qty <= 0
                            THEN 1
                            ELSE 0
                        END
                    ),
                    0
                ) AS incomplete_items
             FROM pr_items
             WHERE pr_id = ?"
        );

        $itemStmt->bind_param('i', $requestId);
        $itemStmt->execute();

        $itemCheck = $itemStmt->get_result()->fetch_assoc();
        $itemStmt->close();

        if (
            (int) $itemCheck['total_items'] === 0 ||
            (int) $itemCheck['incomplete_items'] > 0
        ) {
            $conn->rollback();
            $transactionStarted = false;

            sendJson(422, [
                'success' => false,
                'message' => 'Complete all item names, units, and quantities before submitting.'
            ]);
        }

        // Submit the existing PR without recreating its items.
        $updateStmt = $conn->prepare(
            "UPDATE purchase_requisitions
             SET status = 'submitted'
             WHERE id = ?
               AND created_by = ?
               AND status = 'draft'"
        );

        $updateStmt->bind_param('ii', $requestId, $buyerId);
        $updateStmt->execute();

        if ($updateStmt->affected_rows !== 1) {
            $updateStmt->close();

            throw new RuntimeException(
                'The Purchase Request could not be submitted.'
            );
        }

        $updateStmt->close();

        $conn->commit();
        $transactionStarted = false;

        sendJson(200, [
            'success' => true,
            'message' => 'Purchase Request submitted for Manager approval.',
            'pr_number' => $prNumber,
            'status' => 'submitted'
        ]);
    }

    // =========================================
    // ACTION B: DELETE DRAFT
    // =========================================

    // Get uploaded attachment filenames before deleting records.
    $attachmentStmt = $conn->prepare(
        "SELECT stored_name
         FROM purchase_requisition_attachments
         WHERE pr_id = ?"
    );

    $attachmentStmt->bind_param('i', $requestId);
    $attachmentStmt->execute();

    $attachmentResult = $attachmentStmt->get_result();

    while ($attachment = $attachmentResult->fetch_assoc()) {
        $filesToDelete[] = (string) $attachment['stored_name'];
    }

    $attachmentStmt->close();

    // Delete attachment records.
    $deleteAttachments = $conn->prepare(
        "DELETE FROM purchase_requisition_attachments
         WHERE pr_id = ?"
    );

    $deleteAttachments->bind_param('i', $requestId);
    $deleteAttachments->execute();
    $deleteAttachments->close();

    // Delete associated PR items.
    $deleteItems = $conn->prepare(
        "DELETE FROM pr_items
         WHERE pr_id = ?"
    );

    $deleteItems->bind_param('i', $requestId);
    $deleteItems->execute();
    $deleteItems->close();

    // Delete the actual draft.
    $deleteRequest = $conn->prepare(
        "DELETE FROM purchase_requisitions
         WHERE id = ?
           AND created_by = ?
           AND status = 'draft'"
    );

    $deleteRequest->bind_param('ii', $requestId, $buyerId);
    $deleteRequest->execute();

    if ($deleteRequest->affected_rows !== 1) {
        $deleteRequest->close();

        throw new RuntimeException(
            'The draft could not be deleted.'
        );
    }

    $deleteRequest->close();

    $conn->commit();
    $transactionStarted = false;

    // Remove the physical attachment files after the DB transaction succeeds.
    $uploadDirectory =
        dirname(__DIR__) .
        DIRECTORY_SEPARATOR . 'uploads' .
        DIRECTORY_SEPARATOR . 'purchase-requests';

    foreach ($filesToDelete as $storedName) {
        $safeName = basename($storedName);

        if ($safeName !== '' && $safeName === $storedName) {
            $filePath = $uploadDirectory .
                DIRECTORY_SEPARATOR . $safeName;

            if (is_file($filePath)) {
                @unlink($filePath);
            }
        }
    }

    sendJson(200, [
        'success' => true,
        'message' => 'Draft Purchase Request deleted successfully.',
        'pr_number' => $prNumber
    ]);

} catch (Throwable $error) {

    if ($transactionStarted) {
        try {
            $conn->rollback();
        } catch (Throwable $rollbackError) {
            error_log(
                'Buyer Draft Action Rollback Error: ' .
                $rollbackError->getMessage()
            );
        }
    }

    error_log(
        'Buyer Draft Action Error: ' . $error->getMessage()
    );

    sendJson(500, [
        'success' => false,
        'message' => 'Unable to process the Purchase Request action. Check the PHP error log.'
    ]);
}

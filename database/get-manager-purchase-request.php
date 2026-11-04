<?php
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');

require_once __DIR__ . '/procurement_db_connection.php';
require_once __DIR__ . '/manager-api-common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    managerSendJson(405, [
        'success' => false,
        'message' => 'Use GET to retrieve a Purchase Request.'
    ]);
}

try {
    $manager = requireActiveManager($conn);
    $prNumber = trim((string) ($_GET['pr_number'] ?? ''));

    if ($prNumber === '') {
        managerSendJson(400, [
            'success' => false,
            'message' => 'Purchase Request number is required.'
        ]);
    }

    $requestSql = "
        SELECT
            pr.id,
            pr.pr_number,
            pr.department,
            pr.purpose,
            DATE_FORMAT(pr.needed_by, '%Y-%m-%d') AS needed_by,
            LOWER(pr.status) AS status,
            DATE_FORMAT(pr.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            DATE_FORMAT(pr.approved_at, '%Y-%m-%d %H:%i:%s') AS approved_at,
            pr.rejection_reason,
            pr.manager_remarks,
            pr.created_by,
            creator.full_name AS created_by_name,
            creator.email AS created_by_email,
            decision_maker.full_name AS approved_by_name
        FROM purchase_requisitions AS pr
        LEFT JOIN users AS creator ON creator.id = pr.created_by
        LEFT JOIN users AS decision_maker ON decision_maker.id = pr.approved_by
        WHERE pr.pr_number = ?
        LIMIT 1
    ";

    $stmt = $conn->prepare($requestSql);
    $stmt->bind_param('s', $prNumber);
    $stmt->execute();
    $purchaseRequest = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$purchaseRequest) {
        managerSendJson(404, [
            'success' => false,
            'message' => 'Purchase Request not found.'
        ]);
    }

    $prId = (int) $purchaseRequest['id'];

    $itemStmt = $conn->prepare(
        "SELECT id, item_code, category, item_name, unit, qty
         FROM pr_items WHERE pr_id = ? ORDER BY id ASC"
    );
    $itemStmt->bind_param('i', $prId);
    $itemStmt->execute();
    $itemResult = $itemStmt->get_result();
    $items = [];

    while ($item = $itemResult->fetch_assoc()) {
        $items[] = [
            'id' => (int) $item['id'],
            'item_code' => $item['item_code'],
            'category' => $item['category'],
            'item_name' => $item['item_name'],
            'unit' => $item['unit'],
            'qty' => (float) $item['qty']
        ];
    }
    $itemStmt->close();

    $attachmentStmt = $conn->prepare(
        "SELECT id, original_name, mime_type, file_size
         FROM purchase_requisition_attachments
         WHERE pr_id = ? ORDER BY id ASC"
    );
    $attachmentStmt->bind_param('i', $prId);
    $attachmentStmt->execute();
    $attachmentResult = $attachmentStmt->get_result();
    $attachments = [];

    while ($attachment = $attachmentResult->fetch_assoc()) {
        $attachments[] = [
            'id' => (int) $attachment['id'],
            'name' => $attachment['original_name'],
            'mime_type' => $attachment['mime_type'],
            'file_size' => (int) $attachment['file_size']
        ];
    }
    $attachmentStmt->close();

    $purchaseRequest['id'] = $prId;
    $purchaseRequest['created_by'] = (int) $purchaseRequest['created_by'];

    managerSendJson(200, [
        'success' => true,
        'manager' => [
            'id' => (int) $manager['id'],
            'full_name' => $manager['full_name'],
            'email' => $manager['email']
        ],
        'csrf_token' => managerCsrfToken(),
        'purchase_request' => $purchaseRequest,
        'items' => $items,
        'attachments' => $attachments
    ]);
} catch (Throwable $error) {
    error_log('Get Manager Purchase Request Error: ' . $error->getMessage());
    managerSendJson(500, [
        'success' => false,
        'message' => 'Unable to load the Purchase Request. Check the database schema and PHP error log.'
    ]);
}

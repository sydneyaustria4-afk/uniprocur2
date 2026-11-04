<?php
header('Content-Type: application/json; charset=utf-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

require_once __DIR__ . '/procurement_db_connection.php';

function sendJson(int $statusCode, array $data): void
{
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $prNumber = trim((string) ($_GET['pr_number'] ?? ''));

    if ($prNumber === '') {
        sendJson(400, [
            'success' => false,
            'message' => 'Purchase Request number is required.'
        ]);
    }

    // Resolve the Buyer using the same session / demo fallback used by the
    // Buyer Purchase Request list endpoint.
    if (!empty($_SESSION['user_id'])) {
        $userId = (int) $_SESSION['user_id'];
        $buyerStmt = $conn->prepare(
            "SELECT id, full_name, email, role, is_active
             FROM users WHERE id = ? LIMIT 1"
        );
        $buyerStmt->bind_param('i', $userId);
    } else {
        $email = 'clark@company.com';
        $buyerStmt = $conn->prepare(
            "SELECT id, full_name, email, role, is_active
             FROM users WHERE email = ? LIMIT 1"
        );
        $buyerStmt->bind_param('s', $email);
    }

    $buyerStmt->execute();
    $buyer = $buyerStmt->get_result()->fetch_assoc();
    $buyerStmt->close();

    if (!$buyer || $buyer['role'] !== 'buyer' || !(bool) $buyer['is_active']) {
        sendJson(401, [
            'success' => false,
            'message' => 'A valid active buyer account is required.'
        ]);
    }

    $buyerId = (int) $buyer['id'];

    // Return decision fields so the Buyer can read Manager remarks and the
    // rejection reason. Restrict lookup to the signed-in Buyer’s own PR.
    $sql = "
        SELECT
            pr.id,
            pr.pr_number,
            pr.department,
            pr.purpose,
            DATE_FORMAT(pr.needed_by, '%Y-%m-%d') AS needed_by,
            pr.status,
            pr.rejection_reason,
            pr.manager_remarks,
            DATE_FORMAT(pr.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            DATE_FORMAT(pr.approved_at, '%Y-%m-%d %H:%i:%s') AS approved_at,

            creator.full_name AS created_by_name,
            creator.email AS created_by_email,
            approver.full_name AS approved_by_name

        FROM purchase_requisitions AS pr

        LEFT JOIN users AS creator
            ON creator.id = pr.created_by

        LEFT JOIN users AS approver
            ON approver.id = pr.approved_by

        WHERE pr.pr_number = ?
          AND pr.created_by = ?

        LIMIT 1
    ";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param('si', $prNumber, $buyerId);
    $stmt->execute();

    $purchaseRequest = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$purchaseRequest) {
        sendJson(404, [
            'success' => false,
            'message' => 'Purchase Request not found in this Buyer account.'
        ]);
    }

    $prId = (int) $purchaseRequest['id'];

    $itemSql = "
        SELECT
            id,
            item_code,
            category,
            item_name,
            unit,
            qty
        FROM pr_items
        WHERE pr_id = ?
        ORDER BY id ASC
    ";

    $itemStmt = $conn->prepare($itemSql);
    $itemStmt->bind_param('i', $prId);
    $itemStmt->execute();

    $itemsResult = $itemStmt->get_result();
    $items = [];

    while ($item = $itemsResult->fetch_assoc()) {
        $items[] = $item;
    }

    $itemStmt->close();

    $rfqSql = "
        SELECT
            rfq_number,
            DATE_FORMAT(deadline, '%Y-%m-%d') AS deadline,
            status,
            DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
        FROM rfqs
        WHERE pr_id = ?
        ORDER BY id ASC
    ";

    $rfqStmt = $conn->prepare($rfqSql);
    $rfqStmt->bind_param('i', $prId);
    $rfqStmt->execute();

    $rfqsResult = $rfqStmt->get_result();
    $rfqs = [];

    while ($rfq = $rfqsResult->fetch_assoc()) {
        $rfqs[] = $rfq;
    }

    $rfqStmt->close();

    sendJson(200, [
        'success' => true,
        'buyer' => [
            'full_name' => $buyer['full_name'],
            'email' => $buyer['email']
        ],
        'purchase_request' => $purchaseRequest,
        'items' => $items,
        'rfqs' => $rfqs
    ]);

} catch (Throwable $error) {
    error_log('Buyer Get Purchase Request API Error: ' . $error->getMessage());

    sendJson(500, [
        'success' => false,
        'message' => 'Unable to load Purchase Request. Check the database schema and PHP error log.'
    ]);
}

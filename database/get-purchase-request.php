<?php

header("Content-Type: application/json; charset=utf-8");

require_once __DIR__ . "/procurement_db_connection.php";

function sendJson($statusCode, $data)
{
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

try {

    $prNumber = trim($_GET["pr_number"] ?? "");

    if ($prNumber === "") {
        sendJson(400, [
            "success" => false,
            "message" => "Purchase Request number is required."
        ]);
    }

    // 1. Get Purchase Request details and user information.
    $sql = "
        SELECT
            pr.id,
            pr.pr_number,
            pr.department,
            pr.purpose,
            DATE_FORMAT(pr.needed_by, '%Y-%m-%d') AS needed_by,
            pr.status,
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

        LIMIT 1
    ";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param("s", $prNumber);
    $stmt->execute();

    $purchaseRequest = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$purchaseRequest) {
        sendJson(404, [
            "success" => false,
            "message" => "Purchase Request not found."
        ]);
    }

    $prId = (int) $purchaseRequest["id"];

    // 2. Get the requested items.
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
    $itemStmt->bind_param("i", $prId);
    $itemStmt->execute();

    $itemsResult = $itemStmt->get_result();

    $items = [];

    while ($item = $itemsResult->fetch_assoc()) {
        $items[] = $item;
    }

    $itemStmt->close();

    // 3. Get RFQs already created for this Purchase Request.
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
    $rfqStmt->bind_param("i", $prId);
    $rfqStmt->execute();

    $rfqsResult = $rfqStmt->get_result();

    $rfqs = [];

    while ($rfq = $rfqsResult->fetch_assoc()) {
        $rfqs[] = $rfq;
    }

    $rfqStmt->close();

    // 4. Return all data as JSON.
    sendJson(200, [
        "success" => true,
        "purchase_request" => $purchaseRequest,
        "items" => $items,
        "rfqs" => $rfqs
    ]);

} catch (Throwable $e) {

    error_log("Purchase Request API Error: " . $e->getMessage());

    sendJson(500, [
        "success" => false,
        "message" => "Unable to load Purchase Request."
    ]);
}
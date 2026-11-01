<?php

header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/procurement_db_connection.php';

function sendJson(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJson(405, [
        'success' => false,
        'message' => 'Use GET to retrieve approved Purchase Requests.'
    ]);
}

try {
    $sql = "
        SELECT
            pr.id,
            pr.pr_number,
            COALESCE(
                GROUP_CONCAT(
                    DISTINCT pi.item_name
                    ORDER BY pi.id ASC
                    SEPARATOR ', '
                ),
                ''
            ) AS items,
            DATE_FORMAT(pr.approved_at, '%M %e, %Y') AS approved_at_display,
            DATE_FORMAT(pr.needed_by, '%M %e, %Y') AS needed_by_display
        FROM purchase_requisitions AS pr
        LEFT JOIN pr_items AS pi
            ON pi.pr_id = pr.id
        WHERE LOWER(pr.status) = 'approved'
          AND NOT EXISTS (
              SELECT 1
              FROM rfqs AS rfq
              WHERE rfq.pr_id = pr.id
          )
        GROUP BY
            pr.id,
            pr.pr_number,
            pr.approved_at,
            pr.needed_by,
            pr.created_at
        ORDER BY
            pr.approved_at DESC,
            pr.created_at DESC
    ";

    $result = $conn->query($sql);
    $requests = [];

    while ($row = $result->fetch_assoc()) {
        $requests[] = $row;
    }

    sendJson(200, [
        'success' => true,
        'requests' => $requests,
        'count' => count($requests)
    ]);

} catch (Throwable $error) {
    error_log('Get Approved Purchase Requests Error: ' . $error->getMessage());

    sendJson(500, [
        'success' => false,
        'message' => 'Unable to retrieve approved Purchase Requests. Check the database connection and PHP error log.'
    ]);
}

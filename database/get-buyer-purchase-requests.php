<?php
header('Content-Type: application/json; charset=utf-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    require_once __DIR__ . '/uniprocur-session.php';
}

require_once __DIR__ . '/procurement_db_connection.php';

function sendJson(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    // Use the authenticated user when available. The seeded Buyer fallback is
    // retained for the current localhost prototype, matching PR creation.
    if (!empty($_SESSION['user_id'])) {
        $userId = (int) $_SESSION['user_id'];

        $buyerStmt = $conn->prepare(
            "SELECT id, full_name, email, role, is_active
             FROM users
             WHERE id = ?
             LIMIT 1"
        );
        $buyerStmt->bind_param('i', $userId);
    } else {
        $email = 'buyer@gmail.com';

        $buyerStmt = $conn->prepare(
            "SELECT id, full_name, email, role, is_active
             FROM users
             WHERE email = ?
             LIMIT 1"
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

    // Include all four Buyer-visible PR states. Manager decisions update the
    // same purchase_requisitions row, so they appear here on the next refresh.
    $sql = "
        SELECT
            pr.id,
            pr.pr_number AS number,

            COALESCE(
                NULLIF(
                    GROUP_CONCAT(
                        NULLIF(pi.item_name, '')
                        ORDER BY pi.id ASC
                        SEPARATOR ', '
                    ),
                    ''
                ),
                'Purchase Request'
            ) AS task,

            COALESCE(
                NULLIF(
                    GROUP_CONCAT(
                        DISTINCT NULLIF(pi.item_code, '')
                        ORDER BY pi.item_code ASC
                        SEPARATOR ', '
                    ),
                    ''
                ),
                '—'
            ) AS item_code,

            COALESCE(
                NULLIF(
                    GROUP_CONCAT(
                        DISTINCT NULLIF(pi.category, '')
                        ORDER BY pi.category ASC
                        SEPARATOR ', '
                    ),
                    ''
                ),
                '—'
            ) AS category,

            '—' AS amount,

            CASE
                WHEN LOWER(pr.status) = 'submitted' THEN 'Pending'
                WHEN LOWER(pr.status) = 'draft' THEN 'Draft'
                WHEN LOWER(pr.status) = 'approved' THEN 'Approved'
                WHEN LOWER(pr.status) = 'rejected' THEN 'Rejected'
                ELSE CONCAT(
                    UPPER(LEFT(pr.status, 1)),
                    SUBSTRING(pr.status, 2)
                )
            END AS status,

            DATE_FORMAT(pr.needed_by, '%Y-%m-%d') AS required_date,
            DATE_FORMAT(pr.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            DATE_FORMAT(pr.approved_at, '%Y-%m-%d %H:%i:%s') AS decision_at

        FROM purchase_requisitions AS pr

        LEFT JOIN pr_items AS pi
            ON pi.pr_id = pr.id

        WHERE pr.created_by = ?
          AND LOWER(pr.status) IN ('draft', 'submitted', 'approved', 'rejected')
          AND NOT EXISTS (SELECT 1 FROM procurement_audit_logs AS deleted_pr WHERE deleted_pr.reference_number = (pr.pr_number COLLATE utf8mb4_unicode_ci) AND deleted_pr.action_name = 'PR Archived')

        GROUP BY
            pr.id,
            pr.pr_number,
            pr.status,
            pr.needed_by,
            pr.created_at,
            pr.approved_at

        ORDER BY
            pr.created_at DESC,
            pr.id DESC
    ";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param('i', $buyerId);
    $stmt->execute();

    $result = $stmt->get_result();
    $requests = [];

    while ($row = $result->fetch_assoc()) {
        $requests[] = $row;
    }

    $stmt->close();

    sendJson(200, [
        'success' => true,
        'buyer' => [
            'full_name' => $buyer['full_name'],
            'email' => $buyer['email']
        ],
        'requests' => $requests,
        'count' => count($requests)
    ]);

} catch (Throwable $error) {
    error_log('Get Buyer Purchase Requests Error: ' . $error->getMessage());

    sendJson(500, [
        'success' => false,
        'message' => 'Unable to retrieve Purchase Requests. Check the database and PHP error log.'
    ]);
}

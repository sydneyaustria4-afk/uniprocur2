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

function getActiveManager(mysqli $conn): ?array
{
    if (!empty($_SESSION['user_id'])) {
        $userId = (int) $_SESSION['user_id'];
        $stmt = $conn->prepare(
            'SELECT id, full_name, email, role, is_active
             FROM users
             WHERE id = ?
             LIMIT 1'
        );
        $stmt->bind_param('i', $userId);
    } else {
        // Local development fallback only. Remove when HR SSO/session is connected.
        $host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
        $isLocal = strpos($host, 'localhost') === 0 || strpos($host, '127.0.0.1') === 0;
        if (!$isLocal) {
            return null;
        }

        $email = 'carlo@company.com';
        $stmt = $conn->prepare(
            'SELECT id, full_name, email, role, is_active
             FROM users
             WHERE email = ?
             LIMIT 1'
        );
        $stmt->bind_param('s', $email);
    }

    $stmt->execute();
    $manager = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (
        !$manager ||
        strtolower((string) $manager['role']) !== 'manager' ||
        !(bool) $manager['is_active']
    ) {
        return null;
    }

    return $manager;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    sendJson(405, [
        'success' => false,
        'message' => 'Use GET to retrieve Manager Purchase Requests.'
    ]);
}

try {
    $manager = getActiveManager($conn);

    if (!$manager) {
        sendJson(401, [
            'success' => false,
            'message' => 'An active Manager account is required. Check that carlo@company.com exists with role = manager and is_active = 1, or sign in through the Manager session.'
        ]);
    }

    // Draft requests are not part of the Manager approval queue.
    // Only submitted, approved, and rejected requests are listed here.
    $sql = "
        SELECT
            pr.id,
            pr.pr_number,
            CASE
                WHEN LOWER(pr.status) = 'submitted' THEN 'pending'
                WHEN LOWER(pr.status) = 'approved' THEN 'approved'
                WHEN LOWER(pr.status) = 'rejected' THEN 'rejected'
                ELSE LOWER(pr.status)
            END AS status,
            COALESCE(
                NULLIF(
                    GROUP_CONCAT(
                        DISTINCT NULLIF(pi.item_name, '')
                        ORDER BY pi.item_name ASC
                        SEPARATOR ', '
                    ),
                    ''
                ),
                'Purchase Request'
            ) AS items,
            COALESCE(
                NULLIF(
                    GROUP_CONCAT(
                        DISTINCT NULLIF(pi.category, '')
                        ORDER BY pi.category ASC
                        SEPARATOR ', '
                    ),
                    ''
                ),
                ''
            ) AS categories,
            CONCAT_WS(
                ' / ',
                NULLIF(
                    GROUP_CONCAT(
                        DISTINCT NULLIF(pi.item_name, '')
                        ORDER BY pi.item_name ASC
                        SEPARATOR ', '
                    ),
                    ''
                ),
                NULLIF(
                    GROUP_CONCAT(
                        DISTINCT NULLIF(pi.category, '')
                        ORDER BY pi.category ASC
                        SEPARATOR ', '
                    ),
                    ''
                )
            ) AS items_and_categories,
            COALESCE(SUM(pi.qty), 0) AS total_quantity,
            DATE_FORMAT(pr.created_at, '%M %d, %Y') AS created_at_display,
            DATE_FORMAT(pr.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
        FROM purchase_requisitions AS pr
        LEFT JOIN pr_items AS pi
            ON pi.pr_id = pr.id
        WHERE LOWER(pr.status) IN ('submitted', 'approved', 'rejected')
        GROUP BY
            pr.id,
            pr.pr_number,
            pr.status,
            pr.created_at
        ORDER BY
            pr.created_at DESC,
            pr.id DESC
    ";

    $result = $conn->query($sql);
    $requests = [];
    $summary = [
        'total' => 0,
        'pending' => 0,
        'approved' => 0,
        'rejected' => 0
    ];

    while ($row = $result->fetch_assoc()) {
        $status = strtolower((string) $row['status']);
        $summary['total']++;
        if (isset($summary[$status])) {
            $summary[$status]++;
        }
        $requests[] = $row;
    }

    sendJson(200, [
        'success' => true,
        'manager' => [
            'full_name' => $manager['full_name'],
            'email' => $manager['email']
        ],
        'summary' => $summary,
        'requests' => $requests,
        'count' => count($requests)
    ]);

} catch (Throwable $error) {
    error_log('Get Manager Purchase Requests Error: ' . $error->getMessage());
    sendJson(500, [
        'success' => false,
        'message' => 'Unable to retrieve Manager Purchase Requests. Check the database connection and PHP error log.'
    ]);
}

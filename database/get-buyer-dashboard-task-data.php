
<?php
header('Content-Type: application/json; charset=utf-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    require_once __DIR__ . '/uniprocur-session.php';
}

require_once __DIR__ . '/procurement_db_connection.php';

function taskJson(int $status, array $data): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    // Verify Buyer.
    if (!empty($_SESSION['user_id'])) {
        $userId = (int) $_SESSION['user_id'];

        $buyerStmt = $conn->prepare(
            "SELECT id, role, is_active
             FROM users WHERE id = ? LIMIT 1"
        );
        $buyerStmt->bind_param('i', $userId);

    } else {
        $email = (require __DIR__ . '/buyer-demo-email.php');

        $buyerStmt = $conn->prepare(
            "SELECT id, role, is_active
             FROM users WHERE email = ? LIMIT 1"
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
        taskJson(401, [
            'success' => false,
            'message' => 'Active Buyer account required.'
        ]);
    }

    $buyerId = (int) $buyer['id'];

    // =====================================
    // 1. PURCHASE REQUESTS ALREADY
    //    CONVERTED INTO RFQs
    // =====================================

    $rfqPrStmt = $conn->prepare(
        "SELECT DISTINCT r.pr_id
         FROM rfqs AS r
         INNER JOIN purchase_requisitions AS pr
            ON pr.id = r.pr_id
         WHERE r.created_by = ?
           AND pr.created_by = ?"
    );

    $rfqPrStmt->bind_param('ii', $buyerId, $buyerId);
    $rfqPrStmt->execute();

    $rfqPrResult = $rfqPrStmt->get_result();

    $rfqPrIds = [];

    while ($row = $rfqPrResult->fetch_assoc()) {
        $rfqPrIds[] = (int) $row['pr_id'];
    }

    $rfqPrStmt->close();

    // =====================================
    // 2. RFQs AWAITING QUOTATION
    // =====================================

    $rfqSql = "
        SELECT
            r.id,
            r.pr_id,
            r.rfq_number AS number,

            COALESCE(
                NULLIF(
                    GROUP_CONCAT(
                        DISTINCT pi.item_name
                        ORDER BY pi.item_name
                        SEPARATOR ', '
                    ),
                    ''
                ),
                'Request for Quotation'
            ) AS task,

            COUNT(DISTINCT pi.id) AS item_count,

            COUNT(DISTINCT q.id) AS supplier_count,

            COUNT(DISTINCT CASE
                WHEN q.total_amount IS NULL THEN q.id
            END) AS awaiting_supplier_count,

            DATE_FORMAT(
                r.created_at,
                '%Y-%m-%d %H:%i:%s'
            ) AS created_at,

            DATE_FORMAT(
                r.deadline,
                '%Y-%m-%d'
            ) AS required_date,

            r.status

        FROM rfqs AS r

        INNER JOIN purchase_requisitions AS pr
            ON pr.id = r.pr_id

        LEFT JOIN pr_items AS pi
            ON pi.pr_id = pr.id

        LEFT JOIN rfq_quotes AS q
            ON q.rfq_id = r.id

        WHERE r.created_by = ?
          AND pr.created_by = ?
          AND LOWER(COALESCE(r.status, 'sent'))
              IN (
                'sent',
                'open',
                'pending',
                'awaiting_quotation'
              )

        GROUP BY
            r.id,
            r.pr_id,
            r.rfq_number,
            r.created_at,
            r.deadline,
            r.status

        HAVING
            COUNT(DISTINCT q.id) = 0
            OR
            COUNT(DISTINCT CASE
                WHEN q.total_amount IS NULL THEN q.id
            END) > 0

        ORDER BY
            r.created_at DESC,
            r.id DESC
    ";

    $rfqStmt = $conn->prepare($rfqSql);
    $rfqStmt->bind_param('ii', $buyerId, $buyerId);
    $rfqStmt->execute();

    $rfqResult = $rfqStmt->get_result();
    $rfqs = [];

    while ($row = $rfqResult->fetch_assoc()) {
        $rfqs[] = $row;
    }

    $rfqStmt->close();

    // =====================================
    // 3. INVOICES READY TO POST
    // =====================================

    $invoiceSql = "
        SELECT
            i.id,
            i.invoice_number AS number,
            i.po_id,

            COALESCE(
                NULLIF(
                    GROUP_CONCAT(
                        DISTINCT ii.item_name
                        ORDER BY ii.item_name
                        SEPARATOR ', '
                    ),
                    ''
                ),
                'Supplier Invoice'
            ) AS task,

            COUNT(DISTINCT ii.id) AS item_count,

            i.total_amount,

            COALESCE(i.status, 'pending') AS status,

            DATE_FORMAT(
                i.invoice_date,
                '%Y-%m-%d'
            ) AS start_date,

            DATE_FORMAT(
                i.due_date,
                '%Y-%m-%d'
            ) AS due_date,

            DATE_FORMAT(
                i.created_at,
                '%Y-%m-%d %H:%i:%s'
            ) AS created_at

        FROM invoices AS i

        LEFT JOIN invoice_items AS ii
            ON ii.invoice_id = i.id

        WHERE i.created_by = ?

          AND LOWER(COALESCE(i.status, 'pending'))
              NOT IN (
                'posted',
                'paid',
                'cancelled',
                'canceled',
                'void',
                'closed'
              )

        GROUP BY
            i.id,
            i.invoice_number,
            i.po_id,
            i.total_amount,
            i.status,
            i.invoice_date,
            i.due_date,
            i.created_at

        ORDER BY
            i.created_at DESC,
            i.id DESC
    ";

    $invoiceStmt = $conn->prepare($invoiceSql);
    $invoiceStmt->bind_param('i', $buyerId);
    $invoiceStmt->execute();

    $invoiceResult = $invoiceStmt->get_result();
    $invoices = [];

    while ($row = $invoiceResult->fetch_assoc()) {
        $invoices[] = $row;
    }

    $invoiceStmt->close();

    taskJson(200, [
        'success' => true,

        'rfqs' => $rfqs,

        'rfq_pr_ids' => $rfqPrIds,

        'invoices' => $invoices,

        'counts' => [
            'rfqs' => count($rfqs),
            'invoices' => count($invoices)
        ]
    ]);

} catch (Throwable $error) {

    error_log(
        'Buyer Dashboard Task Data Error: ' .
        $error->getMessage()
    );

    taskJson(500, [
        'success' => false,
        'message' => 'Unable to retrieve RFQ and Invoice tasks.'
    ]);
}

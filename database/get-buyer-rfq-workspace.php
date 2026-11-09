<?php
/**
 * Read-only RFQ Workspace listing, using the same authorized Buyer identity as
 * UniProcur's existing Buyer Purchase Order endpoints.
 * No inserts, updates, fake quotations, or status transitions occur here.
 */
require_once __DIR__ . '/buyer-po-common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    buyerPoJson(405, ['success' => false, 'message' => 'GET required.']);
}

try {
    $buyer = buyerPoIdentity($conn);
    $buyerId = (int) $buyer['id'];

    // Aggregate PR items and supplier quotations separately to avoid inflated
    // counts from joining multiple PR items to multiple supplier quotations.
    // Keep saved quotations separate from simulated readiness; the latter is
    // available on view-rfq.html through get-rfq-demo-status.php.
    $sql = "SELECT
                r.id,
                r.rfq_number,
                LOWER(COALESCE(r.status, 'open')) AS status,
                DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                DATE_FORMAT(r.deadline, '%Y-%m-%d') AS deadline,
                r.warehouse_value,
                pr.pr_number,
                COALESCE(pritems.item_summary, '') AS item_summary,
                COALESCE(pritems.item_count, 0) AS item_count,
                COALESCE(q.supplier_count, 0) AS supplier_count,
                COALESCE(q.saved_quote_count, 0) AS saved_quote_count,
                q.winner_quote_id,
                q.winning_amount,
                winner.name AS winning_supplier,
                po.po_number AS existing_po_number
            FROM rfqs AS r
            JOIN purchase_requisitions AS pr ON pr.id = r.pr_id
            LEFT JOIN (
                SELECT pr_id,
                       COUNT(*) AS item_count,
                       GROUP_CONCAT(item_name ORDER BY id SEPARATOR ', ') AS item_summary
                FROM pr_items
                GROUP BY pr_id
            ) AS pritems ON pritems.pr_id = pr.id
            LEFT JOIN (
                SELECT rfq_id,
                       COUNT(*) AS supplier_count,
                       SUM(CASE WHEN total_amount IS NOT NULL THEN 1 ELSE 0 END) AS saved_quote_count,
                       MAX(CASE WHEN is_winner = 1 THEN id ELSE NULL END) AS winner_quote_id,
                       MAX(CASE WHEN is_winner = 1 THEN supplier_id ELSE NULL END) AS winner_supplier_id,
                       MAX(CASE WHEN is_winner = 1 THEN total_amount ELSE NULL END) AS winning_amount
                FROM rfq_quotes
                GROUP BY rfq_id
            ) AS q ON q.rfq_id = r.id
            LEFT JOIN suppliers AS winner ON winner.id = q.winner_supplier_id
            LEFT JOIN (
                SELECT rfq_id, MIN(po_number) AS po_number
                FROM purchase_orders
                WHERE LOWER(status) NOT IN ('cancelled','canceled')
                GROUP BY rfq_id
            ) AS po ON po.rfq_id = r.id
            WHERE r.created_by = ? AND pr.created_by = ?
            ORDER BY r.created_at DESC, r.id DESC";

    $stmt = $conn->prepare($sql);
    if (!$stmt) throw new RuntimeException('Unable to prepare RFQ listing query.');
    $stmt->bind_param('ii', $buyerId, $buyerId);
    $stmt->execute();
    $rfqs = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    buyerPoJson(200, [
        'success' => true,
        'buyer' => [
            'full_name' => $buyer['full_name'],
            'email' => $buyer['email'],
        ],
        'rfqs' => $rfqs,
        'count' => count($rfqs),
    ]);
} catch (Throwable $error) {
    error_log('RFQ Workspace listing: ' . $error->getMessage());
    buyerPoJson(500, [
        'success' => false,
        'message' => 'Unable to load RFQ Workspace. Check PHP and MySQL error logs.'
    ]);
}

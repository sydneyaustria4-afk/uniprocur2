<?php
/** Buyer New PO chooser: only their awarded RFQs and winning quotations. */
require_once __DIR__ . '/buyer-po-common.php';
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    buyerPoJson(405, ['success' => false, 'message' => 'GET required.']);
}
try {
    $buyer = buyerPoIdentity($conn);
    $buyerId = (int) $buyer['id'];
    $stmt = $conn->prepare(
        "SELECT r.rfq_number, DATE_FORMAT(r.deadline, '%Y-%m-%d') AS deadline,
                q.id AS quote_id, s.name AS supplier_name, q.total_amount,
                po.po_number AS existing_po_number, po.status AS existing_po_status
         FROM rfqs AS r
         JOIN purchase_requisitions AS pr ON pr.id = r.pr_id
         JOIN rfq_quotes AS q ON q.rfq_id = r.id AND q.is_winner = 1
         JOIN suppliers AS s ON s.id = q.supplier_id
         LEFT JOIN purchase_orders AS po
            ON po.rfq_quote_id = q.id AND po.created_by = r.created_by
               AND LOWER(po.status) NOT IN ('cancelled', 'canceled')
         WHERE r.created_by = ? AND pr.created_by = ? AND LOWER(r.status) = 'awarded'
         ORDER BY r.id DESC, po.id DESC"
    );
    $stmt->bind_param('ii', $buyerId, $buyerId);
    $stmt->execute();
    $rows = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    // One entry per RFQ, preferring an existing PO to avoid duplicate creation.
    $results = [];
    foreach ($rows as $row) {
        if (!isset($results[$row['rfq_number']])) $results[$row['rfq_number']] = $row;
    }
    buyerPoJson(200, ['success' => true, 'rfqs' => array_values($results)]);
} catch (Throwable $error) {
    error_log('Buyer Awarded RFQs: ' . $error->getMessage());
    buyerPoJson(500, ['success' => false, 'message' => 'Unable to retrieve awarded RFQs. Check PHP and MySQL logs.']);
}

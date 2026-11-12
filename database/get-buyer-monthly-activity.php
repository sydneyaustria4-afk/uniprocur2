<?php
/**
 * Buyer Dashboard: count successful PURCHASES, not documents or peso amounts.
 * One distinct Purchase Order is counted once, provided it has at least one
 * invoice whose CURRENT status is approved / posted / paid / completed.
 * Until Finance supplies an approval timestamp, use the earliest eligible
 * invoice's created_at. Never claim this is the actual approval date.
 */
declare(strict_types=1);
require_once __DIR__ . '/buyer-po-common.php';
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    buyerPoJson(405, ['success' => false, 'message' => 'GET required.']);
}
try {
    $buyer = buyerPoIdentity($conn);
    $buyerId = (int) $buyer['id'];
    $now = new DateTimeImmutable('now', new DateTimeZone('Asia/Manila'));
    $rawYear = $_GET['year'] ?? $now->format('Y');
    if (!is_string($rawYear) || !preg_match('/\A20\d{2}\z/D', $rawYear)) {
        buyerPoJson(422, ['success' => false, 'message' => 'Invalid year.']);
    }
    $year = (int) $rawYear;
    $start = sprintf('%04d-01-01 00:00:00', $year);
    $end = sprintf('%04d-01-01 00:00:00', $year + 1);

    // Intentionally distinct per PO. One PO with multiple invoices isn't
    // counted more than once. Non-final statuses (pending_match,
    // ready_to_post, discrepancy, etc.) must NOT count as successful purchases.
    $sql = "SELECT MONTH(a.first_eligible_invoice_at) AS purchase_month,
                   COUNT(*) AS purchases
            FROM (
                SELECT i.po_id, MIN(i.created_at) AS first_eligible_invoice_at
                FROM invoices AS i
                INNER JOIN purchase_orders AS po ON po.id = i.po_id
                INNER JOIN rfqs AS r ON r.id = po.rfq_id
                INNER JOIN purchase_requisitions AS pr ON pr.id = r.pr_id
                WHERE i.created_by = ? AND po.created_by = ?
                  AND r.created_by = ? AND pr.created_by = ?
                  AND LOWER(i.status) IN ('approved','posted','paid','completed')
                  AND LOWER(po.status) NOT IN ('cancelled','canceled')
                GROUP BY i.po_id
            ) AS a
            WHERE a.first_eligible_invoice_at >= ?
              AND a.first_eligible_invoice_at < ?
            GROUP BY MONTH(a.first_eligible_invoice_at)";
    $stmt = $conn->prepare($sql);
    if (!$stmt) {
        throw new RuntimeException('Could not prepare monthly purchase query.');
    }
    $stmt->bind_param('iiiiss', $buyerId, $buyerId, $buyerId, $buyerId, $start, $end);
    $stmt->execute();
    $monthly = array_fill(0, 12, 0);
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
        $idx = (int) $row['purchase_month'] - 1;
        if ($idx >= 0 && $idx < 12) {
            $monthly[$idx] = (int) $row['purchases'];
        }
    }
    $stmt->close();
    buyerPoJson(200, [
        'success' => true,
        'year' => $year,
        'monthly' => $monthly,
        'total_successful_purchases' => array_sum($monthly),
        'unit' => 'successful_purchase_count',
        'eligible_invoice_statuses' => ['approved', 'posted', 'paid', 'completed'],
        'date_basis' => 'Earliest eligible invoice created_at for a PO, because no Finance approval timestamp is available yet.',
        'target_threshold' => null,
        'read_only' => true,
    ]);
} catch (Throwable $e) {
    error_log('Monthly Successful Purchases: ' . $e->getMessage());
    buyerPoJson(500, ['success' => false, 'message' => 'Unable to load successful purchase counts. Check PHP/MySQL logs.']);
}

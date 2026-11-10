<?php
/**
 * UniProcur Buyer Reports — read-only, scoped to the signed-in Buyer's own
 * PR -> RFQ -> PO chain. Values represent approved PO commitments ONLY.
 * They are not Finance-verified spend, invoices, or cash payments.
 * No schema migration is needed; uses current Procurement MySQL tables.
 */
require_once __DIR__ . '/buyer-po-common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    buyerPoJson(405, ['success' => false, 'message' => 'GET required.']);
}

try {
    $buyer = buyerPoIdentity($conn);
    $buyerId = (int) $buyer['id'];
    $today = new DateTimeImmutable('now', new DateTimeZone('Asia/Manila'));
    $thisYear = (int) $today->format('Y');
    $thisMonth = (int) $today->format('n');

    $yearString = $_GET['year'] ?? (string) $thisYear;
    $quarterString = $_GET['quarter'] ?? '0';
    if (!is_string($yearString) || !preg_match('/\A\d{4}\z/D', $yearString)
        || (int) $yearString < 2000 || (int) $yearString > 2100) {
        buyerPoJson(422, ['success' => false, 'message' => 'Please choose a valid year.']);
    }
    if (!is_string($quarterString) || !preg_match('/\A[0-4]\z/D', $quarterString)) {
        buyerPoJson(422, ['success' => false, 'message' => 'Please choose a valid quarter.']);
    }
    $year = (int) $yearString;
    $quarter = (int) $quarterString;
    $startMonth = $quarter === 0 ? 1 : (($quarter - 1) * 3 + 1);
    $lastMonth = $quarter === 0 ? 12 : $startMonth + 2;
    $start = sprintf('%04d-%02d-01', $year, $startMonth);
    $end = $lastMonth === 12 ? sprintf('%04d-01-01', $year + 1) : sprintf('%04d-%02d-01', $year, $lastMonth + 1);

    $approved = "('approved','issued','partial','received','closed')";
    $dateExpr = 'COALESCE(po.order_date, DATE(po.created_at))';
    $ownership = 'po.created_by = ? AND rf.created_by = ? AND pr.created_by = ?';
    $joins = 'FROM purchase_orders po
        INNER JOIN rfqs rf ON rf.id = po.rfq_id
        INNER JOIN purchase_requisitions pr ON pr.id = rf.pr_id';
    $interval = "{$dateExpr} >= ? AND {$dateExpr} < ?";

    // Total approved PO value each month; other months are zero (including future months).
    $monthly = array_fill(0, 12, 0.0);
    $stmt = $conn->prepare("SELECT MONTH({$dateExpr}) AS month_num, SUM(po.total_amount) AS total
        {$joins}
        WHERE {$ownership} AND {$interval}
          AND LOWER(po.status) IN {$approved}
        GROUP BY MONTH({$dateExpr})");
    $stmt->bind_param('iiiss', $buyerId, $buyerId, $buyerId, $start, $end);
    $stmt->execute();
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
        $index = (int) $row['month_num'] - 1;
        if ($index >= 0 && $index < 12) {
            $monthly[$index] = round((float) $row['total'], 2);
        }
    }
    $stmt->close();
    $totalApproved = round(array_sum($monthly), 2);

    // Total POs created includes drafts and rejected POs but excludes cancelled ones.
    $stmt = $conn->prepare("SELECT COUNT(*) AS total,
           COALESCE(SUM(LOWER(po.status) = 'pending_approval'), 0) AS pending
        {$joins}
        WHERE {$ownership} AND {$interval}
          AND LOWER(po.status) NOT IN ('cancelled','canceled')");
    $stmt->bind_param('iiiss', $buyerId, $buyerId, $buyerId, $start, $end);
    $stmt->execute();
    $poCounts = $stmt->get_result()->fetch_assoc() ?: [];
    $stmt->close();

    // Supplier ranking only considers actual approved PO commitments.
    $stmt = $conn->prepare("SELECT s.id AS supplier_id, s.name AS supplier_name,
           COUNT(po.id) AS total_orders, COALESCE(SUM(po.total_amount), 0) AS amount
        {$joins}
        INNER JOIN suppliers s ON s.id = po.supplier_id
        WHERE {$ownership} AND {$interval}
          AND LOWER(po.status) IN {$approved}
        GROUP BY s.id, s.name
        ORDER BY amount DESC, s.name ASC");
    $stmt->bind_param('iiiss', $buyerId, $buyerId, $buyerId, $start, $end);
    $stmt->execute();
    $suppliers = [];
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
        $suppliers[] = [
            'supplier_id' => (int) $row['supplier_id'],
            'supplier_name' => (string) $row['supplier_name'],
            'total_orders' => (int) $row['total_orders'],
            'amount' => round((float) $row['amount'], 2),
        ];
    }
    $stmt->close();
    $topSupplier = $suppliers[0] ?? null;
    if ($topSupplier) {
        $topSupplier['share_percent'] = $totalApproved > 0
            ? round($topSupplier['amount'] / $totalApproved * 100, 1) : 0;
    }

    // Category: look up the original PR category via item name, without duplicating
    // PO item rows when multiple PR lines share the same item name.
    $stmt = $conn->prepare("SELECT
          COALESCE(NULLIF(TRIM(cm.category), ''), 'Uncategorized') AS category,
          COALESCE(SUM(COALESCE(pi.subtotal, pi.qty_ordered * pi.unit_price, 0)), 0) AS amount
        {$joins}
        INNER JOIN po_items pi ON pi.po_id = po.id
        LEFT JOIN (
          SELECT pr_id, LOWER(TRIM(item_name)) AS item_key,
                 MIN(NULLIF(TRIM(category), '')) AS category
          FROM pr_items
          GROUP BY pr_id, LOWER(TRIM(item_name))
        ) cm ON cm.pr_id = pr.id AND cm.item_key = LOWER(TRIM(pi.item_name))
        WHERE {$ownership} AND {$interval}
          AND LOWER(po.status) IN {$approved}
        GROUP BY category
        ORDER BY amount DESC, category ASC");
    $stmt->bind_param('iiiss', $buyerId, $buyerId, $buyerId, $start, $end);
    $stmt->execute();
    $categories = [];
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
        $amount = round((float) $row['amount'], 2);
        if ($amount > 0) $categories[] = ['name' => (string) $row['category'], 'amount' => $amount];
    }
    $stmt->close();

    // Recent high-value POs: largest approved PO transactions in selected period.
    $stmt = $conn->prepare("SELECT po.po_number,
          DATE_FORMAT({$dateExpr}, '%Y-%m-%d') AS order_date,
          po.total_amount AS amount, s.name AS supplier_name,
          COALESCE(items.item_summary, '—') AS item_summary
        {$joins}
        INNER JOIN suppliers s ON s.id = po.supplier_id
        LEFT JOIN (
          SELECT pi.po_id, GROUP_CONCAT(pi.item_name ORDER BY pi.id SEPARATOR ', ') AS item_summary
          FROM po_items pi GROUP BY pi.po_id
        ) items ON items.po_id = po.id
        WHERE {$ownership} AND {$interval}
          AND LOWER(po.status) IN {$approved}
        ORDER BY po.total_amount DESC, {$dateExpr} DESC, po.id DESC
        LIMIT 8");
    $stmt->bind_param('iiiss', $buyerId, $buyerId, $buyerId, $start, $end);
    $stmt->execute();
    $transactions = [];
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
        $transactions[] = [
            'po_number' => (string) $row['po_number'],
            'order_date' => (string) $row['order_date'],
            'supplier_name' => (string) $row['supplier_name'],
            'item_summary' => (string) $row['item_summary'],
            'amount' => round((float) $row['amount'], 2),
        ];
    }
    $stmt->close();

    // Choose years with POs owned by this Buyer, plus the current calendar year.
    $stmt = $conn->prepare("SELECT DISTINCT YEAR({$dateExpr}) AS report_year
       {$joins}
       WHERE {$ownership} AND LOWER(po.status) NOT IN ('cancelled','canceled')
       ORDER BY report_year DESC");
    $stmt->bind_param('iii', $buyerId, $buyerId, $buyerId);
    $stmt->execute();
    $availableYears = [$thisYear, $year];
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
        $value = (int) $row['report_year'];
        if ($value >= 2000 && $value <= 2100) $availableYears[] = $value;
    }
    $stmt->close();
    $availableYears = array_values(array_unique($availableYears));
    rsort($availableYears, SORT_NUMERIC);

    $elapsed = $lastMonth - $startMonth + 1;
    if ($year > $thisYear || ($year === $thisYear && $startMonth > $thisMonth)) {
        $elapsed = 0;
    } elseif ($year === $thisYear) {
        $elapsed = max(0, min($thisMonth, $lastMonth) - $startMonth + 1);
    }

    buyerPoJson(200, [
        'success' => true,
        'buyer' => [
            'full_name' => (string) $buyer['full_name'],
            'email' => (string) $buyer['email'],
        ],
        'period' => [
            'year' => $year,
            'quarter' => $quarter,
            'months_in_average' => $elapsed,
        ],
        'available_years' => $availableYears,
        'summary' => [
            'total_approved_value' => $totalApproved,
            'average_per_month' => $elapsed > 0 ? round($totalApproved / $elapsed, 2) : 0,
            'total_pos_created' => (int) ($poCounts['total'] ?? 0),
            'pending_pos' => (int) ($poCounts['pending'] ?? 0),
            'top_supplier' => $topSupplier,
        ],
        'monthly' => $monthly,
        'categories' => $categories,
        'suppliers' => $suppliers,
        'transactions' => $transactions,
        'read_only' => true,
        'basis' => 'Approved Purchase Order commitments only. Not Finance-confirmed expenses or payments.',
    ]);
} catch (Throwable $error) {
    error_log('Buyer Reports: ' . $error->getMessage());
    buyerPoJson(500, [
        'success' => false,
        'message' => 'Unable to load Buyer Reports. Check PHP/MySQL logs and Buyer access.',
    ]);
}

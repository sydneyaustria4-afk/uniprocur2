<?php
/**
 * UniProcur — Manager Reports, read-only.
 * Data sources: Procurement purchase_orders, po_items, purchase_requisitions,
 * pr_items, suppliers, and rfqs. No Finance posting or Inventory GR claims.
 */
require_once __DIR__ . '/procurement_db_connection.php';
require_once __DIR__ . '/manager-api-common.php';

header('Cache-Control: no-store, max-age=0');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    managerSendJson(405, ['success' => false, 'message' => 'GET required.']);
}

try {
    $manager = requireActiveManager($conn);
    $now = new DateTimeImmutable('now', new DateTimeZone('Asia/Manila'));
    $thisYear = (int) $now->format('Y');
    $thisMonth = (int) $now->format('n');

    $yearValue = $_GET['year'] ?? (string) $thisYear;
    $quarterValue = $_GET['quarter'] ?? '0';
    if (!is_string($yearValue) || !preg_match('/\A\d{4}\z/', $yearValue)
        || (int) $yearValue < 2000 || (int) $yearValue > 2100) {
        managerSendJson(422, ['success' => false, 'message' => 'Choose a valid report year.']);
    }
    if (!is_string($quarterValue) || !preg_match('/\A[0-4]\z/', $quarterValue)) {
        managerSendJson(422, ['success' => false, 'message' => 'Choose a valid quarter.']);
    }
    $year = (int) $yearValue;
    $quarter = (int) $quarterValue;
    $startMonth = $quarter === 0 ? 1 : (($quarter - 1) * 3 + 1);
    $endMonth = $quarter === 0 ? 13 : ($startMonth + 3);
    $start = sprintf('%04d-%02d-01', $year, $startMonth);
    $end = $endMonth > 12 ? sprintf('%04d-01-01', $year + 1) : sprintf('%04d-%02d-01', $year, $endMonth);

    $approvedStatuses = "('approved','issued','partial','received','closed')";
    $allPOStatuses = "('pending_approval','approved','rejected','issued','partial','received','closed')";
    $poDate = 'COALESCE(po.order_date, DATE(po.created_at))';

    // Manager-wide reporting, consistent with existing Manager PR and PO listing APIs.
    $supplierCount = (int) $conn->query('SELECT COUNT(*) AS n FROM suppliers')->fetch_assoc()['n'];

    $months = array_fill(0, 12, 0.0);
    $stmt = $conn->prepare("SELECT MONTH({$poDate}) AS month_num, COALESCE(SUM(po.total_amount),0) AS amount
        FROM purchase_orders po
        WHERE {$poDate} >= ? AND {$poDate} < ?
          AND LOWER(po.status) IN {$approvedStatuses}
        GROUP BY MONTH({$poDate})");
    $stmt->bind_param('ss', $start, $end);
    $stmt->execute();
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $line) {
        $idx = (int) $line['month_num'] - 1;
        if ($idx >= 0 && $idx < 12) $months[$idx] = (float) $line['amount'];
    }
    $stmt->close();
    $total = array_sum($months);

    $stmt = $conn->prepare("SELECT
        CASE
          WHEN LOWER(pr.status) IN ('submitted','pending') THEN 'pending'
          WHEN LOWER(pr.status) = 'approved' THEN 'approved'
          WHEN LOWER(pr.status) = 'rejected' THEN 'rejected'
          ELSE 'other' END AS bucket, COUNT(*) AS n
        FROM purchase_requisitions pr
        WHERE pr.created_at >= ? AND pr.created_at < ?
          AND LOWER(pr.status) IN ('submitted','pending','approved','rejected')
        GROUP BY bucket");
    $stmt->bind_param('ss', $start, $end);
    $stmt->execute();
    $prStatuses = ['pending' => 0, 'approved' => 0, 'rejected' => 0];
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $r) {
        if (array_key_exists($r['bucket'], $prStatuses)) $prStatuses[$r['bucket']] = (int) $r['n'];
    }
    $stmt->close();

    $stmt = $conn->prepare("SELECT
        CASE
          WHEN LOWER(po.status) = 'pending_approval' THEN 'pending'
          WHEN LOWER(po.status) IN {$approvedStatuses} THEN 'approved'
          WHEN LOWER(po.status) = 'rejected' THEN 'rejected'
          ELSE 'other' END AS bucket, COUNT(*) AS n
        FROM purchase_orders po
        WHERE {$poDate} >= ? AND {$poDate} < ?
          AND LOWER(po.status) IN {$allPOStatuses}
        GROUP BY bucket");
    $stmt->bind_param('ss', $start, $end);
    $stmt->execute();
    $poStatuses = ['pending' => 0, 'approved' => 0, 'rejected' => 0];
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $r) {
        if (array_key_exists($r['bucket'], $poStatuses)) $poStatuses[$r['bucket']] = (int) $r['n'];
    }
    $stmt->close();

    // One row per supplier. Supplier rating and delivery timeliness are not available
    // from the existing verified Manager/Inventory APIs, so return null for both.
    $stmt = $conn->prepare("SELECT s.id AS supplier_id, s.name AS supplier_name,
           COUNT(po.id) AS total_orders,
           COALESCE(SUM(CASE WHEN LOWER(po.status) IN {$approvedStatuses}
             THEN po.total_amount ELSE 0 END),0) AS commitment_amount
        FROM suppliers s
        LEFT JOIN purchase_orders po
          ON po.supplier_id = s.id
         AND {$poDate} >= ? AND {$poDate} < ?
         AND LOWER(po.status) IN ('pending_approval','approved','issued','partial','received','closed')
        GROUP BY s.id, s.name
        ORDER BY commitment_amount DESC, total_orders DESC, s.name ASC");
    $stmt->bind_param('ss', $start, $end);
    $stmt->execute();
    $suppliers = [];
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $s) {
        $suppliers[] = [
            'supplier_id' => (int) $s['supplier_id'],
            'supplier_name' => (string) $s['supplier_name'],
            'total_orders' => (int) $s['total_orders'],
            'commitment_amount' => (float) $s['commitment_amount'],
            'on_time_percent' => null,
            'rating' => null,
            'performance_status' => 'Not measured',
        ];
    }
    $stmt->close();
    $topSupplier = null;
    foreach ($suppliers as $candidate) {
        if ($candidate['commitment_amount'] > 0) {
            $topSupplier = [
                'name' => $candidate['supplier_name'],
                'amount' => $candidate['commitment_amount'],
                'share_percent' => $total > 0
                    ? round($candidate['commitment_amount'] / $total * 100, 1) : null,
            ];
            break;
        }
    }

    // Category mapping uses actual item names and the corresponding PR's
    // recorded category. Aggregate PR classification first to prevent join duplicates.
    // Missing PR/category matches are explicitly labelled Uncategorized.
    $stmt = $conn->prepare("SELECT
          COALESCE(NULLIF(TRIM(category_map.category), ''), 'Uncategorized') AS category,
          COALESCE(SUM(COALESCE(pi.subtotal, pi.qty_ordered * pi.unit_price, 0)), 0) AS amount
        FROM purchase_orders po
        INNER JOIN po_items pi ON pi.po_id = po.id
        LEFT JOIN rfqs rf ON rf.id = po.rfq_id
        LEFT JOIN (
            SELECT pr_id, LOWER(TRIM(item_name)) AS item_key,
                   MIN(NULLIF(TRIM(category), '')) AS category
            FROM pr_items
            GROUP BY pr_id, LOWER(TRIM(item_name))
        ) category_map
          ON category_map.pr_id = rf.pr_id
         AND category_map.item_key = LOWER(TRIM(pi.item_name))
        WHERE {$poDate} >= ? AND {$poDate} < ?
          AND LOWER(po.status) IN {$approvedStatuses}
        GROUP BY category
        ORDER BY amount DESC, category ASC");
    $stmt->bind_param('ss', $start, $end);
    $stmt->execute();
    $categories = [];
    foreach ($stmt->get_result()->fetch_all(MYSQLI_ASSOC) as $cat) {
        $amount = (float) $cat['amount'];
        if ($amount > 0) $categories[] = ['name' => (string) $cat['category'], 'amount' => $amount];
    }
    $stmt->close();

    // Count elapsed months in the requested period. Current year's future months
    // are not included in average. Historical years use the full requested period.
    $elapsedMonths = $quarter ? 3 : 12;
    if ($year > $thisYear || ($year === $thisYear && $startMonth > $thisMonth)) {
        $elapsedMonths = 0;
    } elseif ($year === $thisYear) {
        $elapsedMonths = max(0, min($thisMonth, min(12, $endMonth - 1)) - $startMonth + 1);
    }
    $avg = $elapsedMonths > 0 ? $total / $elapsedMonths : 0.0;

    $availableYears = [$thisYear];
    $yearsQuery = $conn->query("SELECT DISTINCT y FROM (
        SELECT YEAR(created_at) AS y FROM purchase_requisitions
        UNION ALL
        SELECT YEAR(COALESCE(order_date, DATE(created_at))) AS y FROM purchase_orders
    ) years WHERE y BETWEEN 2000 AND 2100 ORDER BY y DESC");
    while ($r = $yearsQuery->fetch_assoc()) $availableYears[] = (int) $r['y'];
    $availableYears[] = $year;
    $availableYears = array_values(array_unique($availableYears));
    rsort($availableYears, SORT_NUMERIC);

    managerSendJson(200, [
        'success' => true,
        'manager' => ['full_name' => (string) $manager['full_name'], 'email' => (string) $manager['email']],
        'period' => ['year' => $year, 'quarter' => $quarter, 'start' => $start, 'end_exclusive' => $end, 'months_in_average' => $elapsedMonths],
        'available_years' => $availableYears,
        'summary' => ['total_commitment' => round($total, 2), 'average_per_month' => round($avg, 2), 'supplier_count' => $supplierCount, 'top_supplier' => $topSupplier],
        'monthly' => $months,
        'pr_status' => $prStatuses,
        'po_status' => $poStatuses,
        'suppliers' => $suppliers,
        'spend_by_category' => $categories,
        'delivery_metrics_available' => false,
        'basis' => 'Approved PO commitments, NOT verified Finance spending or payments.',
        'read_only' => true,
    ]);
} catch (Throwable $error) {
    error_log('Manager Reports: ' . $error->getMessage());
    managerSendJson(500, ['success' => false, 'message' => 'Unable to load Manager Reports. Check the PHP/MySQL error log and Manager access.']);
}

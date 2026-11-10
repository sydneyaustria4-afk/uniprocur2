<?php
/**
 * UniProcur Manager home — read-only MySQL summary.
 * Uses existing manager-only session / localhost-only demo identity.
 * No write operations, no invented supplier performance or Finance posting claims.
 */
require_once __DIR__ . '/procurement_db_connection.php';
require_once __DIR__ . '/manager-api-common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    managerSendJson(405, ['success' => false, 'message' => 'GET required.']);
}

try {
    $manager = requireActiveManager($conn);
    $currentYear = (int) date('Y');
    $currentMonth = (int) date('n');

    $supplierCountResult = $conn->query('SELECT COUNT(*) AS total FROM suppliers');
    $totalSuppliers = (int) $supplierCountResult->fetch_assoc()['total'];

    $prCounts = $conn->query(
        "SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN LOWER(status) IN ('submitted','pending') THEN 1 ELSE 0 END), 0) AS pending,
                COALESCE(SUM(CASE WHEN YEAR(created_at) = YEAR(CURDATE())
                    AND MONTH(created_at) = MONTH(CURDATE()) THEN 1 ELSE 0 END), 0) AS this_month
         FROM purchase_requisitions
         WHERE LOWER(status) IN ('submitted','pending','approved','rejected')"
    )->fetch_assoc();

    $poCounts = $conn->query(
        "SELECT COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN LOWER(status) = 'pending_approval' THEN 1 ELSE 0 END),0) AS awaiting_approval
         FROM purchase_orders
         WHERE LOWER(status) IN ('pending_approval','approved','rejected','issued','partial','received','closed')"
    )->fetch_assoc();

    // Purchase-order commitments, not Finance-confirmed expense or paid invoices.
    $months = array_fill(0, 12, 0.0);
    $stmt = $conn->prepare(
        "SELECT MONTH(COALESCE(order_date, DATE(created_at))) AS month_num,
                COALESCE(SUM(total_amount), 0) AS po_value
         FROM purchase_orders
         WHERE YEAR(COALESCE(order_date, DATE(created_at))) = ?
           AND LOWER(status) IN ('approved','issued','partial','received','closed')
         GROUP BY MONTH(COALESCE(order_date, DATE(created_at)))"
    );
    $stmt->bind_param('i', $currentYear);
    $stmt->execute();
    $monthResult = $stmt->get_result();
    while ($month = $monthResult->fetch_assoc()) {
        $index = (int) $month['month_num'] - 1;
        if ($index >= 0 && $index < 12) $months[$index] = (float) $month['po_value'];
    }
    $stmt->close();

    $prQuery = $conn->query(
        "SELECT pr_number, LOWER(status) AS status,
                DATE_FORMAT(created_at, '%Y-%m-%d') AS created_date,
                DATE_FORMAT(needed_by, '%Y-%m-%d') AS required_date
         FROM purchase_requisitions
         WHERE LOWER(status) IN ('submitted','pending','approved','rejected')
         ORDER BY created_at DESC, id DESC LIMIT 5"
    );
    $recentPrs = $prQuery->fetch_all(MYSQLI_ASSOC);

    $poQuery = $conn->query(
        "SELECT po.po_number, LOWER(po.status) AS status,
                DATE_FORMAT(po.order_date, '%Y-%m-%d') AS order_date,
                DATE_FORMAT(po.expected_delivery, '%Y-%m-%d') AS expected_delivery,
                DATE_FORMAT(po.created_at, '%Y-%m-%d') AS created_date,
                po.total_amount, s.name AS supplier_name
         FROM purchase_orders AS po
         INNER JOIN suppliers AS s ON s.id = po.supplier_id
         WHERE LOWER(po.status) IN ('pending_approval','approved','rejected','issued','partial','received','closed')
         ORDER BY po.created_at DESC, po.id DESC LIMIT 2"
    );
    $recentPos = $poQuery->fetch_all(MYSQLI_ASSOC);

    // No actual Inventory GR delivery-date verification or supplier product catalog
    // currently exists in the manager APIs, so use real PO counts and null performance.
    $suppliersQuery = $conn->query(
        "SELECT s.id AS supplier_id, s.name AS supplier_name,
                COUNT(po.id) AS po_count
         FROM suppliers AS s
         LEFT JOIN purchase_orders AS po ON po.supplier_id = s.id
              AND LOWER(po.status) NOT IN ('cancelled','canceled')
         GROUP BY s.id, s.name
         ORDER BY s.name ASC LIMIT 8"
    );
    $suppliers = [];
    while ($row = $suppliersQuery->fetch_assoc()) {
        $suppliers[] = [
            'supplier_id' => (int) $row['supplier_id'],
            'supplier_name' => $row['supplier_name'],
            'po_count' => (int) $row['po_count'],
            'on_time_percentage' => null,
            'performance_status' => 'Not measured'
        ];
    }

    $monthValue = $months[$currentMonth - 1];
    $prevValue = $currentMonth > 1 ? $months[$currentMonth - 2] : null;
    $changePercent = ($prevValue !== null && $prevValue > 0)
        ? round((($monthValue - $prevValue) / $prevValue) * 100, 1)
        : null;

    managerSendJson(200, [
        'success' => true,
        'manager' => [
            'full_name' => $manager['full_name'],
            'email' => $manager['email'],
        ],
        'summary' => [
            'suppliers' => $totalSuppliers,
            'requests_this_month' => (int) $prCounts['this_month'],
            'pending_prs' => (int) $prCounts['pending'],
            'purchase_orders' => (int) $poCounts['total'],
            'pending_pos' => (int) $poCounts['awaiting_approval'],
        ],
        'monthly' => [
            'year' => $currentYear,
            'values' => $months,
            'current_month_value' => $monthValue,
            'change_from_previous_month_pct' => $changePercent,
            'basis' => 'Approved Purchase Order commitments (not Finance-confirmed spending)',
        ],
        'recent_prs' => $recentPrs,
        'recent_pos' => $recentPos,
        'suppliers' => $suppliers,
        'supplier_delivery_metrics_available' => false,
        'read_only' => true
    ]);
} catch (Throwable $error) {
    error_log('Manager dashboard summary: ' . $error->getMessage());
    managerSendJson(500, [
        'success' => false,
        'message' => 'Unable to load Manager dashboard. Check PHP/MySQL logs and ensure Manager access is available.'
    ]);
}

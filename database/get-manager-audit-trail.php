<?php
/**
 * Read-only Audit Trail API — Manager only; supports role/action/date/search filters,
 * server-side pagination, and CSV export. No invented events or client-supplied IPs.
 * Recorded timestamps are Asia/Manila DATETIME values from procurementAuditLog().
 */
require_once __DIR__ . '/procurement_db_connection.php';
require_once __DIR__ . '/manager-api-common.php';

header('Cache-Control: private, no-store, max-age=0');
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    managerSendJson(405, ['success' => false, 'message' => 'GET required.']);
}

try {
    $manager = requireActiveManager($conn);
    $search = trim((string) ($_GET['search'] ?? ''));
    $role = strtolower(trim((string) ($_GET['role'] ?? 'all')));
    $action = strtolower(trim((string) ($_GET['action'] ?? 'all')));
    $period = strtolower(trim((string) ($_GET['period'] ?? 'all')));
    $pageInput = $_GET['page'] ?? '1';
    $export = isset($_GET['export']) && $_GET['export'] === 'csv';

    if (strlen($search) > 120 || !in_array($role, ['all', 'buyer', 'manager'], true)
        || !in_array($action, ['all', 'submitted', 'approved', 'rejected'], true)
        || !in_array($period, ['all', 'today', 'week'], true)
        || !is_string($pageInput) || !preg_match('/\A\d{1,7}\z/', $pageInput)) {
        managerSendJson(422, ['success' => false, 'message' => 'Invalid Audit Trail filters.']);
    }
    $page = max(1, min(1000000, (int) $pageInput));
    $pageSize = 5;

    $now = new DateTimeImmutable('now', new DateTimeZone('Asia/Manila'));
    $today = $now->setTime(0, 0)->format('Y-m-d H:i:s');
    $tomorrow = $now->modify('+1 day')->setTime(0, 0)->format('Y-m-d H:i:s');
    $monday = $now->modify('monday this week')->setTime(0, 0)->format('Y-m-d H:i:s');
    // Use Asia/Manila event_time as stored by procurementAuditLog().
    $conditions = [];
    $params = [];
    $types = '';
    if ($role !== 'all') {
        $conditions[] = 'LOWER(l.actor_role) = ?';
        $params[] = $role;
        $types .= 's';
    }
    if ($action !== 'all') {
        $conditions[] = 'LOWER(l.action_name) = ?';
        $params[] = $action;
        $types .= 's';
    }
    if ($period === 'today' || $period === 'week') {
        $conditions[] = 'l.event_time >= ?';
        $params[] = $period === 'today' ? $today : $monday;
        $types .= 's';
    }
    if ($search !== '') {
        $conditions[] = '(l.actor_name LIKE ? OR l.actor_role LIKE ? OR l.module_name LIKE ?
                         OR l.action_name LIKE ? OR l.description LIKE ? OR l.reference_number LIKE ?)';
        $term = '%' . $search . '%';
        for ($n = 0; $n < 6; $n++) { $params[] = $term; $types .= 's'; }
    }
    $where = $conditions ? (' WHERE ' . implode(' AND ', $conditions)) : '';

    $summaryResult = $conn->prepare(
        'SELECT COUNT(*) AS total,
         COALESCE(SUM(event_time >= ?), 0) AS this_week,
         COALESCE(SUM(event_time >= ? AND event_time < ?), 0) AS today_count
         FROM procurement_audit_logs'
    );
    $summaryResult->bind_param('sss', $monday, $today, $tomorrow);
    $summaryResult->execute();
    $summary = $summaryResult->get_result()->fetch_assoc();
    $summaryResult->close();

    // Pending actions are live approval queues, NOT inferred past audit events.
    $pendingPr = $conn->query(
        "SELECT COUNT(*) AS n FROM purchase_requisitions WHERE LOWER(status) IN ('submitted','pending')"
    )->fetch_assoc();
    $pendingPo = $conn->query(
        "SELECT COUNT(*) AS n FROM purchase_orders WHERE LOWER(status) = 'pending_approval'"
    )->fetch_assoc();
    $pendingActions = (int) $pendingPr['n'] + (int) $pendingPo['n'];

    $countStmt = $conn->prepare('SELECT COUNT(*) AS n FROM procurement_audit_logs l' . $where);
    if ($types !== '') $countStmt->bind_param($types, ...$params);
    $countStmt->execute();
    $filteredTotal = (int) $countStmt->get_result()->fetch_assoc()['n'];
    $countStmt->close();

    $select = 'SELECT l.id, DATE_FORMAT(l.event_time, \'%Y-%m-%d %H:%i:%s\') AS timestamp,
                      l.actor_name AS user_name, l.actor_role AS role, l.module_name AS module,
                      l.action_name AS action, l.reference_number AS reference,
                      l.description, l.ip_address
               FROM procurement_audit_logs l' . $where . ' ORDER BY l.event_time DESC, l.id DESC';

    if ($export) {
        // Entire matching export capped to reduce unbounded memory / server load.
        $limit = 5000;
        $stmt = $conn->prepare($select . ' LIMIT ?');
        $exportParams = [...$params, $limit];
        $stmt->bind_param($types . 'i', ...$exportParams);
        $stmt->execute();
        $entries = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        header('Content-Type: text/csv; charset=utf-8');
        header('Content-Disposition: attachment; filename="uniprocur_manager_audit_trail.csv"');
        echo "\xEF\xBB\xBF";
        $output = fopen('php://output', 'wb');
        fputcsv($output, ['Timestamp', 'User', 'Role', 'Module', 'Action', 'Reference', 'Description', 'IP Address']);
        foreach ($entries as $row) {
            $cells = [$row['timestamp'], $row['user_name'], $row['role'], $row['module'],
                $row['action'], $row['reference'], $row['description'], $row['ip_address']];
            foreach ($cells as &$cell) {
                $cell = (string) ($cell ?? '');
                // Prevent formula injection in Excel / spreadsheet programs.
                if (preg_match('/\A[\s\x00-\x1F]*[=+@\-]/u', $cell)) $cell = "'" . $cell;
            }
            unset($cell);
            fputcsv($output, $cells);
        }
        fclose($output);
        exit;
    }

    $pages = max(1, (int) ceil($filteredTotal / $pageSize));
    $page = min($page, $pages);
    $offset = ($page - 1) * $pageSize;
    $stmt = $conn->prepare($select . ' LIMIT ? OFFSET ?');
    $readParams = [...$params, $pageSize, $offset];
    $stmt->bind_param($types . 'ii', ...$readParams);
    $stmt->execute();
    $entries = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    managerSendJson(200, [
        'success' => true,
        'manager' => ['full_name' => $manager['full_name'], 'email' => $manager['email']],
        'summary' => [
            'total_activities' => (int) $summary['total'],
            'this_week' => (int) $summary['this_week'],
            'today' => (int) $summary['today_count'],
            'pending_actions' => $pendingActions,
        ],
        'entries' => $entries,
        'count' => $filteredTotal,
        'page' => $page,
        'pages' => $pages,
        'page_size' => $pageSize,
        'has_complete_history' => false,
        'history_note' => 'Events are recorded only after audit hooks are installed; older activities were not reconstructed.'
    ]);
} catch (Throwable $error) {
    error_log('Manager audit trail read error: ' . $error->getMessage());
    managerSendJson(500, [
        'success' => false,
        'message' => 'Unable to load Audit Trail. Check the SQL migration, Manager access, and PHP error log.'
    ]);
}

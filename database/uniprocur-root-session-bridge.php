<?php
/**
 * Bridge a verified /ITPROFEL/root/ server session into Procurement's OWN session.
 * The root application already verified the password. Here we re-check HR account,
 * employment, department, role and Procurement mapping on every request.
 * We never promote a Buyer to Manager or create/overwrite user IDs.
 */
declare(strict_types=1);

function uniprocurClearRootIdentity(): void {
    foreach (['user_id', 'role', 'hr_employee_id', 'hr_account_id', 'logged_in_at', 'unified_root_account'] as $key) {
        unset($_SESSION[$key]);
    }
}

function uniprocurSyncRootIdentity(?array $rootUser): void {
    if (!$rootUser) {
        uniprocurClearRootIdentity(); // Root logout revokes Procurement access, too.
        return;
    }

    $accountId = filter_var($rootUser['id'] ?? null, FILTER_VALIDATE_INT);
    $employeeId = filter_var($rootUser['employeeId'] ?? null, FILTER_VALIDATE_INT);
    $email = strtolower(trim((string)($rootUser['email'] ?? '')));
    $position = strtolower(trim((string)($rootUser['position'] ?? '')));
    $department = strtolower(trim((string)($rootUser['department'] ?? '')));
    if (!$accountId || !$employeeId || !filter_var($email, FILTER_VALIDATE_EMAIL)
        || !in_array($position, ['buyer', 'manager'], true)
        || $department !== 'procurement') {
        uniprocurClearRootIdentity();
        return;
    }

    try {
        global $conn;
        require_once __DIR__ . '/procurement_db_connection.php';
        if (!isset($conn) || !($conn instanceof mysqli)) {
            throw new RuntimeException('Procurement MySQL connection unavailable.');
        }
        $hr = $conn->prepare(
            'SELECT a.account_id, a.employee_id, a.username, a.position, a.status, '
            . 'e.employment_status, d.department_name '
            . 'FROM finance_hr.accounts a '
            . 'INNER JOIN finance_hr.employees e ON e.employee_id=a.employee_id '
            . 'INNER JOIN finance_hr.departments d ON d.department_id=e.department '
            . 'WHERE a.account_id=? LIMIT 1'
        );
        $hr->bind_param('i', $accountId);
        $hr->execute();
        $record = $hr->get_result()->fetch_assoc();
        $hr->close();
        if (!$record || (int)$record['employee_id'] !== $employeeId
            || strtolower((string)$record['username']) !== $email
            || strtolower((string)$record['position']) !== $position
            || strcasecmp((string)$record['status'], 'Active') !== 0
            || strcasecmp((string)$record['employment_status'], 'Active') !== 0
            || strcasecmp((string)$record['department_name'], 'Procurement') !== 0) {
            uniprocurClearRootIdentity();
            return;
        }
        $stmt = $conn->prepare(
            'SELECT id FROM users WHERE hr_employee_id=? AND LOWER(email)=? '
            . 'AND role=? AND is_active=1 LIMIT 1'
        );
        $stmt->bind_param('iss', $employeeId, $email, $position);
        $stmt->execute();
        $proc = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$proc) {
            uniprocurClearRootIdentity();
            error_log('Unified ERP login: active HR Procurement account has no matching Procurement user mapping.');
            return;
        }
        $procId = (int)$proc['id'];
        if ($procId !== (int)($_SESSION['user_id'] ?? 0)
            || $accountId !== (int)($_SESSION['unified_root_account'] ?? 0)) {
            session_regenerate_id(true);
        }
        $_SESSION['user_id'] = $procId;
        $_SESSION['role'] = $position;
        $_SESSION['hr_employee_id'] = $employeeId;
        $_SESSION['hr_account_id'] = $accountId;
        $_SESSION['unified_root_account'] = $accountId;
        $_SESSION['logged_in_at'] = time();
    } catch (Throwable $e) {
        uniprocurClearRootIdentity();
        error_log('UniProcur root HR session bridge: ' . $e->getMessage());
    }
}

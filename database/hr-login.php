<?php
declare(strict_types=1);

require_once __DIR__ . '/uniprocur-session.php';
require_once __DIR__ . '/procurement_db_connection.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
header('X-Content-Type-Options: nosniff');

function loginResponse(int $status, array $data): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    loginResponse(405, ['success' => false, 'message' => 'POST required.']);
}
$input = json_decode((string) file_get_contents('php://input'), true);
if (!is_array($input)) {
    loginResponse(400, ['success' => false, 'message' => 'Invalid request.']);
}
$email = strtolower(trim((string)($input['identifier'] ?? '')));
$password = (string)($input['password'] ?? '');
if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 100 || $password === '' || strlen($password) > 4096) {
    loginResponse(422, ['success' => false, 'message' => 'Enter a valid HR email and password.']);
}

// Basic same-session slowdown; use an IP/account rate limiter in public deployments.
$attempts = (int)($_SESSION['login_failed_count'] ?? 0);
if ($attempts >= 10) {
    loginResponse(429, ['success' => false, 'message' => 'Too many failed logins in this session. Close the browser or contact your administrator.']);
}

try {
    // The MySQL account must have SELECT rights to finance_hr.
    $stmt = $conn->prepare(
        'SELECT a.account_id, a.employee_id, a.username, a.password, a.position, a.status,
'
        . ' e.name, e.employment_status, d.department_name
'
        . ' FROM finance_hr.accounts a
'
        . ' INNER JOIN finance_hr.employees e ON e.employee_id = a.employee_id
'
        . ' INNER JOIN finance_hr.departments d ON d.department_id = e.department
'
        . ' WHERE LOWER(a.username) = ? LIMIT 1'
    );
    $stmt->bind_param('s', $email);
    $stmt->execute();
    $hr = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $valid = $hr && password_verify($password, (string)$hr['password']);
    if (!$valid) {
        $_SESSION['login_failed_count'] = $attempts + 1;
        loginResponse(401, ['success' => false, 'message' => 'Invalid email or password.']);
    }

    if (strcasecmp(trim((string)$hr['status']), 'Active') !== 0 ||
        strcasecmp(trim((string)$hr['employment_status']), 'Active') !== 0) {
        loginResponse(403, ['success' => false, 'message' => 'Your HR account is not active. Contact HR.']);
    }
    if (strcasecmp(trim((string)$hr['department_name']), 'Procurement') !== 0) {
        loginResponse(403, ['success' => false, 'message' => 'This sign-in is for Procurement accounts only.']);
    }
    $role = strtolower(trim((string)$hr['position']));
    if (!in_array($role, ['buyer', 'manager'], true)) {
        loginResponse(403, ['success' => false, 'message' => 'HR has not assigned a Buyer or Manager role.']);
    }

    // Use the existing Procurement user ID. Never overwrite transaction ownership.
    $employeeId = (int)$hr['employee_id'];
    $stmt = $conn->prepare(
        'SELECT id, role, is_active FROM users WHERE hr_employee_id = ? AND LOWER(email) = ? AND role = ? LIMIT 1'
    );
    $stmt->bind_param('iss', $employeeId, $email, $role);
    $stmt->execute();
    $proc = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$proc || (int)$proc['is_active'] !== 1) {
        loginResponse(403, ['success' => false, 'message' => 'Procurement account mapping is missing or inactive. Verify users.hr_employee_id and email.']);
    }

    session_regenerate_id(true);
    $_SESSION['user_id'] = (int)$proc['id'];
    $_SESSION['role'] = $role;
    $_SESSION['hr_employee_id'] = $employeeId;
    $_SESSION['hr_account_id'] = (int)$hr['account_id'];
    $_SESSION['login_failed_count'] = 0;
    $_SESSION['logged_in_at'] = time();

    loginResponse(200, [
        'success' => true,
        'redirect' => $role === 'manager'
            ? '../managerdashboard/manager-dashboard.html'
            : '../buyerdashboard/buyer-dashboard.html'
    ]);
} catch (Throwable $e) {
    error_log('UniProcur HR login error: ' . $e->getMessage());
    loginResponse(500, ['success' => false, 'message' => 'Login service unavailable. Check both databases and Apache PHP error log.']);
}

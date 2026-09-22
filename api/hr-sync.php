<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

const HR_SYNC_TOKEN = 'CHANGE_THIS_TO_A_LONG_SECRET';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['message' => 'Method not allowed.']);
    exit;
}

$authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$providedToken = preg_replace('/^Bearer\s+/i', '', $authorization);
if (!$providedToken || !hash_equals(HR_SYNC_TOKEN, $providedToken)) {
    http_response_code(401);
    echo json_encode(['message' => 'Unauthorized.']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true) ?: [];
$employeeId = trim($data['employee_id'] ?? '');
$fullName = trim($data['full_name'] ?? '');
$email = trim($data['email'] ?? '');
$status = strtolower(trim($data['status'] ?? ''));
$role = strtolower(trim($data['role'] ?? 'buyer'));

if ($employeeId === '' || $fullName === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(['message' => 'employee_id, full_name, and a valid email are required.']);
    exit;
}

if (!in_array($role, ['buyer', 'manager', 'admin'], true)) {
    http_response_code(422);
    echo json_encode(['message' => 'Invalid role.']);
    exit;
}

$isActive = $status === 'active' ? 1 : 0;

try {
    $find = $pdo->prepare('SELECT user_id FROM users WHERE email = :email LIMIT 1');
    $find->execute([':email' => $email]);
    $existingUser = $find->fetch();

    if ($existingUser) {
        $update = $pdo->prepare(
            'UPDATE users
             SET username = :username, full_name = :full_name, role = :role, is_active = :is_active
             WHERE user_id = :user_id'
        );
        $update->execute([
            ':username' => $email,
            ':full_name' => $fullName,
            ':role' => $role,
            ':is_active' => $isActive,
            ':user_id' => $existingUser['user_id']
        ]);
        echo json_encode(['message' => 'User synchronized.', 'userId' => $existingUser['user_id']]);
        exit;
    }

    $temporaryPassword = bin2hex(random_bytes(8));
    $insert = $pdo->prepare(
        'INSERT INTO users
         (username, email, password_hash, full_name, role, is_active, must_change_password)
         VALUES (:username, :email, :password_hash, :full_name, :role, :is_active, 1)'
    );
    $insert->execute([
        ':username' => $email,
        ':email' => $email,
        ':password_hash' => password_hash($temporaryPassword, PASSWORD_DEFAULT),
        ':full_name' => $fullName,
        ':role' => $role,
        ':is_active' => $isActive
    ]);

    echo json_encode([
        'message' => 'User created and synchronized.',
        'userId' => $pdo->lastInsertId(),
        'temporaryPassword' => $temporaryPassword
    ]);
} catch (PDOException $error) {
    http_response_code(500);
    echo json_encode(['message' => 'HR synchronization failed.']);
}

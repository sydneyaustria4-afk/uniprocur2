<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['message' => 'Method not allowed.']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true) ?: [];
$fullName = trim($data['fullName'] ?? '');
$email = trim($data['email'] ?? '');

if ($fullName === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(['message' => 'Enter a valid name and e-mail address.']);
    exit;
}

try {
    $temporaryPassword = bin2hex(random_bytes(16));
    $query = $pdo->prepare(
        'INSERT INTO users
         (username, email, password_hash, full_name, role, is_active, must_change_password)
         VALUES (:username, :email, :password_hash, :full_name, :role, :is_active, :must_change_password)'
    );
    $query->execute([
        ':username' => $email,
        ':email' => $email,
        ':password_hash' => password_hash($temporaryPassword, PASSWORD_DEFAULT),
        ':full_name' => $fullName,
        ':role' => 'buyer',
        ':is_active' => 0,
        ':must_change_password' => 1
    ]);

    echo json_encode(['message' => 'Registration request submitted successfully.']);
} catch (PDOException $error) {
    if ($error->getCode() === '23000') {
        http_response_code(409);
        echo json_encode(['message' => 'That e-mail address is already registered.']);
    } else {
        http_response_code(500);
        echo json_encode(['message' => 'Registration could not be saved.']);
    }
}

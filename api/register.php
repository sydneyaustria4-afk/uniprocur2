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
$department = trim($data['department'] ?? '');
$position = trim($data['position'] ?? '');
$purpose = trim($data['purpose'] ?? '');

if ($fullName === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(['message' => 'Enter a valid name and e-mail address.']);
    exit;
}

try {
    $query = $pdo->prepare(
        'INSERT INTO pending_users
         (full_name, email, department, position, purpose, requested_role, status)
         VALUES (:full_name, :email, :department, :position, :purpose, :requested_role, :status)'
    );
    $query->execute([
        ':full_name' => $fullName,
        ':email' => $email,
        ':department' => $department ?: null,
        ':position' => $position ?: null,
        ':purpose' => $purpose,
        ':requested_role' => 'buyer',
        ':status' => 'Pending'
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

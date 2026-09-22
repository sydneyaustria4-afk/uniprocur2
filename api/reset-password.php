<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['message' => 'Method not allowed.']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true) ?: [];
$email = trim($data['email'] ?? '');
$code = trim($data['code'] ?? '');
$password = (string) ($data['password'] ?? '');

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^\d{6}$/', $code)) {
    http_response_code(422);
    echo json_encode(['message' => 'Enter a valid e-mail address and 6-digit code.']);
    exit;
}

if (strlen($password) < 8 || !preg_match('/[a-z]/', $password) || !preg_match('/[A-Z]/', $password) || !preg_match('/\d/', $password)) {
    http_response_code(422);
    echo json_encode(['message' => 'Password does not meet the requirements.']);
    exit;
}

$query = $pdo->prepare(
    'SELECT reset_tokens.id, reset_tokens.user_id
     FROM reset_tokens
     INNER JOIN users ON users.user_id = reset_tokens.user_id
     WHERE users.email = :email
       AND reset_tokens.token_hash = :token_hash
       AND reset_tokens.used_at IS NULL
       AND reset_tokens.expires_at > NOW()
     LIMIT 1'
);
$query->execute([
    ':email' => $email,
    ':token_hash' => hash('sha256', $code)
]);
$token = $query->fetch();

if (!$token) {
    http_response_code(422);
    echo json_encode(['message' => 'The code is invalid or expired.']);
    exit;
}

$pdo->beginTransaction();
try {
    $pdo->prepare(
        'UPDATE users
         SET password_hash = :password_hash, must_change_password = 0, is_active = 1
         WHERE user_id = :user_id'
    )->execute([
        ':password_hash' => password_hash($password, PASSWORD_DEFAULT),
        ':user_id' => $token['user_id']
    ]);
    $pdo->prepare('UPDATE reset_tokens SET used_at = NOW() WHERE id = :id')
        ->execute([':id' => $token['id']]);
    $pdo->commit();
    echo json_encode(['message' => 'Password reset successfully.']);
} catch (Throwable $error) {
    $pdo->rollBack();
    http_response_code(500);
    echo json_encode(['message' => 'Password could not be reset.']);
}

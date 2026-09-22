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

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(422);
    echo json_encode(['message' => 'Enter a valid e-mail address.']);
    exit;
}

$query = $pdo->prepare('SELECT user_id FROM users WHERE email = :email LIMIT 1');
$query->execute([':email' => $email]);
$user = $query->fetch();

if (!$user) {
    echo json_encode(['message' => 'If the account exists, a verification code has been created.']);
    exit;
}

$code = (string) random_int(100000, 999999);
$tokenHash = hash('sha256', $code);
$expiresAt = date('Y-m-d H:i:s', time() + 600);

$pdo->prepare('UPDATE reset_tokens SET used_at = NOW() WHERE user_id = :user_id AND used_at IS NULL')
    ->execute([':user_id' => $user['user_id']]);

$insert = $pdo->prepare(
    'INSERT INTO reset_tokens (user_id, token_hash, expires_at)
     VALUES (:user_id, :token_hash, :expires_at)'
);
$insert->execute([
    ':user_id' => $user['user_id'],
    ':token_hash' => $tokenHash,
    ':expires_at' => $expiresAt
]);

// Replace this development value with an email service before production.
echo json_encode([
    'message' => 'A verification code has been created.',
    'debugCode' => $code
]);

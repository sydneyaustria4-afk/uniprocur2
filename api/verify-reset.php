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

if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !preg_match('/^\d{6}$/', $code)) {
    http_response_code(422);
    echo json_encode(['message' => 'Enter a valid e-mail address and 6-digit code.']);
    exit;
}

$query = $pdo->prepare(
    'SELECT reset_tokens.id
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

if (!$query->fetch()) {
    http_response_code(422);
    echo json_encode(['message' => 'The code is invalid or expired.']);
    exit;
}

echo json_encode(['message' => 'Code verified.']);

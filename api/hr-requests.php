<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $query = $pdo->query(
        "SELECT request_id, full_name, email, department, position, purpose,
                requested_role, status, created_at
         FROM pending_users
         ORDER BY created_at DESC"
    );
    echo json_encode(['requests' => $query->fetchAll()]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['message' => 'Method not allowed.']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true) ?: [];
$requestId = (int) ($data['requestId'] ?? 0);
$reviewerId = (int) ($data['reviewerId'] ?? 0);
$decision = $data['decision'] ?? '';

if (!$requestId || !$reviewerId || !in_array($decision, ['approve', 'reject'], true)) {
    http_response_code(422);
    echo json_encode(['message' => 'Request, reviewer, and decision are required.']);
    exit;
}

try {
    $pdo->beginTransaction();
    $find = $pdo->prepare('SELECT * FROM pending_users WHERE request_id = :request_id FOR UPDATE');
    $find->execute([':request_id' => $requestId]);
    $request = $find->fetch();

    if (!$request || $request['status'] !== 'Pending') {
        throw new RuntimeException('This request is no longer pending.');
    }

    if ($decision === 'reject') {
        $update = $pdo->prepare(
            "UPDATE pending_users
             SET status = 'Rejected', reviewed_by = :reviewer_id, reviewed_at = NOW()
             WHERE request_id = :request_id"
        );
        $update->execute([':reviewer_id' => $reviewerId, ':request_id' => $requestId]);
        $pdo->commit();
        echo json_encode(['message' => 'Request rejected.']);
        exit;
    }

    $temporaryPassword = bin2hex(random_bytes(6));
    $createUser = $pdo->prepare(
        'INSERT INTO users
         (username, email, password_hash, full_name, role, is_active, must_change_password)
         VALUES (:username, :email, :password_hash, :full_name, :role, 1, 1)'
    );
    $createUser->execute([
        ':username' => $request['email'],
        ':email' => $request['email'],
        ':password_hash' => password_hash($temporaryPassword, PASSWORD_DEFAULT),
        ':full_name' => $request['full_name'],
        ':role' => $request['requested_role']
    ]);

    $update = $pdo->prepare(
        "UPDATE pending_users
         SET status = 'Approved', reviewed_by = :reviewer_id, reviewed_at = NOW()
         WHERE request_id = :request_id"
    );
    $update->execute([':reviewer_id' => $reviewerId, ':request_id' => $requestId]);
    $pdo->commit();

    echo json_encode([
        'message' => 'Request approved and account created.',
        'username' => $request['email'],
        'temporaryPassword' => $temporaryPassword
    ]);
} catch (Throwable $error) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    http_response_code($error instanceof PDOException && $error->getCode() === '23000' ? 409 : 422);
    echo json_encode(['message' => $error->getCode() === '23000' ? 'An account already exists for this email.' : $error->getMessage()]);
}

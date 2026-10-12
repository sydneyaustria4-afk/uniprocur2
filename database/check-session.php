<?php
/**
 * Session verification endpoint for UniProcur ERP
 */
session_start();
header('Content-Type: application/json; charset=utf-8');

require_once __DIR__ . '/db.php';

// If session is already established
if (!empty($_SESSION['user_id'])) {
    $stmt = $pdo->prepare("SELECT user_id, username, email, full_name, role FROM users WHERE user_id = :id AND is_active = 1 LIMIT 1");
    $stmt->execute([':id' => $_SESSION['user_id']]);
    $user = $stmt->fetch();

    if ($user) {
        echo json_encode([
            'authenticated' => true,
            'user' => $user
        ]);
        exit;
    }
}

// Default fallback buyer session for local development
$stmt = $pdo->prepare("SELECT user_id, username, email, full_name, role FROM users WHERE role = 'buyer' AND is_active = 1 LIMIT 1");
$stmt->execute();
$defaultBuyer = $stmt->fetch();

if ($defaultBuyer) {
    echo json_encode([
        'authenticated' => true,
        'user' => [
            'user_id' => $defaultBuyer['user_id'],
            'username' => $defaultBuyer['username'],
            'email' => $defaultBuyer['email'],
            'full_name' => $defaultBuyer['full_name'],
            'role' => $defaultBuyer['role']
        ]
    ]);
} else {
    echo json_encode([
        'authenticated' => false,
        'message' => 'No active session'
    ]);
}

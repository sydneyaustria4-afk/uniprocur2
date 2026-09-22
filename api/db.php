<?php
$host = 'localhost';
$dbname = 'uniprocur2';
$username = 'root';
$password = '';

try {
    $pdo = new PDO(
        "mysql:host=$host;dbname=$dbname;charset=utf8mb4",
        $username,
        $password,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]
    );
} catch (PDOException $error) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['message' => 'Database connection failed.']);
    exit;
}

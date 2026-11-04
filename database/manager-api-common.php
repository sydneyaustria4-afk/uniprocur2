<?php
/**
 * Shared Manager API helpers for UniProcur.
 * Local demo mode is restricted to a loopback request on localhost.
 */

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

const UNIPROCUR_MANAGER_LOCAL_DEMO_MODE = true;

function managerSendJson(int $statusCode, array $payload): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, max-age=0');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function managerCsrfToken(): string
{
    if (empty($_SESSION['manager_csrf_token']) || !is_string($_SESSION['manager_csrf_token'])) {
        $_SESSION['manager_csrf_token'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['manager_csrf_token'];
}

function isLocalManagerDemoRequest(): bool
{
    if (!UNIPROCUR_MANAGER_LOCAL_DEMO_MODE) {
        return false;
    }

    $host = strtolower(trim((string) ($_SERVER['HTTP_HOST'] ?? '')));
    $remoteAddress = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    $isLoopbackAddress = in_array($remoteAddress, ['127.0.0.1', '::1'], true);
    $isLocalHost = (bool) preg_match('/\A(localhost|127\.0\.0\.1)(:\d+)?\z/', $host);

    return $isLoopbackAddress && $isLocalHost;
}

function requireActiveManager(mysqli $conn): array
{
    if (!empty($_SESSION['user_id'])) {
        $userId = (int) $_SESSION['user_id'];
        $stmt = $conn->prepare(
            "SELECT id, full_name, email, role, is_active
             FROM users WHERE id = ? LIMIT 1"
        );
        $stmt->bind_param('i', $userId);
    } elseif (isLocalManagerDemoRequest()) {
        $email = 'carlo@company.com';
        $stmt = $conn->prepare(
            "SELECT id, full_name, email, role, is_active
             FROM users WHERE email = ? LIMIT 1"
        );
        $stmt->bind_param('s', $email);
    } else {
        managerSendJson(401, [
            'success' => false,
            'message' => 'Please sign in with an authorized Manager account.'
        ]);
    }

    $stmt->execute();
    $manager = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (
        !$manager ||
        strtolower((string) ($manager['role'] ?? '')) !== 'manager' ||
        !(bool) ($manager['is_active'] ?? false)
    ) {
        managerSendJson(401, [
            'success' => false,
            'message' => 'A valid active Manager account is required.'
        ]);
    }

    return $manager;
}

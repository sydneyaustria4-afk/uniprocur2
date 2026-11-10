<?php
/**
 * UniProcur Manager Settings API.
 * GET: Manager identity and Procurement-only settings.
 * POST: Save contact number or one notification preference (CSRF protected).
 * Uses the existing Manager identity + localhost-only demo rules.
 * It never changes users.full_name, email, password, role, or HR credentials.
 */
require_once __DIR__ . '/procurement_db_connection.php';
require_once __DIR__ . '/manager-api-common.php';

try {
    $manager = requireActiveManager($conn);
    $managerId = (int) $manager['id'];

    $schemaReady = (bool) $conn->query(
        "SELECT 1 FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'manager_settings' LIMIT 1"
    )->fetch_row();

    $defaults = [
        'contact_number' => '',
        'notify_pr' => 1,
        'notify_rfq' => 1,
        'notify_deadline' => 0,
        'notify_po' => 1,
        'notify_daily' => 0,
    ];

    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
        $preferences = $defaults;
        if ($schemaReady) {
            $stmt = $conn->prepare(
                'SELECT contact_number, notify_pr, notify_rfq, notify_deadline, notify_po, notify_daily
                 FROM manager_settings WHERE user_id = ? LIMIT 1'
            );
            $stmt->bind_param('i', $managerId);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if ($row) {
                foreach ($defaults as $field => $default) {
                    $preferences[$field] = $field === 'contact_number'
                        ? (string) ($row[$field] ?? '')
                        : (int) ($row[$field] ?? $default);
                }
            }
        }
        managerSendJson(200, [
            'success' => true,
            'manager' => [
                'full_name' => (string) $manager['full_name'],
                'email' => (string) $manager['email'],
                'role' => 'manager',
            ],
            'preferences' => $preferences,
            'schema_ready' => $schemaReady,
            'local_demo' => empty($_SESSION['user_id']) && isLocalManagerDemoRequest(),
            'csrf_token' => managerCsrfToken(),
            'notification_delivery_connected' => false,
        ]);
    }

    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
        header('Allow: GET, POST');
        managerSendJson(405, ['success' => false, 'message' => 'Only GET and POST are supported.']);
    }
    if (!$schemaReady) {
        managerSendJson(409, [
            'success' => false,
            'message' => 'Manager Settings table is missing. Run 01_create_manager_settings.sql in the uniprocur2 database first.',
        ]);
    }

    // Guard against accidentally exposing write operations without a Manager session
    // or the existing localhost-only demonstration exception.
    if (empty($_SESSION['user_id']) && !isLocalManagerDemoRequest()) {
        managerSendJson(401, ['success' => false, 'message' => 'Authenticated Manager session required.']);
    }
    $providedToken = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
    if (!$providedToken || !hash_equals(managerCsrfToken(), $providedToken)) {
        managerSendJson(403, ['success' => false, 'message' => 'Security token mismatch. Refresh Manager Settings and try again.']);
    }
    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > 4096) {
        managerSendJson(413, ['success' => false, 'message' => 'Request data too large.']);
    }
    $body = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($body)) {
        managerSendJson(400, ['success' => false, 'message' => 'Valid JSON request data is required.']);
    }
    $action = (string) ($body['action'] ?? '');

    if ($action === 'contact') {
        if (!isset($body['contact_number']) || !is_string($body['contact_number'])) {
            managerSendJson(422, ['success' => false, 'message' => 'Contact number must be text.']);
        }
        $phone = trim($body['contact_number']);
        if ($phone !== '' && (!preg_match('/\A[+()0-9\s-]{5,32}\z/u', $phone) || strlen($phone) > 32)) {
            managerSendJson(422, ['success' => false, 'message' => 'Invalid contact number. Use 5–32 characters (digits, spaces, +, - or parentheses).']);
        }
        $stmt = $conn->prepare(
            'INSERT INTO manager_settings (user_id, contact_number) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE contact_number = VALUES(contact_number)'
        );
        $stmt->bind_param('is', $managerId, $phone);
        $stmt->execute();
        $stmt->close();
        managerSendJson(200, [
            'success' => true,
            'message' => 'Contact number saved. HR-owned credentials remain unchanged.',
            'contact_number' => $phone,
        ]);
    }

    if ($action === 'notification') {
        $allowed = ['notify_pr', 'notify_po', 'notify_daily'];
        $column = (string) ($body['preference'] ?? '');
        if (!in_array($column, $allowed, true) || !array_key_exists('enabled', $body) || !is_bool($body['enabled'])) {
            managerSendJson(422, ['success' => false, 'message' => 'Invalid notification preference.']);
        }
        $enabled = $body['enabled'] ? 1 : 0;
        // $column comes only from the hardcoded whitelist, never untrusted SQL.
        $stmt = $conn->prepare(
            "INSERT INTO manager_settings (user_id, {$column}) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE {$column} = VALUES({$column})"
        );
        $stmt->bind_param('ii', $managerId, $enabled);
        $stmt->execute();
        $stmt->close();
        managerSendJson(200, [
            'success' => true,
            'preference' => $column,
            'enabled' => (bool) $enabled,
            'notification_delivery_connected' => false,
        ]);
    }
    managerSendJson(422, ['success' => false, 'message' => 'Unknown Settings action.']);
} catch (Throwable $error) {
    error_log('Manager Settings API: ' . $error->getMessage());
    managerSendJson(500, [
        'success' => false,
        'message' => 'Unable to process Manager Settings. Check XAMPP PHP/MySQL logs.',
    ]);
}

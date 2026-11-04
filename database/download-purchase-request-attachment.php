<?php
require_once __DIR__ . '/procurement_db_connection.php';
require_once __DIR__ . '/manager-api-common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    managerSendJson(405, ['success' => false, 'message' => 'Use GET to open an attachment.']);
}

try {
    requireActiveManager($conn);

    $attachmentId = filter_var($_GET['id'] ?? null, FILTER_VALIDATE_INT);
    if (!$attachmentId || $attachmentId < 1) {
        managerSendJson(400, ['success' => false, 'message' => 'A valid attachment ID is required.']);
    }

    $stmt = $conn->prepare(
        "SELECT original_name, stored_name, mime_type
         FROM purchase_requisition_attachments
         WHERE id = ? LIMIT 1"
    );
    $stmt->bind_param('i', $attachmentId);
    $stmt->execute();
    $file = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$file) {
        managerSendJson(404, ['success' => false, 'message' => 'Attachment not found.']);
    }

    $storedName = (string) $file['stored_name'];
    if (!preg_match('/\A[a-f0-9]{32}\.[a-z0-9]{1,10}\z/i', $storedName)) {
        managerSendJson(400, ['success' => false, 'message' => 'The stored attachment name is invalid.']);
    }

    $directory = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'uploads' . DIRECTORY_SEPARATOR . 'purchase-requests';
    $path = $directory . DIRECTORY_SEPARATOR . $storedName;
    if (!is_file($path) || !is_readable($path)) {
        managerSendJson(404, ['success' => false, 'message' => 'The attachment file is missing from the server.']);
    }

    $originalName = basename((string) $file['original_name']);
    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $inlineExtensions = ['pdf', 'png', 'jpg', 'jpeg'];
    $disposition = in_array($extension, $inlineExtensions, true) ? 'inline' : 'attachment';
    $mimeType = trim((string) $file['mime_type']) ?: 'application/octet-stream';

    header('Content-Type: ' . $mimeType);
    header('Content-Length: ' . (string) filesize($path));
    header("Content-Disposition: {$disposition}; filename*=UTF-8''" . rawurlencode($originalName));
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, no-store, max-age=0');
    readfile($path);
    exit;
} catch (Throwable $error) {
    error_log('Download Purchase Request Attachment Error: ' . $error->getMessage());
    managerSendJson(500, ['success' => false, 'message' => 'Unable to open this attachment.']);
}

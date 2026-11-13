<?php
// Local classroom demo: time-based simulation of supplier quotation readiness.
// No RFQ quote amount is written here. Save and Compare remains the save step.
header('Content-Type: application/json; charset=utf-8');
if (session_status() !== PHP_SESSION_ACTIVE) {
    require_once __DIR__ . '/uniprocur-session.php';
}
require_once __DIR__ . '/procurement_db_connection.php';

function demoReply(int $code, array $body): void {
    http_response_code($code);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        demoReply(405, ['success' => false, 'message' => 'GET required.']);
    }
    $number = trim((string)($_GET['rfq_number'] ?? ''));
    if ($number === '' || strlen($number) > 30) {
        demoReply(422, ['success' => false, 'message' => 'Invalid RFQ number.']);
    }

    // Matches the existing local UniProcur buyer authentication convention.
    if (!empty($_SESSION['user_id'])) {
        $userId = (int)$_SESSION['user_id'];
        $stmt = $conn->prepare('SELECT id, role, is_active FROM users WHERE id=? LIMIT 1');
        $stmt->bind_param('i', $userId);
    } else {
        // Existing demo fallback; remove when enforcing real user sessions.
        $email = (require __DIR__ . '/buyer-demo-email.php');
        $stmt = $conn->prepare('SELECT id, role, is_active FROM users WHERE email=? LIMIT 1');
        $stmt->bind_param('s', $email);
    }
    $stmt->execute();
    $buyer = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$buyer || strtolower((string)$buyer['role']) !== 'buyer' || !(int)$buyer['is_active']) {
        demoReply(401, ['success' => false, 'message' => 'Active Buyer login required.']);
    }
    $buyerId = (int)$buyer['id'];

    // Compare times within the database server, avoiding browser time zone issues.
    $stmt = $conn->prepare(
        'SELECT r.id, r.rfq_number, r.status,
                GREATEST(0, TIMESTAMPDIFF(SECOND, r.created_at, NOW())) AS age_seconds
         FROM rfqs r
         JOIN purchase_requisitions pr ON pr.id = r.pr_id
         WHERE r.rfq_number=? AND r.created_by=? AND pr.created_by=?
         LIMIT 1'
    );
    $stmt->bind_param('sii', $number, $buyerId, $buyerId);
    $stmt->execute();
    $rfq = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$rfq) {
        demoReply(404, ['success' => false, 'message' => 'RFQ not found for this buyer.']);
    }

    $rfqId = (int)$rfq['id'];
    $ageSeconds = max(0, (int)$rfq['age_seconds']);
    $rfqStatus = strtolower((string)$rfq['status']);
    $isOpen = ($rfqStatus === 'open');
    $stmt = $conn->prepare(
        'SELECT id AS quote_id, total_amount FROM rfq_quotes WHERE rfq_id=? ORDER BY id ASC'
    );
    $stmt->bind_param('i', $rfqId);
    $stmt->execute();
    $quotes = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    $suppliers = [];
    $readyCount = 0;
    $remainingSeconds = 0;
    foreach ($quotes as $index => $quote) {
        // First simulated supplier replies after 4 seconds; next after 7, 10, etc.
        $delay = 4 + ($index * 3);
        $saved = $quote['total_amount'] !== null;
        $demoReady = $isOpen && $ageSeconds >= $delay;
        $quoted = $saved || $demoReady;
        if ($quoted) {
            $readyCount++;
        } elseif ($isOpen) {
            $remainingSeconds = max($remainingSeconds, $delay - $ageSeconds);
        }
        $suppliers[] = [
            'quote_id' => (int)$quote['quote_id'],
            'status' => $quoted ? 'Quoted' : ($isOpen ? 'Pending' : ucfirst($rfqStatus)),
            'simulated' => (!$saved && $demoReady),
            'saved' => $saved
        ];
    }

    $allReady = count($quotes) > 0 && $readyCount === count($quotes);
    demoReply(200, [
        'success' => true,
        'rfq_number' => $rfq['rfq_number'],
        'rfq_status' => $rfqStatus,
        'suppliers' => $suppliers,
        'ready_count' => $readyCount,
        'total_suppliers' => count($quotes),
        'all_quoted' => $allReady,
        'can_enter_quotation' => $isOpen && $allReady,
        'seconds_remaining' => $remainingSeconds,
        'demo' => true
    ]);
} catch (Throwable $error) {
    error_log('RFQ Demo Status Error: ' . $error->getMessage());
    demoReply(500, ['success' => false, 'message' => 'Unable to check demo quotation status. Check PHP error log.']);
}

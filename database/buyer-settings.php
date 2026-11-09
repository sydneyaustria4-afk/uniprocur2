<?php
/** UniProcur Buyer Settings: HR-owned users remain READ-ONLY. */
require_once __DIR__ . '/buyer-po-common.php';
header('Cache-Control: no-store, private');

function settingsReply(int $code, array $payload): void {
    buyerPoJson($code, $payload);
}
try {
    if (!in_array($_SERVER['REQUEST_METHOD'], ['GET','POST'], true)) {
        settingsReply(405, ['success' => false, 'message' => 'GET or POST required.']);
    }
    $buyer = buyerPoIdentity($conn); // validates active Buyer + session or localhost demo mode
    $buyerId = (int)$buyer['id'];
    $authenticated = !empty($_SESSION['user_id']) && (int)$_SESSION['user_id'] === $buyerId;
    $tableExistsResult = $conn->query("SHOW TABLES LIKE 'buyer_settings'");
    $schemaReady = $tableExistsResult->num_rows > 0;
    $tableExistsResult->free();

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        // Crucial: the local demo fallback is READ-ONLY. HR must create a real Buyer session first.
        if (!$authenticated) {
            settingsReply(403, ['success' => false, 'message' => 'A real Buyer login session from HR is required to save settings.']);
        }
        if (!$schemaReady) {
            settingsReply(503, ['success' => false, 'message' => 'Missing buyer_settings table. Run the included SQL migration first.']);
        }
        $providedToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (empty($_SESSION['buyer_settings_csrf']) || !is_string($providedToken) || !hash_equals($_SESSION['buyer_settings_csrf'], $providedToken)) {
            settingsReply(403, ['success' => false, 'message' => 'Invalid security token. Refresh and try again.']);
        }
        $data = json_decode(file_get_contents('php://input'), true);
        if (!is_array($data)) settingsReply(400, ['success' => false, 'message' => 'Invalid JSON request.']);
        $action = $data['action'] ?? '';
        if ($action === 'profile') {
            $phone = trim((string)($data['contact_number'] ?? ''));
            if (strlen($phone) > 32 || ($phone !== '' && !preg_match('/\A[+()\d\s-]{5,32}\z/D', $phone))) {
                settingsReply(422, ['success' => false, 'message' => 'Invalid contact number.']);
            }
            $stmt = $conn->prepare('INSERT INTO buyer_settings (buyer_id, contact_number) VALUES (?, ?) ON DUPLICATE KEY UPDATE contact_number = VALUES(contact_number)');
            $stmt->bind_param('is', $buyerId, $phone);
            $stmt->execute(); $stmt->close();
            settingsReply(200, ['success' => true, 'message' => 'Buyer contact saved.']);
        }
        if ($action === 'notifications') {
            foreach (['notify_pr','notify_rfq','notify_po'] as $name) {
                if (!array_key_exists($name,$data) || !is_bool($data[$name])) settingsReply(422,['success'=>false,'message'=>"Invalid preference: {$name}."]);
            }
            $pr = (int)$data['notify_pr']; $rfq = (int)$data['notify_rfq']; $po = (int)$data['notify_po'];
            $stmt = $conn->prepare('INSERT INTO buyer_settings (buyer_id,notify_pr,notify_rfq,notify_po) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE notify_pr=VALUES(notify_pr),notify_rfq=VALUES(notify_rfq),notify_po=VALUES(notify_po)');
            $stmt->bind_param('iiii', $buyerId, $pr,$rfq,$po);
            $stmt->execute(); $stmt->close();
            settingsReply(200, ['success' => true, 'message' => 'Buyer notification preferences saved.']);
        }
        settingsReply(422, ['success' => false, 'message' => 'Unknown settings action.']);
    }

    $department = '';
    $cols = $conn->query('SHOW COLUMNS FROM users');
    $hasDepartment = false;
    while ($row = $cols->fetch_assoc()) if ($row['Field'] === 'department') $hasDepartment = true;
    $cols->free();
    if ($hasDepartment) {
        $stmt = $conn->prepare('SELECT department FROM users WHERE id = ? LIMIT 1');
        $stmt->bind_param('i',$buyerId); $stmt->execute();
        $department = (string)(($stmt->get_result()->fetch_assoc())['department'] ?? ''); $stmt->close();
    }
    $preferences = ['contact_number'=>'', 'notify_pr'=>1, 'notify_rfq'=>1, 'notify_po'=>1];
    if ($schemaReady) {
        $stmt = $conn->prepare('SELECT contact_number,notify_pr,notify_rfq,notify_po FROM buyer_settings WHERE buyer_id = ? LIMIT 1');
        $stmt->bind_param('i',$buyerId); $stmt->execute();
        $found = $stmt->get_result()->fetch_assoc(); $stmt->close();
        if ($found) $preferences = array_merge($preferences,$found);
    }
    $csrf = '';
    if ($authenticated) {
        if (empty($_SESSION['buyer_settings_csrf'])) $_SESSION['buyer_settings_csrf'] = bin2hex(random_bytes(32));
        $csrf = $_SESSION['buyer_settings_csrf'];
    }
    settingsReply(200, [
      'success'=>true,
      'authenticated'=>$authenticated,
      'schema_ready'=>$schemaReady,
      'user'=>['full_name'=>$buyer['full_name'], 'email'=>$buyer['email'], 'role'=>$buyer['role'], 'department'=>$department],
      'preferences'=>$preferences,
      'csrf_token'=>$csrf
    ]);
} catch (Throwable $error) {
    error_log('Buyer Settings: '.$error->getMessage());
    settingsReply(500, ['success'=>false,'message'=>'Unable to load Buyer settings. Check PHP/MySQL logs.']);
}

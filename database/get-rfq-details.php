<?php
header('Content-Type: application/json; charset=utf-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

require_once __DIR__ . '/procurement_db_connection.php';

function rfqDetailsReply(int $code, array $payload): void
{
    http_response_code($code);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        rfqDetailsReply(405, ['success' => false, 'message' => 'GET required.']);
    }

    $rfqNumber = trim((string) ($_GET['rfq_number'] ?? ''));
    if ($rfqNumber === '' || strlen($rfqNumber) > 30) {
        rfqDetailsReply(422, ['success' => false, 'message' => 'Valid RFQ number required.']);
    }

    // Same buyer authentication convention as existing UniProcur APIs.
    // The demo fallback should be removed when real login is enforced for all pages.
    if (!empty($_SESSION['user_id'])) {
        $userId = (int) $_SESSION['user_id'];
        $userStmt = $conn->prepare(
            'SELECT id, full_name, email, role, is_active FROM users WHERE id = ? LIMIT 1'
        );
        $userStmt->bind_param('i', $userId);
    } else {
        $demoEmail = 'clark@company.com';
        $userStmt = $conn->prepare(
            'SELECT id, full_name, email, role, is_active FROM users WHERE email = ? LIMIT 1'
        );
        $userStmt->bind_param('s', $demoEmail);
    }

    $userStmt->execute();
    $buyer = $userStmt->get_result()->fetch_assoc();
    $userStmt->close();

    if (!$buyer || strtolower((string) $buyer['role']) !== 'buyer' || !(int) $buyer['is_active']) {
        rfqDetailsReply(401, ['success' => false, 'message' => 'Active Buyer login required.']);
    }
    $buyerId = (int) $buyer['id'];

    $rfqStmt = $conn->prepare(
        'SELECT r.id, r.rfq_number, r.created_at, r.deadline, r.warehouse_value,
                r.status, pr.pr_number
         FROM rfqs AS r
         JOIN purchase_requisitions AS pr ON pr.id = r.pr_id
         WHERE r.rfq_number = ? AND r.created_by = ? AND pr.created_by = ?
         LIMIT 1'
    );
    $rfqStmt->bind_param('sii', $rfqNumber, $buyerId, $buyerId);
    $rfqStmt->execute();
    $rfq = $rfqStmt->get_result()->fetch_assoc();
    $rfqStmt->close();

    if (!$rfq) {
        rfqDetailsReply(404, ['success' => false, 'message' => 'RFQ not found in this Buyer account.']);
    }

    // PR records in some copies of this project have no description field.
    // Include it only when such a field is actually present.
    $itemCols = [];
    $colResult = $conn->query('SHOW COLUMNS FROM pr_items');
    while ($row = $colResult->fetch_assoc()) {
        $itemCols[$row['Field']] = true;
    }
    $descriptionExpr = "'' AS description";
    foreach (['description', 'item_description', 'specifications'] as $column) {
        if (isset($itemCols[$column])) {
            $descriptionExpr = "pi.`{$column}` AS description";
            break;
        }
    }

    $itemStmt = $conn->prepare(
        'SELECT pi.id, pi.item_name, pi.item_code, pi.category, pi.unit, pi.qty, '
        . $descriptionExpr . '
         FROM pr_items AS pi
         JOIN rfqs AS r ON r.pr_id = pi.pr_id
         WHERE r.id = ?
         ORDER BY pi.id ASC'
    );
    $rfqId = (int) $rfq['id'];
    $itemStmt->bind_param('i', $rfqId);
    $itemStmt->execute();
    $items = $itemStmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $itemStmt->close();

    // Suppliers' email column name varies across versions of the demo schema.
    $supplierCols = [];
    $supplierColResult = $conn->query('SHOW COLUMNS FROM suppliers');
    while ($row = $supplierColResult->fetch_assoc()) {
        $supplierCols[$row['Field']] = true;
    }
    $emailExpr = "'' AS email";
    foreach (['email', 'contact_email', 'supplier_email', 'email_address'] as $column) {
        if (isset($supplierCols[$column])) {
            $emailExpr = "s.`{$column}` AS email";
            break;
        }
    }

    $supplierStmt = $conn->prepare(
        'SELECT q.id AS quote_id, s.name, '
        . $emailExpr . ', q.total_amount, q.is_winner
         FROM rfq_quotes AS q
         JOIN suppliers AS s ON s.id = q.supplier_id
         WHERE q.rfq_id = ?
         ORDER BY q.id ASC'
    );
    $supplierStmt->bind_param('i', $rfqId);
    $supplierStmt->execute();
    $suppliers = $supplierStmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $supplierStmt->close();

    foreach ($suppliers as &$supplier) {
        $supplier['quotation_status'] = $supplier['total_amount'] === null
            ? 'Awaiting quotation'
            : 'Quoted';
    }
    unset($supplier);

    rfqDetailsReply(200, [
        'success' => true,
        'buyer' => [
            'full_name' => $buyer['full_name'],
            'email' => $buyer['email'],
        ],
        'rfq' => $rfq,
        'items' => $items,
        'suppliers' => $suppliers,
    ]);
} catch (Throwable $error) {
    error_log('Get RFQ Details Error: ' . $error->getMessage());
    rfqDetailsReply(500, [
        'success' => false,
        'message' => 'Unable to load RFQ Details. Check the PHP error log.',
    ]);
}

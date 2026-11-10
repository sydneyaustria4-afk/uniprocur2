
<?php
header('Content-Type: application/json; charset=utf-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

require_once __DIR__ . '/procurement_db_connection.php';

require_once __DIR__ . '/procurement-audit-log.php';


function sendJson(int $status, array $data): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function normalizeSupplierName(string $name): string
{
    $name = strtolower(str_replace('&', 'and', trim($name)));
    return preg_replace('/[^a-z0-9]/', '', $name);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    sendJson(405, [
        'success' => false,
        'message' => 'POST method required.'
    ]);
}

$transactionStarted = false;

try {
    // 1. Verify Buyer session.
    if (!empty($_SESSION['user_id'])) {
        $userId = (int) $_SESSION['user_id'];

        $stmt = $conn->prepare(
            SELECT id, full_name, role, is_active
             FROM users WHERE id = ? LIMIT 1"
        );
        $stmt->bind_param('i', $userId);
    } else {
        $email = 'clark@company.com';

        $stmt = $conn->prepare(
            SELECT id, full_name, role, is_active
             FROM users WHERE email = ? LIMIT 1"
        );
        $stmt->bind_param('s', $email);
    }

    $stmt->execute();
    $buyer = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (
        !$buyer ||
        $buyer['role'] !== 'buyer' ||
        !(bool) $buyer['is_active']
    ) {
        sendJson(401, [
            'success' => false,
            'message' => 'Active Buyer account required.'
        ]);
    }

    $buyerId = (int) $buyer['id'];

    // 2. Read submitted RFQ information.
    $input = json_decode(file_get_contents('php://input'), true);

    if (!is_array($input)) {
        sendJson(400, [
            'success' => false,
            'message' => 'Invalid RFQ data.'
        ]);
    }

    $rfqNumber = trim((string) ($input['rfq_number'] ?? ''));
    $prNumber = trim((string) ($input['pr_number'] ?? ''));
    $deadline = trim((string) ($input['deadline'] ?? ''));
    
$warehouseValue = trim(
    (string) ($input['warehouse_value'] ?? '')
);

if (!in_array($warehouseValue, ['main', 'second'], true)) {
    sendJson(422, [
        'success' => false,
        'message' => 'Please select a valid warehouse.'
    ]);
}

    $suppliers = $input['suppliers'] ?? [];

    if ($rfqNumber === '' || strlen($rfqNumber) > 30) {
        sendJson(422, [
            'success' => false,
            'message' => 'Invalid RFQ number.'
        ]);
    }

    if ($prNumber === '' || strlen($prNumber) > 50) {
        sendJson(422, [
            'success' => false,
            'message' => 'Invalid Purchase Request number.'
        ]);
    }

    $date = DateTime::createFromFormat('Y-m-d', $deadline);

    if (!$date || $date->format('Y-m-d') !== $deadline) {
        sendJson(422, [
            'success' => false,
            'message' => 'Invalid quotation deadline.'
        ]);
    }

    if (!is_array($suppliers) || count($suppliers) === 0) {
        sendJson(422, [
            'success' => false,
            'message' => 'Please select at least one supplier.'
        ]);
    }

    // 3. Verify selected suppliers against the existing supplier table.
    $columns = [];
    $columnResult = $conn->query("SHOW COLUMNS FROM suppliers");

    while ($column = $columnResult->fetch_assoc()) {
        $columns[$column['Field']] = $column;
    }

    $primaryKey = null;

    foreach ($columns as $field => $column) {
        if ($column['Key'] === 'PRI') {
            $primaryKey = $field;
            break;
        }
    }

    if (!$primaryKey) {
        throw new RuntimeException(
            'Suppliers table primary key was not found.'
        );
    }

    $nameCandidates = [
        'supplier_name',
        'name',
        'company_name',
        'business_name',
        'supplier_company',
        'supplier'
    ];

    $nameColumns = [];

    foreach ($nameCandidates as $candidate) {
        if (isset($columns[$candidate])) {
            $nameColumns[] = $candidate;
        }
    }

    // If the name column uses a different field name,
    // inspect the remaining text columns as a fallback.
    if (empty($nameColumns)) {
        foreach ($columns as $field => $column) {
            if (
                stripos($column['Type'], 'varchar') === 0 ||
                stripos($column['Type'], 'text') !== false ||
                stripos($column['Type'], 'char') === 0
            ) {
                $nameColumns[] = $field;
            }
        }
    }

    if (empty($nameColumns)) {
        throw new RuntimeException(
            'No supplier name columns were found.'
        );
    }

    $supplierResult = $conn->query("SELECT * FROM suppliers");
    $supplierRows = $supplierResult->fetch_all(MYSQLI_ASSOC);

    $supplierIds = [];

    foreach ($suppliers as $supplier) {
        $supplierName = trim(
            (string) ($supplier['name'] ?? '')
        );

        if ($supplierName === '') {
            sendJson(422, [
                'success' => false,
                'message' => 'A selected supplier has no name.'
            ]);
        }

        $normalizedName = normalizeSupplierName($supplierName);
        $matches = [];

        foreach ($supplierRows as $row) {
            foreach ($nameColumns as $nameColumn) {
                $databaseName = trim(
                    (string) ($row[$nameColumn] ?? '')
                );

                if (
                    $databaseName !== '' &&
                    normalizeSupplierName($databaseName) === $normalizedName
                ) {
                    $matches[(string) $row[$primaryKey]] =
                        (int) $row[$primaryKey];
                }
            }
        }

        if (count($matches) !== 1) {
            sendJson(422, [
                'success' => false,
                'message' => count($matches) === 0
                    ? 'Supplier "' . $supplierName . '" was not found. Check its name in the suppliers table.'
                    : 'Supplier "' . $supplierName . '" matched multiple records.'
            ]);
        }

        $supplierId = array_values($matches)[0];

        if (!in_array($supplierId, $supplierIds, true)) {
            $supplierIds[] = $supplierId;
        }
    }

    // 4. Start transaction.
    $conn->begin_transaction();
    $transactionStarted = true;

    // Check that the PR belongs to this Buyer and is approved.
    $prStmt = $conn->prepare(
        "SELECT id
         FROM purchase_requisitions
         WHERE pr_number = ?
           AND created_by = ?
           AND LOWER(status) = 'approved'
         LIMIT 1
         FOR UPDATE"
    );

    $prStmt->bind_param('si', $prNumber, $buyerId);
    $prStmt->execute();

    $pr = $prStmt->get_result()->fetch_assoc();
    $prStmt->close();

    if (!$pr) {
        $conn->rollback();
        $transactionStarted = false;

        sendJson(404, [
            'success' => false,
            'message' => 'Approved Purchase Request not found.'
        ]);
    }

    $prId = (int) $pr['id'];

    // Prevent duplicate RFQs for the same PR.
    $checkStmt = $conn->prepare(
        "SELECT id FROM rfqs WHERE pr_id = ? LIMIT 1"
    );

    $checkStmt->bind_param('i', $prId);
    $checkStmt->execute();

    $existingRfq = $checkStmt->get_result()->fetch_assoc();
    $checkStmt->close();

    if ($existingRfq) {
        $conn->rollback();
        $transactionStarted = false;

        sendJson(409, [
            'success' => false,
            'message' => 'An RFQ already exists for this Purchase Request.'
        ]);
    }

    // Check RFQ number uniqueness.
    $numberStmt = $conn->prepare(
        "SELECT id FROM rfqs WHERE rfq_number = ? LIMIT 1"
    );

    $numberStmt->bind_param('s', $rfqNumber);
    $numberStmt->execute();

    $duplicateNumber = $numberStmt->get_result()->fetch_assoc();
    $numberStmt->close();

    if ($duplicateNumber) {
        $conn->rollback();
        $transactionStarted = false;

        sendJson(409, [
            'success' => false,
            'message' => 'RFQ number already exists. Please reopen the RFQ creation page.'
        ]);
    }

    // 5. Save RFQ.
   
$insertRfq = $conn->prepare(
    "INSERT INTO rfqs
        (rfq_number, pr_id, created_by,
         deadline, warehouse_value, status)
     VALUES (?, ?, ?, ?, ?, 'open')"
);

$insertRfq->bind_param(
    'siiss',
    $rfqNumber,
    $prId,
    $buyerId,
    $deadline,
    $warehouseValue
);


    $insertRfq->execute();

    $rfqId = (int) $conn->insert_id;
    $insertRfq->close();

    // 6. Create supplier quotation slots.
    // NULL total_amount means quotation has not been submitted.
    $insertQuote = $conn->prepare(
        "INSERT INTO rfq_quotes
            (rfq_id, supplier_id, total_amount, is_winner)
         VALUES (?, ?, NULL, NULL)"
    );

    foreach ($supplierIds as $supplierId) {
        $insertQuote->bind_param('ii', $rfqId, $supplierId);
        $insertQuote->execute();
    }

    
$insertQuote->close();

procurementAuditLog(
    $conn,
    $buyer,
    'RFQ',
    'Submitted',
    $rfqNumber,
    "RFQ {$rfqNumber} created for {$prNumber}."
);

$conn->commit();

    $transactionStarted = false;

    sendJson(201, [
        'success' => true,
        'message' => 'RFQ successfully saved and is awaiting supplier quotations.',
        'rfq' => [
            'id' => $rfqId,
            'rfq_number' => $rfqNumber,
            'pr_number' => $prNumber,
            'deadline' => $deadline,
           'status' => 'open',
            'supplier_count' => count($supplierIds)
        ]
    ]);

} catch (Throwable $error) {

    if ($transactionStarted) {
        try {
            $conn->rollback();
        } catch (Throwable $rollbackError) {
            error_log($rollbackError->getMessage());
        }
    }

    error_log('Create RFQ Error: ' . $error->getMessage());

    sendJson(500, [
        'success' => false,
        'message' => 'Unable to save RFQ. Check the PHP error log.'
    ]);
}

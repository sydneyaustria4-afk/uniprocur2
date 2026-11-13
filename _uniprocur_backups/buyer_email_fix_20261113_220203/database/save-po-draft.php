
<?php

header('Content-Type: application/json; charset=utf-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    require_once __DIR__ . '/uniprocur-session.php';
}

require_once __DIR__ . '/procurement_db_connection.php';

function draftReply(int $status, array $data): void
{
    http_response_code($status);
    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
    );
    exit;
}

function draftReject(
    mysqli $conn,
    bool &$started,
    int $status,
    string $message
): void {
    if ($started) {
        $conn->rollback();
        $started = false;
    }

    draftReply($status, [
        'success' => false,
        'message' => $message
    ]);
}

$started = false;

try {
    // ========================================
    // 1. VALIDATE REQUEST
    // ========================================

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        draftReply(405, [
            'success' => false,
            'message' => 'POST required.'
        ]);
    }

    $input = json_decode(
        file_get_contents('php://input'),
        true
    );

    if (!is_array($input)) {
        draftReply(400, [
            'success' => false,
            'message' => 'Invalid JSON request.'
        ]);
    }

    $rfqNumber = trim(
        (string) ($input['rfq_number'] ?? '')
    );

    $quoteId = filter_var(
        $input['quote_id'] ?? null,
        FILTER_VALIDATE_INT
    );

    $notes = trim(
        (string) ($input['notes'] ?? '')
    );

    if (
        $rfqNumber === '' ||
        strlen($rfqNumber) > 30 ||
        !$quoteId ||
        $quoteId < 1
    ) {
        draftReply(422, [
            'success' => false,
            'message' => 'Invalid RFQ or quote ID.'
        ]);
    }

    if (strlen($notes) > 2000) {
        draftReply(422, [
            'success' => false,
            'message' => 'Notes must be at most 2000 bytes.'
        ]);
    }

    // ========================================
    // 2. VERIFY BUYER ACCOUNT
    // ========================================

    if (!empty($_SESSION['user_id'])) {
        $userId = (int) $_SESSION['user_id'];

        $stmt = $conn->prepare(
            'SELECT id, role, is_active
             FROM users
             WHERE id = ?
             LIMIT 1'
        );

        $stmt->bind_param('i', $userId);

    } else {
        // Matches the existing UniProcur demo login.
        // Remove this fallback before production.
        $email = 'clark@company.com';

        $stmt = $conn->prepare(
            'SELECT id, role, is_active
             FROM users
             WHERE email = ?
             LIMIT 1'
        );

        $stmt->bind_param('s', $email);
    }

    $stmt->execute();
    $buyer = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (
        !$buyer ||
        strtolower((string) $buyer['role']) !== 'buyer' ||
        !(int) $buyer['is_active']
    ) {
        draftReply(401, [
            'success' => false,
            'message' => 'Active Buyer account required.'
        ]);
    }

    $buyerId = (int) $buyer['id'];

    // ========================================
    // 3. VERIFY THE AWARDED RFQ
    // ========================================

    $conn->begin_transaction();
    $started = true;

    $stmt = $conn->prepare(
        "SELECT
            r.id AS rfq_id,
            r.deadline,
            r.warehouse_value,
            q.supplier_id,
            q.total_amount

         FROM rfqs r

         JOIN purchase_requisitions pr
            ON pr.id = r.pr_id

         JOIN rfq_quotes q
            ON q.rfq_id = r.id

         WHERE r.rfq_number = ?
           AND r.created_by = ?
           AND pr.created_by = ?
           AND r.status = 'awarded'
           AND q.id = ?
           AND q.is_winner = 1

         LIMIT 1 FOR UPDATE"
    );

    $stmt->bind_param(
        'siii',
        $rfqNumber,
        $buyerId,
        $buyerId,
        $quoteId
    );

    $stmt->execute();
    $awarded = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$awarded) {
        draftReject(
            $conn,
            $started,
            422,
            'RFQ must be awarded to this supplier before saving a PO.'
        );
    }

    $rfqId = (int) $awarded['rfq_id'];
    $supplierId = (int) $awarded['supplier_id'];
    $expectedDelivery = (string) (
        $awarded['deadline'] ?? ''
    );
    $warehouse = (string) (
        $awarded['warehouse_value'] ?? ''
    );
    $amount = (float) $awarded['total_amount'];

    // ========================================
    // 4. AUTOMATIC DELIVERY INFORMATION
    // ========================================

    $warehouseAddresses = [
        'main' =>
            'Main Warehouse — Brgy. II-C, San Pablo City, Laguna',

        'second' =>
            'Second Warehouse — Palina, Nagcarlan, Laguna'
    ];

    if (
        !isset($warehouseAddresses[$warehouse]) ||
        !preg_match(
            '/^\d{4}-\d{2}-\d{2}$/',
            $expectedDelivery
        )
    ) {
        draftReject(
            $conn,
            $started,
            422,
            'RFQ warehouse or deadline is missing. Please check the RFQ record.'
        );
    }

    if (
        $awarded['total_amount'] === null ||
        !is_finite($amount) ||
        $amount < 0
    ) {
        draftReject(
            $conn,
            $started,
            422,
            'Winning quotation total is invalid.'
        );
    }

    // ========================================
    // 5. PREVENT DUPLICATE PURCHASE ORDERS
    // ========================================

    $stmt = $conn->prepare(
        'SELECT po_number
         FROM purchase_orders
         WHERE rfq_id = ?
         LIMIT 1 FOR UPDATE'
    );

    $stmt->bind_param('i', $rfqId);
    $stmt->execute();

    $existing = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if ($existing) {
        draftReject(
            $conn,
            $started,
            409,
            'A Purchase Order already exists for this RFQ: ' .
            $existing['po_number']
        );
    }

    // ========================================
    // 6. GET ITEMS FROM WINNING QUOTATION
    // ========================================

    $stmt = $conn->prepare(
        'SELECT
            supplier_item_id,
            item_name,
            unit,
            qty,
            unit_price,
            subtotal

         FROM rfq_quote_items

         WHERE rfq_quote_id = ?

         ORDER BY id'
    );

    $stmt->bind_param('i', $quoteId);
    $stmt->execute();

    $lines = $stmt->get_result()->fetch_all(
        MYSQLI_ASSOC
    );

    $stmt->close();

    if (!$lines) {
        draftReject(
            $conn,
            $started,
            422,
            'Winning quotation has no saved items.'
        );
    }

    $lineTotal = 0.0;

    foreach ($lines as $line) {
        if (
            (float) $line['qty'] <= 0 ||
            (float) $line['unit_price'] < 0
        ) {
            draftReject(
                $conn,
                $started,
                422,
                'Winning quotation contains invalid items.'
            );
        }

        $lineTotal += (float) $line['subtotal'];
    }

    if (abs(round($lineTotal, 2) - $amount) > 0.01) {
        draftReject(
            $conn,
            $started,
            422,
            'Quotation item totals do not match the awarded total.'
        );
    }

    // ========================================
    // 7. CREATE PURCHASE ORDER DRAFT
    // ========================================

    $temporaryNumber = 'TMP-' .
        bin2hex(random_bytes(12));

    $deliveryAddress =
        $warehouseAddresses[$warehouse];

    $stmt = $conn->prepare(
        "INSERT INTO purchase_orders
        (
            po_number,
            rfq_id,
            rfq_quote_id,
            supplier_id,
            created_by,
            order_date,
            total_amount,
            status,
            expected_delivery,
            delivery_address,
            notes_to_supplier
        )
        VALUES
        (
            ?, ?, ?, ?, ?,
            CURDATE(), ?, 'draft', ?, ?, ?
        )"
    );

    $stmt->bind_param(
        'siiiidsss',
        $temporaryNumber,
        $rfqId,
        $quoteId,
        $supplierId,
        $buyerId,
        $amount,
        $expectedDelivery,
        $deliveryAddress,
        $notes
    );

    $stmt->execute();

    $poId = (int) $conn->insert_id;
    $stmt->close();

    // ========================================
    // 8. GENERATE PO NUMBER
    // ========================================

    $dateResult = $conn->query(
        'SELECT
            CURDATE() AS order_date,
            YEAR(CURDATE()) AS year_value'
    );

    $today = $dateResult->fetch_assoc();

    $poNumber =
        'PO-' .
        $today['year_value'] .
        '-' .
        str_pad(
            (string) $poId,
            4,
            '0',
            STR_PAD_LEFT
        );

    $stmt = $conn->prepare(
        'UPDATE purchase_orders
         SET po_number = ?
         WHERE id = ?'
    );

    $stmt->bind_param('si', $poNumber, $poId);
    $stmt->execute();
    $stmt->close();

    // ========================================
    // 9. SAVE PURCHASE ORDER ITEMS
    // ========================================

    // subtotal is a generated MySQL column.
    // Do not insert subtotal manually.

    $stmt = $conn->prepare(
        'INSERT INTO po_items
        (
            po_id,
            supplier_item_id,
            item_name,
            unit,
            qty_ordered,
            unit_price
        )
        VALUES (?, ?, ?, ?, ?, ?)'
    );

    foreach ($lines as $line) {
        $supplierItemId =
            $line['supplier_item_id'] === null
                ? null
                : (int) $line['supplier_item_id'];

        $itemName = (string) $line['item_name'];
        $unit = (string) $line['unit'];
        $qty = (float) $line['qty'];
        $price = (float) $line['unit_price'];

        $stmt->bind_param(
            'iissdd',
            $poId,
            $supplierItemId,
            $itemName,
            $unit,
            $qty,
            $price
        );

        $stmt->execute();
    }

    $stmt->close();

    // ========================================
    // 10. SAVE TRANSACTION
    // ========================================

    $conn->commit();
    $started = false;

    draftReply(201, [
        'success' => true,
        'po_number' => $poNumber,
        'order_date' => $today['order_date'],
        'status' => 'draft',
        'total_amount' => $amount,
        'message' => 'Purchase Order draft saved successfully.'
    ]);

} catch (Throwable $error) {

    if ($started) {
        try {
            $conn->rollback();
        } catch (Throwable $rollbackError) {
            error_log($rollbackError->getMessage());
        }
    }

    error_log(
        'Save PO Draft Error: ' .
        $error->getMessage()
    );

    draftReply(500, [
        'success' => false,
        'message' => 'Unable to save PO draft. Check the PHP error log.'
    ]);
}

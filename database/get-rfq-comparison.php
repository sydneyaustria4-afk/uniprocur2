
<?php

header('Content-Type: application/json; charset=utf-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    require_once __DIR__ . '/uniprocur-session.php';
}

require_once __DIR__ . '/procurement_db_connection.php';

// ========================================
// 1. JSON RESPONSE HELPER
// ========================================

function ret($status, $data)
{
    http_response_code($status);

    echo json_encode(
        $data,
        JSON_UNESCAPED_UNICODE
    );

    exit;
}

try {

    // ========================================
    // 2. VALIDATE REQUEST
    // ========================================

    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        ret(405, [
            'success' => false,
            'message' => 'GET required.'
        ]);
    }

    $number = trim(
        (string) ($_GET['rfq_number'] ?? '')
    );

    if (!$number || strlen($number) > 30) {
        ret(422, [
            'success' => false,
            'message' => 'Invalid RFQ number.'
        ]);
    }

    // ========================================
    // 3. VERIFY BUYER ACCOUNT
    // ========================================

    if (!empty($_SESSION['user_id'])) {

        $id = (int) $_SESSION['user_id'];

        $s = $conn->prepare(
            'SELECT id, role, is_active
             FROM users
             WHERE id = ?
             LIMIT 1'
        );

        $s->bind_param('i', $id);

    } else {

        // Existing demo buyer fallback
        $email = (require __DIR__ . '/buyer-demo-email.php');

        $s = $conn->prepare(
            'SELECT id, role, is_active
             FROM users
             WHERE email = ?
             LIMIT 1'
        );

        $s->bind_param('s', $email);
    }

    $s->execute();

    $buyer = $s->get_result()->fetch_assoc();

    $s->close();

    if (
        !$buyer ||
        strtolower($buyer['role']) !== 'buyer' ||
        !(int) $buyer['is_active']
    ) {
        ret(401, [
            'success' => false,
            'message' => 'Buyer login required.'
        ]);
    }

    $id = (int) $buyer['id'];

    // ========================================
    // 4. GET RFQ INFORMATION
    // ========================================

    // Includes deadline and selected warehouse
    // for the Create Purchase Order page.

    $s = $conn->prepare(
        'SELECT
            r.id,
            r.rfq_number,
            r.status,
            r.created_at,
            r.deadline,
            r.deadline_time,
            r.warehouse_value,
            pr.pr_number,
            pr.needed_by AS requested_delivery_date

         FROM rfqs r

         JOIN purchase_requisitions pr
            ON pr.id = r.pr_id

         WHERE r.rfq_number = ?
           AND r.created_by = ?
           AND pr.created_by = ?

         LIMIT 1'
    );

    $s->bind_param('sii', $number, $id, $id);

    $s->execute();

    $rfq = $s->get_result()->fetch_assoc();

    $s->close();

    if (!$rfq) {
        ret(404, [
            'success' => false,
            'message' => 'RFQ not found.'
        ]);
    }

    $rid = (int) $rfq['id'];

    // ========================================
    // 5. GET SUPPLIER QUOTATIONS
    // ========================================

    $s = $conn->prepare(
        'SELECT
            q.id AS quote_id,
            q.total_amount,
            q.is_winner,

            s.id AS supplier_id,
            s.name,
            s.rating,
            s.lead_time_days,
            s.payment_terms

         FROM rfq_quotes q

         JOIN suppliers s
            ON s.id = q.supplier_id

         WHERE q.rfq_id = ?

         ORDER BY q.id'
    );

    $s->bind_param('i', $rid);

    $s->execute();

    $suppliers = $s->get_result()->fetch_all(
        MYSQLI_ASSOC
    );

    $s->close();

    // ========================================
    // 6. GET SAVED QUOTATION ITEMS
    // ========================================

    $s = $conn->prepare(
        'SELECT
            qi.rfq_quote_id,
            qi.item_name,
            qi.unit,
            qi.qty,
            qi.unit_price,
            qi.subtotal

         FROM rfq_quote_items qi

         JOIN rfq_quotes q
            ON q.id = qi.rfq_quote_id

         WHERE q.rfq_id = ?

         ORDER BY qi.id'
    );

    $s->bind_param('i', $rid);

    $s->execute();

    $items = $s->get_result()->fetch_all(
        MYSQLI_ASSOC
    );

    $s->close();

    // ========================================
    // 7. GROUP ITEMS BY SUPPLIER QUOTATION
    // ========================================

    $map = [];

    foreach ($items as $item) {

        $quoteId = $item['rfq_quote_id'];

        $map[$quoteId][] = $item;
    }

    foreach ($suppliers as &$supplier) {

        $quoteId = $supplier['quote_id'];

        $supplier['items'] = $map[$quoteId] ?? [];
    }

    unset($supplier);

    // ========================================
    // 8. RETURN RFQ AND SUPPLIER DATA
    // ========================================

    ret(200, [
        'success' => true,
        'rfq' => $rfq,
        'suppliers' => $suppliers
    ]);

} catch (Throwable $error) {

    error_log(
        'Get RFQ Comparison Error: ' .
        $error->getMessage()
    );

    ret(500, [
        'success' => false,
        'message' => 'Unable to load Comparison Matrix.'
    ]);
}

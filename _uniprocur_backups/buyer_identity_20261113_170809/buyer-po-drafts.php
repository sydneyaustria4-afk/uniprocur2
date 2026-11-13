
<?php

header('Content-Type: application/json; charset=utf-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    require_once __DIR__ . '/uniprocur-session.php';
}

require_once __DIR__ . '/procurement_db_connection.php';

function poReply(int $code, array $data): void
{
    http_response_code($code);
    echo json_encode(
        $data,
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );
    exit;
}

$inTransaction = false;

try {
    // 1. Verify active Buyer account.
    if (!empty($_SESSION['user_id'])) {
        $uid = (int) $_SESSION['user_id'];

        $userStmt = $conn->prepare(
            'SELECT id, role, is_active
             FROM users WHERE id = ? LIMIT 1'
        );

        $userStmt->bind_param('i', $uid);
    } else {
        // Existing local prototype fallback.
        $demoEmail = 'buyer@gmail.com';

        $userStmt = $conn->prepare(
            'SELECT id, role, is_active
             FROM users WHERE email = ? LIMIT 1'
        );

        $userStmt->bind_param('s', $demoEmail);
    }

    $userStmt->execute();
    $buyer = $userStmt->get_result()->fetch_assoc();
    $userStmt->close();

    if (
        !$buyer ||
        strtolower((string) $buyer['role']) !== 'buyer' ||
        !(int) $buyer['is_active']
    ) {
        poReply(401, [
            'success' => false,
            'message' => 'Active Buyer account required.'
        ]);
    }

    $buyerId = (int) $buyer['id'];

    // ========================================
    // 2. GET SAVED PO DRAFTS
    // ========================================

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {

        $poNumber = trim(
            (string) ($_GET['po_number'] ?? '')
        );

        // Retrieve one PO draft for Continue.
        if ($poNumber !== '') {

            if (strlen($poNumber) > 30) {
                poReply(422, [
                    'success' => false,
                    'message' => 'Invalid PO number.'
                ]);
            }

            $stmt = $conn->prepare(
                "SELECT
                    po.po_number,
                    po.rfq_quote_id,
                    po.status,
                    po.order_date,
                    po.expected_delivery,
                    po.delivery_address,
                    po.notes_to_supplier,
                    r.rfq_number,
                    s.name AS supplier_name

                 FROM purchase_orders po

                 JOIN rfqs r ON r.id = po.rfq_id
                 JOIN suppliers s ON s.id = po.supplier_id

                 WHERE po.po_number = ?
                   AND po.created_by = ?
                   AND r.created_by = ?
                   AND po.status = 'draft'

                 LIMIT 1"
            );

            $stmt->bind_param(
                'sii',
                $poNumber,
                $buyerId,
                $buyerId
            );

            $stmt->execute();
            $draft = $stmt->get_result()->fetch_assoc();
            $stmt->close();

            if (!$draft) {
                poReply(404, [
                    'success' => false,
                    'message' => 'PO draft not found for this buyer.'
                ]);
            }

            poReply(200, [
                'success' => true,
                'draft' => $draft
            ]);
        }

        // Retrieve all PO drafts for Buyer Dashboard.
        $stmt = $conn->prepare(
            "SELECT
                po.po_number,
                po.rfq_quote_id,
                po.status,
                po.order_date,
                po.total_amount,
                r.rfq_number,
                s.name AS supplier_name

             FROM purchase_orders po

             JOIN rfqs r ON r.id = po.rfq_id
             JOIN suppliers s ON s.id = po.supplier_id

             WHERE po.created_by = ?
               AND r.created_by = ?
               AND po.status = 'draft'

             ORDER BY po.created_at DESC, po.id DESC"
        );

        $stmt->bind_param('ii', $buyerId, $buyerId);
        $stmt->execute();

        $drafts = $stmt->get_result()->fetch_all(
            MYSQLI_ASSOC
        );

        $stmt->close();

        poReply(200, [
            'success' => true,
            'drafts' => $drafts
        ]);
    }

    // ========================================
    // 3. CANCEL A PO DRAFT
    // ========================================

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        poReply(405, [
            'success' => false,
            'message' => 'GET or POST required.'
        ]);
    }

    $input = json_decode(
        file_get_contents('php://input'),
        true
    );

    if (!is_array($input)) {
        poReply(400, [
            'success' => false,
            'message' => 'Invalid JSON request.'
        ]);
    }

    $poNumber = trim(
        (string) ($input['po_number'] ?? '')
    );

    $action = trim(
        (string) ($input['action'] ?? '')
    );

    if (
        $poNumber === '' ||
        strlen($poNumber) > 30 ||
        $action !== 'cancel'
    ) {
        poReply(422, [
            'success' => false,
            'message' => 'Invalid PO draft action.'
        ]);
    }

    $conn->begin_transaction();
    $inTransaction = true;

    $stmt = $conn->prepare(
        'SELECT id, status
         FROM purchase_orders
         WHERE po_number = ?
           AND created_by = ?
         LIMIT 1 FOR UPDATE'
    );

    $stmt->bind_param('si', $poNumber, $buyerId);
    $stmt->execute();

    $draft = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$draft || $draft['status'] !== 'draft') {
        $conn->rollback();
        $inTransaction = false;

        poReply(409, [
            'success' => false,
            'message' => 'Only your own draft PO can be cancelled.'
        ]);
    }

    // Keep PO history instead of deleting the record.
    $poId = (int) $draft['id'];

    $stmt = $conn->prepare(
        "UPDATE purchase_orders
         SET status = 'cancelled'
         WHERE id = ?
           AND created_by = ?
           AND status = 'draft'"
    );

    $stmt->bind_param('ii', $poId, $buyerId);
    $stmt->execute();

    $changed = $stmt->affected_rows;
    $stmt->close();

    if ($changed !== 1) {
        throw new RuntimeException(
            'PO cancel update failed.'
        );
    }

    $conn->commit();
    $inTransaction = false;

    poReply(200, [
        'success' => true,
        'message' => "Draft {$poNumber} was cancelled."
    ]);

} catch (Throwable $e) {

    if ($inTransaction) {
        try {
            $conn->rollback();
        } catch (Throwable $ignored) {
        }
    }

    error_log(
        'Buyer PO Draft Error: ' . $e->getMessage()
    );

    poReply(500, [
        'success' => false,
        'message' => 'Unable to process PO draft. Check the PHP log.'
    ]);
}

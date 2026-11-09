<?php
/**
 * UniProcur — Manager view of a submitted Purchase Order.
 * GET ?po_number=PO-2026-0003
 * Returns the real PO, ordered items, supplier contact fields if available,
 * and a CSRF token for a Manager approval decision.
 */
require_once __DIR__ . '/procurement_db_connection.php';
require_once __DIR__ . '/manager-api-common.php';

header('Cache-Control: no-store, max-age=0');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    managerSendJson(405, ['success' => false, 'message' => 'GET required.']);
}

try {
    $manager = requireActiveManager($conn);
    $number = trim((string) ($_GET['po_number'] ?? ''));
    if ($number === '' || strlen($number) > 30 || !preg_match('/\APO-[A-Za-z0-9-]+\z/', $number)) {
        managerSendJson(422, ['success' => false, 'message' => 'Invalid Purchase Order number.']);
    }

    // Supplier fields vary across project database revisions.
    // Use only available known columns, without inventing contact details.
    $supplierColumns = [];
    $colResult = $conn->query('SHOW COLUMNS FROM suppliers');
    while ($column = $colResult->fetch_assoc()) {
        $supplierColumns[(string) $column['Field']] = true;
    }
    $supplierExpr = static function (array $candidates, string $alias) use ($supplierColumns): string {
        foreach ($candidates as $field) {
            if (isset($supplierColumns[$field])) {
                // Candidate field names are hardcoded above, never supplied by a request.
                return "s.`{$field}` AS `{$alias}`";
            }
        }
        return "NULL AS `{$alias}`";
    };
    $contactExpr = $supplierExpr(['contact_person', 'contact_name', 'contact', 'representative'], 'supplier_contact');
    $emailExpr = $supplierExpr(['email', 'contact_email', 'supplier_email', 'email_address'], 'supplier_email');
    $phoneExpr = $supplierExpr(['phone', 'contact_phone', 'mobile', 'phone_number'], 'supplier_phone');
    $locationExpr = $supplierExpr(['city', 'location', 'address'], 'supplier_location');

    $sql = "SELECT po.id, po.po_number, po.rfq_id, po.created_by,
                   po.order_date, po.expected_delivery, po.delivery_address,
                   po.notes_to_supplier, po.total_amount,
                   LOWER(po.status) AS status,
                   DATE_FORMAT(po.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                   s.id AS supplier_id, s.name AS supplier_name,
                   s.payment_terms,
                   {$contactExpr}, {$emailExpr}, {$phoneExpr}, {$locationExpr},
                   r.rfq_number
            FROM purchase_orders AS po
            JOIN suppliers AS s ON s.id = po.supplier_id
            LEFT JOIN rfqs AS r ON r.id = po.rfq_id
            WHERE po.po_number = ?
              AND LOWER(po.status) IN (
                'pending_approval', 'approved', 'rejected',
                'issued', 'partial', 'received', 'closed'
              )
            LIMIT 1";

    $stmt = $conn->prepare($sql);
    $stmt->bind_param('s', $number);
    $stmt->execute();
    $po = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$po) {
        managerSendJson(404, ['success' => false, 'message' => 'Submitted Purchase Order not found.']);
    }

    $poId = (int) $po['id'];
    $itemsStmt = $conn->prepare(
        'SELECT id, item_name, unit, qty_ordered, unit_price, subtotal
         FROM po_items WHERE po_id = ? ORDER BY id ASC'
    );
    $itemsStmt->bind_param('i', $poId);
    $itemsStmt->execute();
    $items = $itemsStmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $itemsStmt->close();

    // Financial amount in purchase_orders is currently pre-VAT in this prototype.
    // Return the stored value unchanged; the page labels VAT as an estimate.
    $po['id'] = $poId;
    $po['total_amount'] = (float) $po['total_amount'];
    foreach ($items as &$item) {
        $item['qty_ordered'] = (float) $item['qty_ordered'];
        $item['unit_price'] = (float) $item['unit_price'];
        $item['subtotal'] = (float) $item['subtotal'];
    }
    unset($item);

    managerSendJson(200, [
        'success' => true,
        'manager' => [
            'id' => (int) $manager['id'],
            'full_name' => $manager['full_name'],
            'email' => $manager['email'],
        ],
        'csrf_token' => managerCsrfToken(),
        'po' => $po,
        'items' => $items,
    ]);
} catch (Throwable $error) {
    error_log('Manager View PO Error: ' . $error->getMessage());
    managerSendJson(500, [
        'success' => false,
        'message' => 'Unable to load Purchase Order. Check the PHP error log.'
    ]);
}

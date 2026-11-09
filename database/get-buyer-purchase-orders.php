<?php
/** GET lists Buyer's active Purchase Orders. GET ?po_number=... gives read-only PO with items. */
require_once __DIR__ . '/buyer-po-common.php';
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    buyerPoJson(405, ['success' => false, 'message' => 'GET required.']);
}
try {
    $buyer = buyerPoIdentity($conn);
    $buyerId = (int) $buyer['id'];
    $number = trim((string) ($_GET['po_number'] ?? ''));
    if ($number !== '' && !preg_match('/\APO-[A-Za-z0-9-]{1,26}\z/', $number)) {
        buyerPoJson(422, ['success' => false, 'message' => 'Invalid PO number.']);
    }

    // Use known supplier columns where available. Never pretend sample details came from MySQL.
    $columns = [];
    $columnResult = $conn->query('SHOW COLUMNS FROM suppliers');
    while ($column = $columnResult->fetch_assoc()) $columns[$column['Field']] = true;
    $field = static function(array $choices, string $alias) use ($columns): string {
        foreach ($choices as $name) {
            if (isset($columns[$name])) return "s.`{$name}` AS `{$alias}`";
        }
        return "NULL AS `{$alias}`";
    };
    $supplierFields = implode(', ', [
        $field(['contact_person', 'contact_name', 'contact', 'representative'], 'supplier_contact'),
        $field(['email', 'contact_email', 'supplier_email', 'email_address'], 'supplier_email'),
        $field(['phone', 'contact_phone', 'mobile', 'phone_number'], 'supplier_phone'),
        $field(['city', 'location', 'address'], 'supplier_location')
    ]);
    $sql = "SELECT po.id, po.po_number, po.rfq_quote_id, po.order_date, po.expected_delivery,
                   po.delivery_address, po.notes_to_supplier, po.total_amount,
                   LOWER(po.status) AS status,
                   DATE_FORMAT(po.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                   s.name AS supplier_name, s.payment_terms, {$supplierFields},
                   r.rfq_number,
                   COALESCE(po_lines.item_summary, '') AS item_summary,
                   COALESCE(po_lines.item_count, 0) AS item_count,
                   COALESCE(po_lines.qty_ordered, 0) AS qty_ordered,
                   COALESCE(po_lines.qty_received, 0) AS qty_received,
                   DATE_FORMAT(COALESCE(t.issued_at, po.created_at), '%Y-%m-%d %H:%i:%s') AS tracking_issued_at,
                   DATE_FORMAT(t.confirmed_at, '%Y-%m-%d %H:%i:%s') AS tracking_confirmed_at,
                   DATE_FORMAT(t.inventory_accepted_at, '%Y-%m-%d %H:%i:%s') AS tracking_inventory_accepted_at,
                   COALESCE(t.accepted_source, '') AS tracking_accept_source,
                   CASE WHEN t.confirmed_at IS NOT NULL THEN
                     GREATEST(0, TIMESTAMPDIFF(SECOND, t.confirmed_at, NOW()))
                   ELSE 0 END AS tracking_elapsed_seconds
            FROM purchase_orders AS po
            JOIN rfqs AS r ON r.id = po.rfq_id
            JOIN purchase_requisitions AS pr ON pr.id = r.pr_id
            JOIN suppliers AS s ON s.id = po.supplier_id
            LEFT JOIN po_demo_tracking AS t ON t.po_id = po.id
            LEFT JOIN (
                SELECT pi.po_id, COUNT(*) AS item_count,
                       GROUP_CONCAT(pi.item_name ORDER BY pi.id SEPARATOR ', ') AS item_summary,
                       SUM(pi.qty_ordered) AS qty_ordered,
                       SUM(COALESCE(pi.qty_received, 0)) AS qty_received
                FROM po_items AS pi GROUP BY pi.po_id
            ) AS po_lines ON po_lines.po_id = po.id
            WHERE po.created_by = ? AND r.created_by = ? AND pr.created_by = ?
              AND LOWER(po.status) NOT IN ('cancelled', 'canceled')";
    if ($number !== '') {
        $stmt = $conn->prepare($sql . ' AND po.po_number = ? LIMIT 1');
        $stmt->bind_param('iiis', $buyerId, $buyerId, $buyerId, $number);
        $stmt->execute();
        $po = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$po) buyerPoJson(404, ['success' => false, 'message' => 'Purchase Order not found for this Buyer.']);
        $id = (int) $po['id'];
        $stmt = $conn->prepare('SELECT item_name, unit, qty_ordered, qty_received, unit_price, subtotal FROM po_items WHERE po_id = ? ORDER BY id');
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $items = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        buyerPoJson(200, ['success' => true, 'buyer' => ['full_name' => $buyer['full_name'], 'email' => $buyer['email']], 'po' => $po, 'items' => $items]);
    }
    $stmt = $conn->prepare($sql . ' ORDER BY po.created_at DESC, po.id DESC');
    $stmt->bind_param('iii', $buyerId, $buyerId, $buyerId);
    $stmt->execute();
    $orders = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    buyerPoJson(200, [
        'success' => true,
        'buyer' => ['full_name' => $buyer['full_name'], 'email' => $buyer['email']],
        'orders' => $orders,
        'count' => count($orders)
    ]);
} catch (Throwable $error) {
    error_log('Get Buyer Purchase Orders: ' . $error->getMessage());
    buyerPoJson(500, ['success' => false, 'message' => 'Unable to load Buyer Purchase Orders. Check PHP and MySQL logs.']);
}

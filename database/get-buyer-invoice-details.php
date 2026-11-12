<?php
/** Read-only invoice details. No receipt verification, posting, or budget deduction. */
require_once __DIR__ . '/buyer-po-common.php';
if ($_SERVER['REQUEST_METHOD'] !== 'GET') buyerPoJson(405, ['success' => false, 'message' => 'GET required.']);
$number = trim((string) ($_GET['invoice_number'] ?? ''));
if (!preg_match('/\A[A-Za-z0-9][A-Za-z0-9._-]{0,63}\z/', $number)) {
    buyerPoJson(422, ['success' => false, 'message' => 'Valid invoice number required.']);
}
try {
    $buyer = buyerPoIdentity($conn);
    $buyerId = (int) $buyer['id'];
    // Optional columns are introspected rather than guessed. All column names
    // are hardcoded choices; no user-provided identifiers enter SQL.
    $columnSet = static function(mysqli $db, string $table): array {
        $set = [];
        $result = $db->query("SHOW COLUMNS FROM `{$table}`");
        while ($col = $result->fetch_assoc()) $set[$col['Field']] = true;
        return $set;
    };
    $pick = static function(array $columns, string $prefix, array $choices, string $alias): string {
        foreach ($choices as $candidate) if (isset($columns[$candidate])) return "{$prefix}.`{$candidate}` AS `{$alias}`";
        return "NULL AS `{$alias}`";
    };
    $invCols = $columnSet($conn, 'invoices');
    $invoiceMeta = implode(', ', [
        $pick($invCols, 'i', ['supplier_invoice_number', 'supplier_invoice_no', 'supplier_inv_no', 'vendor_invoice_number'], 'supplier_invoice_number'),
        $pick($invCols, 'i', ['gr_reference', 'gr_number', 'goods_receipt_number'], 'gr_reference'),
        $pick($invCols, 'i', ['subtotal', 'sub_total'], 'subtotal'),
        $pick($invCols, 'i', ['vat_amount', 'tax_amount', 'vat'], 'vat_amount'),
    ]);
    $sql = "SELECT i.id, i.invoice_number, i.po_id, i.total_amount,
                   LOWER(COALESCE(i.status, 'pending')) AS status,
                   DATE_FORMAT(i.invoice_date, '%Y-%m-%d') AS invoice_date,
                   DATE_FORMAT(i.due_date, '%Y-%m-%d') AS due_date,
                   po.po_number, s.name AS supplier_name, s.payment_terms,
                   {$invoiceMeta}
            FROM invoices i
            LEFT JOIN purchase_orders po ON po.id = i.po_id
            LEFT JOIN suppliers s ON s.id = po.supplier_id
            WHERE i.invoice_number = ? AND i.created_by = ? LIMIT 1";
    $stmt = $conn->prepare($sql);
    if (!$stmt) throw new RuntimeException('Invoice detail query preparation failed.');
    $stmt->bind_param('si', $number, $buyerId);
    $stmt->execute();
    $invoice = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$invoice) buyerPoJson(404, ['success' => false, 'message' => 'Invoice was not found for this Buyer.']);

    $lineCols = $columnSet($conn, 'invoice_items');
    $lineExpressions = implode(', ', [
        $pick($lineCols, 'ii', ['unit', 'unit_of_measure', 'uom'], 'unit'),
        $pick($lineCols, 'ii', ['qty_billed', 'quantity', 'qty', 'qty_invoiced', 'invoiced_quantity'], 'invoice_quantity'),
        $pick($lineCols, 'ii', ['unit_price', 'price_per_unit', 'price'], 'unit_price'),
        $pick($lineCols, 'ii', ['line_total', 'subtotal', 'total_price', 'total_amount'], 'line_total'),
    ]);
    $stmt = $conn->prepare("SELECT ii.item_name, {$lineExpressions} FROM invoice_items ii WHERE ii.invoice_id = ? ORDER BY ii.id");
    $id = (int) $invoice['id'];
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $items = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();

    // PO ordered quantities are independent of Inventory GR quantities.
    $ordered = [];
    if ((int) $invoice['po_id'] > 0) {
        $stmt = $conn->prepare('SELECT item_name, qty_ordered, unit, unit_price FROM po_items WHERE po_id = ? ORDER BY id');
        $poId = (int) $invoice['po_id'];
        $stmt->bind_param('i', $poId);
        $stmt->execute();
        $orderedLines = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $stmt->close();
        foreach ($orderedLines as $row) $ordered[strtolower(trim((string) $row['item_name']))] = $row;
    }
    foreach ($items as &$item) {
        $poLine = $ordered[strtolower(trim((string) $item['item_name']))] ?? null;
        $item['ordered_quantity'] = $poLine['qty_ordered'] ?? null;
        $item['unit'] = $item['unit'] ?: ($poLine['unit'] ?? null);
        $item['unit_price'] = $item['unit_price'] ?? ($poLine['unit_price'] ?? null);
        $item['gr_received_quantity'] = null; // No verified Inventory GR link is present.
    }
    unset($item);
    buyerPoJson(200, [
        'success' => true,
        'buyer' => ['full_name' => $buyer['full_name'], 'email' => $buyer['email']],
        'invoice' => $invoice,
        'items' => $items,
        'three_way_match_verified' => false,
        'finance_posting_enabled' => false,
        'message' => 'Invoice and PO details are read-only. Inventory GR quantities have not been verified.'
    ]);
} catch (Throwable $error) {
    error_log('Get Buyer Invoice Details: ' . $error->getMessage());
    buyerPoJson(500, ['success' => false, 'message' => 'Unable to retrieve invoice details; check PHP and MySQL logs.']);
}

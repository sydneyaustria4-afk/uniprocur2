<?php
/**
 * LOCAL TEST ONLY — read-only verification of Inventory's GR-TEST records.
 * Does not change stock, Inventory requests/deliveries, Procurement POs or invoices.
 * Remove/disable this endpoint before deploying beyond the local XAMPP setup.
 */
require_once __DIR__ . '/buyer-po-common.php';
header('X-Content-Type-Options: nosniff');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    buyerPoJson(405, ['success' => false, 'message' => 'GET required.']);
}
// An extra guard because the Inventory test receipts have NOT been reconciled with real stock.
$host = strtolower(trim((string)($_SERVER['HTTP_HOST'] ?? '')));
$ip = (string)($_SERVER['REMOTE_ADDR'] ?? '');
if (!preg_match('/\A(localhost|127\.0\.0\.1)(:\d+)?\z/', $host)
    || !in_array($ip, ['127.0.0.1', '::1'], true)) {
    buyerPoJson(403, ['success' => false, 'message' => 'Local-only test endpoint.']);
}

$poNumber = strtoupper(trim((string)($_GET['po_number'] ?? '')));
if (!preg_match('/\APO-[A-Z0-9-]{1,26}\z/', $poNumber)) {
    buyerPoJson(422, ['success' => false, 'message' => 'Provide a valid PO number.']);
}

try {
    $buyer = buyerPoIdentity($conn);
    $buyerId = (int)$buyer['id'];

    // Ensure this PO belongs to the same Buyer at all three stages.
    $stmt = $conn->prepare(
        'SELECT po.id, po.po_number, LOWER(po.status) AS po_status,
                pr.pr_number, s.name AS supplier_name,
                COALESCE(l.inventory_request_number, \'\') AS inventory_request_number,
                gr.id AS test_receipt_id, gr.test_gr_number,
                gr.received_date AS test_received_date, gr.created_at AS test_created_at,
                gr.notes AS test_notes
         FROM purchase_orders po
         JOIN rfqs r ON r.id = po.rfq_id
         JOIN purchase_requisitions pr ON pr.id = r.pr_id
         JOIN suppliers s ON s.id = po.supplier_id
         LEFT JOIN inventory_request_pr_links l ON l.pr_id = pr.id
         LEFT JOIN inventory_system_api_test.inventory_po_receipt_tests gr
            ON gr.po_number = po.po_number
         WHERE po.po_number = ?
           AND po.created_by = ? AND r.created_by = ? AND pr.created_by = ?
         LIMIT 1'
    );
    $stmt->bind_param('siii', $poNumber, $buyerId, $buyerId, $buyerId);
    $stmt->execute();
    $po = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    if (!$po) {
        buyerPoJson(404, ['success' => false, 'message' => 'PO not found for active Buyer.']);
    }

    $receiptId = $po['test_receipt_id'] === null ? 0 : (int)$po['test_receipt_id'];
    $poId = (int)$po['id'];
    $stmt = $conn->prepare(
        'SELECT pi.id AS procurement_po_item_id, pi.item_name, pi.unit,
                pi.qty_ordered, COALESCE(pi.qty_received, 0) AS procurement_received,
                ri.delivered_qty AS test_delivered,
                ri.accepted_qty AS test_accepted,
                ri.rejected_qty AS test_rejected
         FROM po_items pi
         LEFT JOIN inventory_system_api_test.inventory_po_receipt_test_items ri
            ON ri.procurement_po_item_id = pi.id AND ri.receipt_test_id = ?
         WHERE pi.po_id = ?
         ORDER BY pi.id ASC'
    );
    $stmt->bind_param('ii', $receiptId, $poId);
    $stmt->execute();
    $lines = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
    $stmt->close();
    foreach ($lines as &$line) {
        $line['procurement_po_item_id'] = (int)$line['procurement_po_item_id'];
        $line['qty_ordered'] = (float)$line['qty_ordered'];
        $line['procurement_received'] = (float)$line['procurement_received'];
        foreach (['test_delivered', 'test_accepted', 'test_rejected'] as $field) {
            $line[$field] = $line[$field] === null ? null : (float)$line[$field];
        }
    }
    unset($line);

    buyerPoJson(200, [
        'success' => true,
        'local_test_only' => true,
        'read_only' => true,
        'purchase_order' => [
            'po_number' => (string)$po['po_number'],
            'po_status' => (string)$po['po_status'],
            'pr_number' => (string)$po['pr_number'],
            'supplier_name' => (string)$po['supplier_name'],
            'inventory_request_number' => (string)$po['inventory_request_number']
        ],
        'test_receipt' => $receiptId ? [
            'test_gr_number' => (string)$po['test_gr_number'],
            'received_date' => (string)$po['test_received_date'],
            'saved_at' => (string)$po['test_created_at'],
            'notes' => (string)$po['test_notes']
        ] : null,
        'items' => $lines,
        'message' => 'Inventory GR-TEST is for verification only. Not a posted warehouse receipt or invoice approval.'
    ]);
} catch (Throwable $error) {
    error_log('Buyer local GR-TEST verification: ' . $error->getMessage());
    buyerPoJson(500, ['success' => false, 'message' => 'Unable to read test receipts. Check Inventory test tables and database privileges.']);
}

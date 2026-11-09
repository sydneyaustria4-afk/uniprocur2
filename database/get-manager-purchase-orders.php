<?php
/**
 * UniProcur — read-only Manager Purchase Orders API.
 * GET: all submitted/non-draft POs; GET ?po_number=...: single PO + items.
 * Reuses the Manager role/session authorization already used by PR pages.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');

require_once __DIR__ . '/procurement_db_connection.php';
require_once __DIR__ . '/manager-api-common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    managerSendJson(405, [
        'success' => false,
        'message' => 'GET required.'
    ]);
}

try {
    $manager = requireActiveManager($conn);

    // PO drafts and cancelled drafts should not enter the Manager queue.
    $visibleStatuses = "('pending_approval','approved','rejected','issued','partial','received','closed')";

    $query = "
        SELECT
            po.id,
            po.po_number,
            po.rfq_quote_id,
            po.order_date,
            po.expected_delivery,
            po.delivery_address,
            po.notes_to_supplier,
            po.total_amount,
            LOWER(po.status) AS status,
            DATE_FORMAT(po.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
            s.name AS supplier_name,
            r.rfq_number,
            COALESCE(items.item_summary, '') AS item_summary,
            COALESCE(items.line_count, 0) AS line_count,
            COALESCE(items.qty_ordered, 0) AS qty_ordered,
            COALESCE(items.qty_received, 0) AS qty_received
        FROM purchase_orders po
        INNER JOIN suppliers s ON s.id = po.supplier_id
        LEFT JOIN rfqs r ON r.id = po.rfq_id
        LEFT JOIN (
            SELECT
                pi.po_id,
                COUNT(*) AS line_count,
                GROUP_CONCAT(pi.item_name ORDER BY pi.id SEPARATOR ', ') AS item_summary,
                SUM(pi.qty_ordered) AS qty_ordered,
                SUM(COALESCE(pi.qty_received, 0)) AS qty_received
            FROM po_items pi
            GROUP BY pi.po_id
        ) items ON items.po_id = po.id
        WHERE LOWER(po.status) IN {$visibleStatuses}
    ";

    $number = trim((string)($_GET['po_number'] ?? ''));
    if ($number !== '') {
        if (strlen($number) > 30) {
            managerSendJson(422, ['success' => false, 'message' => 'Invalid PO number.']);
        }
        $stmt = $conn->prepare($query . ' AND po.po_number = ? LIMIT 1');
        $stmt->bind_param('s', $number);
        $stmt->execute();
        $po = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$po) {
            managerSendJson(404, ['success' => false, 'message' => 'Submitted Purchase Order not found.']);
        }
        $poId = (int)$po['id'];
        $itemsStmt = $conn->prepare(
            'SELECT id, item_name, unit, qty_ordered, qty_received, unit_price, subtotal, delivery_status
             FROM po_items WHERE po_id = ? ORDER BY id ASC'
        );
        $itemsStmt->bind_param('i', $poId);
        $itemsStmt->execute();
        $poItems = $itemsStmt->get_result()->fetch_all(MYSQLI_ASSOC);
        $itemsStmt->close();
        managerSendJson(200, [
            'success' => true,
            'po' => $po,
            'items' => $poItems
        ]);
    }

    $result = $conn->query($query . ' ORDER BY po.created_at DESC, po.id DESC');
    $orders = $result->fetch_all(MYSQLI_ASSOC);
    managerSendJson(200, [
        'success' => true,
        'manager' => [
            'full_name' => $manager['full_name'],
            'email' => $manager['email']
        ],
        'orders' => $orders,
        'count' => count($orders)
    ]);
} catch (Throwable $error) {
    error_log('Manager PO listing error: ' . $error->getMessage());
    managerSendJson(500, [
        'success' => false,
        'message' => 'Unable to load Manager Purchase Orders. Check the Apache/PHP error log.'
    ]);
}

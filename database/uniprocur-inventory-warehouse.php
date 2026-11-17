<?php
/** Inventory-originated PR warehouse selection, stored after verified API fetch.
 * Addresses are deliberately NOT guessed from a warehouse ID or label.
 */
declare(strict_types=1);

function uniInventoryWarehouseForPr(mysqli $db, int $prId): ?array {
    $s = $db->prepare('SELECT inventory_request_number,pr_id,inventory_warehouse_id,warehouse_code,warehouse_name,warehouse_location,recipient_name,recipient_gmail,expected_days,expected_receive_date,original_remarks FROM procurement_inventory_receiving_warehouses WHERE pr_id=? LIMIT 1');
    $s->bind_param('i', $prId);
    $s->execute();
    $row = $s->get_result()->fetch_assoc();
    $s->close();
    return $row ?: null;
}

function uniInventoryWarehouseForRfq(mysqli $db, int $rfqId): ?array {
    $s = $db->prepare('SELECT pr_id FROM rfqs WHERE id=? LIMIT 1');
    $s->bind_param('i', $rfqId);
    $s->execute();
    $row = $s->get_result()->fetch_assoc();
    $s->close();
    return $row ? uniInventoryWarehouseForPr($db, (int)$row['pr_id']) : null;
}

/** Detect older Inventory-linked PRs that predate the warehouse metadata migration. */
function uniInventoryPrHasLink(mysqli $db, int $prId): bool {
    $s=$db->prepare('SELECT 1 FROM inventory_request_pr_links WHERE pr_id=? LIMIT 1');
    $s->bind_param('i',$prId);
    $s->execute();
    $found=$s->get_result()->fetch_assoc()!==null;
    $s->close();
    return $found;
}
function uniInventoryRfqHasLink(mysqli $db, int $rfqId): bool {
    $s=$db->prepare('SELECT pr_id FROM rfqs WHERE id=? LIMIT 1');
    $s->bind_param('i',$rfqId);
    $s->execute();
    $row=$s->get_result()->fetch_assoc();
    $s->close();
    return $row ? uniInventoryPrHasLink($db,(int)$row['pr_id']) : false;
}

/** Exact codes verified from Inventory warehouse records. Never map by numeric ID. */
function uniInventoryWarehouseRfqKey(string $warehouseCode): ?string {
    return match (strtoupper(trim($warehouseCode))) {
        'WH-MAIN' => 'main',
        'WH-SECONDARY' => 'second',
        default => null
    };
}

/** Explicit deployment config: physical address must be confirmed by both teams. */
function uniInventoryWarehouseAddress(string $warehouseCode): ?string {
    $envName = match (strtoupper(trim($warehouseCode))) {
        'WH-MAIN' => 'UNIPROCUR_WH_MAIN_DELIVERY_ADDRESS',
        'WH-SECONDARY' => 'UNIPROCUR_WH_SECONDARY_DELIVERY_ADDRESS',
        default => null
    };
    if ($envName === null) return null;
    $address = trim((string)(getenv($envName) ?: ($_SERVER[$envName] ?? '')));
    return $address !== '' && strlen($address) <= 255 && !preg_match('/[\r\n]/', $address)
        ? $address : null;
}

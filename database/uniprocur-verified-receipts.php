<?php
/** ITPROFEL v1: trusted Procurement-side snapshots of authenticated Inventory DRs. */
declare(strict_types=1);
function uniVerifiedReceiptsReady(mysqli $db):bool {
    $result=$db->query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN ('procurement_inventory_receipts','procurement_inventory_receipt_items')");
    return (int)($result->fetch_assoc()['n']??0)===2;
}

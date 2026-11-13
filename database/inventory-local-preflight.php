<?php
/**
 * UNIPROCUR_PORTABLE_INVENTORY_V1
 * Safe, read-only availability check for the legacy LOCAL Inventory database.
 * This does NOT connect to remote Inventory, accept a Goods Receipt, change
 * Procurement order statuses, or allow Finance posting.
 */
declare(strict_types=1);

if (!function_exists('uniLocalInventoryReady')) {
    function uniLocalInventoryReady(mysqli $db, array $requiredTables): bool
    {
        if (!$requiredTables) {
            return false;
        }
        $needed = array_fill_keys(array_map('strtolower', $requiredTables), true);
        try {
            $stmt = $db->prepare(
                'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?'
            );
            $schema = 'inventory_system_api_test';
            $stmt->bind_param('s', $schema);
            $stmt->execute();
            $result = $stmt->get_result();
            while ($row = $result->fetch_assoc()) {
                unset($needed[strtolower((string) $row['TABLE_NAME'])]);
            }
            $stmt->close();
            return count($needed) === 0;
        } catch (Throwable $error) {
            error_log('UniProcur local Inventory preflight: ' . $error->getMessage());
            return false;
        }
    }
}

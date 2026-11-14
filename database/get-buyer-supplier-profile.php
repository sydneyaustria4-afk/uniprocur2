<?php
/**
 * Read-only Buyer supplier contact list.
 * Matches the precedence used by manager-view-purchase-order.js:
 * MySQL suppliers fields first, Manager PO sample fallback second.
 * Does NOT modify any Manager file or any database records.
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');

if (session_status() !== PHP_SESSION_ACTIVE) {
    require_once __DIR__ . '/uniprocur-session.php';
}
require_once __DIR__ . '/procurement_db_connection.php';

function supplierContactReply(int $status, array $data): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    supplierContactReply(405, ['success' => false, 'message' => 'GET required.']);
}

// Never grant the old localhost demo identity access to contact information.
$userId = (int) ($_SESSION['user_id'] ?? 0);
if ($userId <= 0) {
    supplierContactReply(401, ['success' => false, 'message' => 'Please log in as Buyer.']);
}

try {
    $buyerStmt = $conn->prepare("SELECT id FROM users WHERE id = ? AND LOWER(role) = 'buyer' AND is_active = 1 LIMIT 1");
    $buyerStmt->bind_param('i', $userId);
    $buyerStmt->execute();
    $buyer = $buyerStmt->get_result()->fetch_assoc();
    $buyerStmt->close();
    if (!$buyer) {
        supplierContactReply(403, ['success' => false, 'message' => 'Buyer access required.']);
    }

    // These are the existing fallback entries in the Manager PO JavaScript.
    // They are DEMO contacts, not verified addresses/numbers.
    $fallbacks = [
        'marikina' => ['name' => 'Marikina Hide & Leather Co.', 'contact' => 'Ramon Villanueva', 'email' => 'ramon@marikinahide.ph', 'phone' => '+63-2-8123-4567'],
        'cordillera' => ['name' => 'Cordillera Leather Works', 'contact' => 'Elena Bautista', 'email' => 'elena@cordilleraleather.ph', 'phone' => '+63-2-8123-4568'],
        'synthhide' => ['name' => 'SynthHide Textile Corp.', 'contact' => 'Michael Tan', 'email' => 'sales@synthhide.ph', 'phone' => '+63-2-8123-4569'],
        'soletech' => ['name' => 'SoleTech Rubber Manufacturing', 'contact' => 'Mario Lim', 'email' => 'mario@soletech.ph', 'phone' => '+63-2-8123-4570'],
        'metalcraft' => ['name' => 'MetalCraft Shoe Hardware', 'contact' => 'Victor Reyes', 'email' => 'victor@metalcraft.ph', 'phone' => '+63-2-8123-4571'],
        'ecobox' => ['name' => 'Ecobox Packaging Solutions', 'contact' => 'Rodel Mercado', 'email' => 'rodel@ecobox.ph', 'phone' => '+63-2-8123-4572'],
    ];

    $profiles = [];
    foreach ($fallbacks as $key => $record) {
        $profiles[$key] = $record;
        $profiles[$key]['source'] = ['contact' => 'manager_sample', 'email' => 'manager_sample', 'phone' => 'manager_sample'];
    }

    // Detect the real columns; different UniProcur DB revisions use different names.
    $available = [];
    $cols = $conn->query('SHOW COLUMNS FROM suppliers');
    while ($column = $cols->fetch_assoc()) {
        $available[(string) $column['Field']] = true;
    }
    $expr = static function(array $candidates) use ($available): string {
        foreach ($candidates as $column) {
            if (isset($available[$column])) return '`' . $column . '`';
        }
        return 'NULL';
    };

    $sql = 'SELECT `name`, ' .
        $expr(['contact_person', 'contact_name', 'contact', 'representative']) . ' AS supplier_contact, ' .
        $expr(['email', 'contact_email', 'supplier_email', 'email_address']) . ' AS supplier_email, ' .
        $expr(['phone', 'contact_phone', 'mobile', 'phone_number']) . ' AS supplier_phone ' .
        'FROM `suppliers`';
    $rows = $conn->query($sql);
    while ($row = $rows->fetch_assoc()) {
        $name = strtolower(trim((string)($row['name'] ?? '')));
        foreach (array_keys($fallbacks) as $key) {
            if (strpos($name, $key) === false) continue;
            foreach (['contact' => 'supplier_contact', 'email' => 'supplier_email', 'phone' => 'supplier_phone'] as $field => $column) {
                $value = trim((string)($row[$column] ?? ''));
                if ($value !== '' && !in_array(strtolower($value), ['not provided', 'n/a', 'null', '—', '-'], true)) {
                    $profiles[$key][$field] = $value;
                    $profiles[$key]['source'][$field] = 'database';
                }
            }
            break;
        }
    }

    supplierContactReply(200, ['success' => true, 'suppliers' => $profiles]);
} catch (Throwable $error) {
    error_log('Buyer Supplier Contacts API: ' . $error->getMessage());
    supplierContactReply(500, ['success' => false, 'message' => 'Unable to load supplier contacts. Check PHP error log.']);
}

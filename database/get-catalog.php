<?php
/**
 * UniProcur ERP - Catalog API Endpoint
 * Fetches supplier catalog items dynamically from MySQL database (uniprocur_erp)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');

require_once __DIR__ . '/db.php';

// Known supplier slug to ID mapping and catalog HTML filenames
$supplierSlugMap = [
    'marikina'   => ['id' => 2001, 'file' => 'catalog.html',            'slug' => 'marikina'],
    'cordillera' => ['id' => 2002, 'file' => 'cordillera-catalog.html', 'slug' => 'cordillera'],
    'synthhide'  => ['id' => 2003, 'file' => 'synthhide-catalog.html',  'slug' => 'synthhide'],
    'soletech'   => ['id' => 2004, 'file' => 'soletech-catalog.html',    'slug' => 'soletech'],
    'metalcraft' => ['id' => 2005, 'file' => 'metalcraft-catalog.html',  'slug' => 'metalcraft'],
    'ecobox'     => ['id' => 2006, 'file' => 'ecobox-catalog.html',      'slug' => 'ecobox']
];

// Product asset mappings (images and color swatches)
$productAssets = [
    3001 => ['image' => 'full-grain-leather.png',         'display_name' => 'Full-Grain Leather',         'swatches' => [1, 2, 3],                  'cordillera' => 'cordillera.svg'],
    3002 => ['image' => 'suede-leather.png',              'display_name' => 'Suede Leather',              'swatches' => [4, 5, 6],                  'cordillera' => 'cordillera (1).svg'],
    3003 => ['image' => 'nubuck-leather.png',             'display_name' => 'Nubuck Leather',             'swatches' => [7, 8, 9, 10, 11, 12],      'cordillera' => 'cordillera (2).svg'],
    3004 => ['image' => 'mesh-fabric.png',                'display_name' => 'Mesh Fabric',                'swatches' => [13, 14, 15],               'cordillera' => 'cordillera (3).svg'],
    3005 => ['image' => 'canvas-fabric.png',              'display_name' => 'Canvas Fabric',              'swatches' => [16, 17, 18, 19, 20],      'cordillera' => 'cordillera (4).svg'],
    3006 => ['image' => 'pu-leather.png',                 'display_name' => 'PU Leather',                 'swatches' => [21, 22, 23, 24, 25],      'cordillera' => 'cordillera (5).svg'],
    3007 => ['image' => 'vulcanized-rubber-outsoles.png', 'display_name' => 'Vulcanized Rubber Outsoles', 'swatches' => [1, 2, 3],                  'cordillera' => 'cordillera (6).svg'],
    3008 => ['image' => 'eva-foam-sheets.png',            'display_name' => 'EVA Foam Sheets',            'swatches' => [],                         'cordillera' => 'cordillera (7).svg'],
    3009 => ['image' => 'tpr-outsoles.png',               'display_name' => 'TPR Outsoles',               'swatches' => [],                         'cordillera' => 'cordillera (8).svg'],
    3010 => ['image' => 'metal-eyelets.png',              'display_name' => 'Metal Eyelets',              'swatches' => [26, 27, 28],               'cordillera' => 'cordillera (9).svg'],
    3011 => ['image' => 'metal-buckles.png',              'display_name' => 'Metal Buckles',              'swatches' => [16, 17, 18, 19, 20],      'cordillera' => 'cordillera (10).svg'],
    3012 => ['image' => 'zippers.png',                    'display_name' => 'Zippers',                    'swatches' => [],                         'cordillera' => 'cordillera (11).svg'],
    3013 => ['image' => 'shoe-boxes.png',                 'display_name' => 'Shoe Boxes (Eco Friendly)',  'swatches' => [],                         'cordillera' => 'cordillera (12).svg'],
    3014 => ['image' => 'tissue-paper-rolls.png',         'display_name' => 'Tissue Paper Rolls',         'swatches' => [],                         'cordillera' => 'cordillera (13).svg'],
    3015 => ['image' => 'packaging-tape.png',             'display_name' => 'Packaging Tape',             'swatches' => [],                         'cordillera' => 'cordillera (14).svg'],
    3016 => ['image' => 'rubber-cement.png',              'display_name' => 'Rubber Cement',              'swatches' => [],                         'cordillera' => 'cordillera (15).svg']
];

try {
    // 1. Determine requested supplier
    $requestedSupplier = isset($_GET['supplier']) ? trim(strtolower($_GET['supplier'])) : '';
    $requestedId = isset($_GET['supplier_id']) ? intval($_GET['supplier_id']) : 0;

    $supplierId = null;
    $supplierSlug = 'marikina';

    if ($requestedId > 0) {
        $supplierId = $requestedId;
        foreach ($supplierSlugMap as $slug => $meta) {
            if ($meta['id'] === $requestedId) {
                $supplierSlug = $slug;
                break;
            }
        }
    } elseif (!empty($requestedSupplier)) {
        if (isset($supplierSlugMap[$requestedSupplier])) {
            $supplierSlug = $requestedSupplier;
            $supplierId = $supplierSlugMap[$requestedSupplier]['id'];
        } else {
            // Check supplier code or name search in DB
            $stmt = $pdo->prepare("SELECT supplier_id FROM suppliers WHERE LOWER(supplier_code) = :code OR LOWER(supplier_name) LIKE :name LIMIT 1");
            $stmt->execute([
                ':code' => $requestedSupplier,
                ':name' => '%' . $requestedSupplier . '%'
            ]);
            $supplierId = $stmt->fetchColumn();
        }
    }

    if (!$supplierId) {
        $supplierId = 2001; // Default to Marikina
        $supplierSlug = 'marikina';
    }

    // 2. Fetch current supplier info
    $stmt = $pdo->prepare("SELECT supplier_id, supplier_code, supplier_name, description, location, contact_person, phone, email, rating, moq, lead_time_days, tags, status FROM suppliers WHERE supplier_id = :id LIMIT 1");
    $stmt->execute([':id' => $supplierId]);
    $supplier = $stmt->fetch();

    if (!$supplier) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'Supplier not found']);
        exit;
    }

    // 3. Fetch products with supplier-specific prices from supplier_items
    $stmt = $pdo->prepare("
        SELECT 
            i.item_id,
            i.item_code,
            i.item_name,
            i.category,
            i.uom,
            i.default_price,
            si.supplier_item_id,
            si.unit_price,
            si.is_available
        FROM items i
        LEFT JOIN supplier_items si 
            ON si.item_id = i.item_id AND si.supplier_id = :supplier_id
        WHERE i.is_active = 1
        ORDER BY i.item_id ASC
    ");
    $stmt->execute([':supplier_id' => $supplierId]);
    $rawItems = $stmt->fetchAll();

    $products = [];
    foreach ($rawItems as $item) {
        $id = intval($item['item_id']);
        $asset = $productAssets[$id] ?? [
            'image' => 'full-grain-leather.png',
            'display_name' => $item['item_name'],
            'swatches' => []
        ];

        // Use clean product catalog image
        $imageName = $asset['image'];

        $effectivePrice = $item['unit_price'] !== null 
            ? floatval($item['unit_price']) 
            : floatval($item['default_price']);

        $products[] = [
            'item_id'       => $id,
            'item_code'     => $item['item_code'],
            'name'          => $asset['display_name'] ?? $item['item_name'],
            'db_item_name'  => $item['item_name'],
            'category'      => $item['category'],
            'uom'           => $item['uom'],
            'price'         => $effectivePrice,
            'default_price' => floatval($item['default_price']),
            'is_available'  => $item['is_available'] === null ? true : (bool)$item['is_available'],
            'image'         => $imageName,
            'swatches'      => $asset['swatches'] ?? []
        ];
    }

    // 4. Fetch all suppliers for the switcher dropdown
    $suppliersStmt = $pdo->query("SELECT supplier_id, supplier_code, supplier_name FROM suppliers WHERE status = 'Active' ORDER BY supplier_id ASC");
    $allSuppliers = [];
    while ($s = $suppliersStmt->fetch()) {
        $sid = intval($s['supplier_id']);
        $foundSlug = null;
        $foundFile = 'catalog.html';
        foreach ($supplierSlugMap as $slug => $meta) {
            if ($meta['id'] === $sid) {
                $foundSlug = $slug;
                $foundFile = $meta['file'];
                break;
            }
        }
        $allSuppliers[] = [
            'id'           => $sid,
            'code'         => $s['supplier_code'],
            'name'         => $s['supplier_name'],
            'slug'         => $foundSlug ?? 'marikina',
            'catalog_file' => $foundFile
        ];
    }

    echo json_encode([
        'success'       => true,
        'supplier'      => [
            'id'           => intval($supplier['supplier_id']),
            'code'         => $supplier['supplier_code'],
            'name'         => $supplier['supplier_name'],
            'slug'         => $supplierSlug,
            'catalog_file' => $supplierSlugMap[$supplierSlug]['file'] ?? 'catalog.html',
            'description'  => $supplier['description'],
            'location'     => $supplier['location'],
            'contact_person' => $supplier['contact_person'],
            'rating'       => $supplier['rating'],
            'moq'          => $supplier['moq'],
            'lead_time_days' => $supplier['lead_time_days']
        ],
        'products'      => $products,
        'all_suppliers' => $allSuppliers
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'Server Error: ' . $e->getMessage()
    ]);
}

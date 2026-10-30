
<?php

require_once __DIR__ . "/procurement_db_connection.php";

$result = $conn->query("SELECT DATABASE() AS db_name");
$row = $result->fetch_assoc();

$tables = $conn->query("SHOW TABLES");

echo "<h2>UniProcur Database Connected!</h2>";

echo "Database: " .
    htmlspecialchars($row["db_name"]) . "<br>";

echo "Tables found: " . $tables->num_rows;

?>

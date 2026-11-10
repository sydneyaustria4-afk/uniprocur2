<?php
/**
 * UniProcur audit writer. Call inside the SAME MySQL transaction as the action.
 * Deploy the procurement_audit_logs SQL migration first. A missing table fails
 * the transaction instead of silently performing an unlogged action.
 */
function procurementAuditLog(
    mysqli $conn,
    array $actor,
    string $module,
    string $action,
    string $reference,
    string $description
): void {
    $userId = (int) ($actor['id'] ?? 0);
    $name = trim((string) ($actor['full_name'] ?? ''));
    $role = strtolower(trim((string) ($actor['role'] ?? '')));
    if ($userId < 1 || $name === '' || !in_array($role, ['buyer', 'manager'], true)) {
        throw new RuntimeException('Unable to establish a verified audit actor.');
    }

    // Only source REMOTE_ADDR, not forgeable HTTP forwarding headers.
    $remote = trim((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
    $ip = filter_var($remote, FILTER_VALIDATE_IP) ? $remote : null;
    $timestamp = (new DateTimeImmutable('now', new DateTimeZone('Asia/Manila')))
        ->format('Y-m-d H:i:s.u');
    $module = substr(trim($module), 0, 64);
    $action = substr(trim($action), 0, 40);
    $reference = substr(trim($reference), 0, 70);
    $description = substr(trim($description), 0, 500);

    $stmt = $conn->prepare(
        'INSERT INTO procurement_audit_logs
        (event_time, actor_user_id, actor_name, actor_role, module_name,
         action_name, reference_number, description, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    if (!$stmt) throw new RuntimeException('Audit log insert could not be prepared.');
    $stmt->bind_param(
        'sisssssss',
        $timestamp, $userId, $name, $role, $module, $action, $reference, $description, $ip
    );
    $stmt->execute();
    $stmt->close();
}

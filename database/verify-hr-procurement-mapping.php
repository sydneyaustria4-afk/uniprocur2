<?php
/** CLI only: verify or safely align ONE Buyer and ONE Manager account.
 * This does not change any Procurement user IDs, transactions, or HR passwords.
 * --apply requires an independent database backup first.
 */
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$apply = in_array('--apply', $argv, true);
require_once __DIR__ . '/procurement_db_connection.php';

try {
    $rows = $conn->query(
        "SELECT a.employee_id, LOWER(a.username) AS email, LOWER(a.position) AS role
           FROM finance_hr.accounts a
           JOIN finance_hr.employees e ON e.employee_id=a.employee_id
           JOIN finance_hr.departments d ON d.department_id=e.department
          WHERE LOWER(d.department_name)='procurement'
            AND LOWER(a.position) IN ('buyer','manager')
            AND LOWER(a.status)='active'
            AND LOWER(e.employment_status)='active'"
    )->fetch_all(MYSQLI_ASSOC);
    $staff = $conn->query(
        "SELECT id,hr_employee_id,LOWER(email) AS email,LOWER(role) AS role,is_active
           FROM users WHERE LOWER(role) IN ('buyer','manager')"
    )->fetch_all(MYSQLI_ASSOC);
    $plan = [];
    foreach (['buyer','manager'] as $role) {
        $hr = array_values(array_filter($rows, fn($r) => $r['role'] === $role));
        $p = array_values(array_filter($staff, fn($r) => $r['role'] === $role && (int)$r['is_active'] === 1));
        if (count($hr) !== 1 || count($p) !== 1) {
            throw new RuntimeException("Ambiguous $role: expected exactly one active HR account and one active Procurement account. Manual review required.");
        }
        $hr=$hr[0]; $p=$p[0];
        $dupes = $conn->prepare('SELECT COUNT(*) FROM users WHERE id<>? AND (LOWER(email)=? OR hr_employee_id=?)');
        $id=(int)$p['id']; $employee=(int)$hr['employee_id']; $email=$hr['email'];
        $dupes->bind_param('isi',$id,$email,$employee);
        $dupes->execute(); $n=(int)$dupes->get_result()->fetch_row()[0]; $dupes->close();
        if ($n !== 0) throw new RuntimeException("$role HR mapping conflicts with another Procurement user. No changes made.");
        $plan[] = ['role'=>$role,'id'=>$id,'current_email'=>$p['email'], 'current_employee_id'=>(int)$p['hr_employee_id'], 'email'=>$email,'employee_id'=>$employee,
            'change'=>$p['email'] !== $email || (int)$p['hr_employee_id'] !== $employee];
    }
    foreach($plan as $p) echo strtoupper($p['role'])." Procurement ID {$p['id']}: {$p['current_email']} / HR {$p['current_employee_id']} -> {$p['email']} / HR {$p['employee_id']}".($p['change']?' [UPDATE NEEDED]':' [OK]')."\n";
    $changes=count(array_filter($plan,fn($x)=>$x['change']));
    if(!$apply){ echo $changes ? "Mapping update available; run installer mapping option after backup.\n" : "All account mappings already match.\n"; exit(0); }
    if (!$changes) { echo "No database changes required.\n"; exit(0); }
    $conn->begin_transaction();
    try {
        $stmt=$conn->prepare('UPDATE users SET hr_employee_id=?, email=? WHERE id=? AND role=? AND is_active=1');
        foreach($plan as $p) {
            if(!$p['change'])continue;
            $stmt->bind_param('isis',$p['employee_id'],$p['email'],$p['id'],$p['role']);
            $stmt->execute();
            if($stmt->affected_rows!==1)throw new RuntimeException('Unexpected row count. Transaction rolled back.');
        }
        $stmt->close(); $conn->commit();
        echo "SUCCESS: uniquely matched HR accounts; Procurement IDs and transaction ownership preserved.\n";
    }catch(Throwable $e){$conn->rollback();throw $e;}
} catch(Throwable $e) {
    fwrite(STDERR, 'STOP: ' . $e->getMessage() . "\n");
    exit(1);
}

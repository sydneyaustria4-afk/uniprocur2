<?php
declare(strict_types=1);
require_once __DIR__ . '/../database/uniprocur-session.php';
header('Cache-Control: no-store, max-age=0');

// Redirect already-signed-in users to their own dashboard.
if (!empty($_SESSION['user_id'])) {
    require_once __DIR__ . '/../database/procurement_db_connection.php';
    $id = (int) $_SESSION['user_id'];
    $stmt = $conn->prepare('SELECT role, is_active FROM users WHERE id = ? LIMIT 1');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $account = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if ($account && (int)$account['is_active'] === 1) {
        $role = strtolower((string)$account['role']);
        if ($role === 'buyer' || $role === 'manager') {
            header('Location: ../' . ($role === 'buyer' ? 'buyerdashboard/buyer-dashboard.html' : 'managerdashboard/manager-dashboard.html'), true, 302);
            exit;
        }
    }
    unset($_SESSION['user_id'], $_SESSION['role'], $_SESSION['hr_employee_id'], $_SESSION['hr_account_id']);
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>UniProcur | Sign in</title>
	<link rel="stylesheet" href="auth.css">
</head>
<body>
	<main class="auth-shell" id="authShell">
		<section class="auth-card" aria-live="polite">
			<div class="auth-art" aria-hidden="true">
				<div class="art-copy" id="artCopyLogin"><span>Welcome to</span><span>the company!</span><strong>Login to access Procurement!</strong></div>
			</div>
			<div class="auth-content">
				<form id="loginForm" class="auth-form" novalidate>
					<h1>Login</h1><p class="auth-subtitle">Sign in with your HR account</p><hr><h2>Sign into UniProcur</h2>
					<label for="loginUser">Enter your email address</label><input type="email" id="loginUser" name="username" placeholder="Email" autocomplete="username" required><span class="error-text" role="alert"></span>
					<label for="loginPass">Password</label>
					<div class="password-field">
						<input type="password" id="loginPass" name="password" placeholder="Password" autocomplete="current-password" required>
						<button type="button" class="toggle-password" id="toggleLoginPass" aria-label="Show password" aria-pressed="false">
							<svg class="eye-closed" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>
							<svg class="eye-open" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"></path><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
						</button>
					</div>
					<span class="error-text" role="alert"></span>
					<button type="submit" class="auth-button">LOGIN</button>
				</form>
			</div>
		</section>
	</main>
	<script src="auth.js?v=uniprocur-hr-1" defer></script>
</body>
</html>

<?php
// Disable the old anonymous localhost Buyer account after HR login is working.
http_response_code(401);
header('Content-Type: application/json; charset=utf-8');
echo json_encode(['success' => false, 'message' => 'Buyer sign-in required.']);
exit;

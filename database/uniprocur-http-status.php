<?php
/** Send an accurate HTTP 419 response without changing normal HTTP codes. */
declare(strict_types=1);

function uniprocurHttpCode(int $code): void
{
    if ($code === 419) {
        header('HTTP/1.1 419 Session Verification Expired', true, 419);
        return;
    }
    http_response_code($code);
}

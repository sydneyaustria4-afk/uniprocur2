<?php
/** UNIPROCUR_ITPROFEL_PRIVATE_PATH_V1: Resolve Finance API key OUTSIDE Apache htdocs. */
declare(strict_types=1);
function uniprocurFinanceTokenFile(): string {
    $configured = getenv('UNIPROCUR_FINANCE_TOKEN_FILE');
    if (is_string($configured) && trim($configured) !== '') return trim($configured);
    $documentRoot = (string)($_SERVER['DOCUMENT_ROOT'] ?? '');
    $resolved = $documentRoot !== '' ? realpath($documentRoot) : false;
    if (!is_string($resolved) || $resolved === '') {
        throw new RuntimeException('Configure UNIPROCUR_FINANCE_TOKEN_FILE to an absolute path outside htdocs.');
    }
    return dirname($resolved) . DIRECTORY_SEPARATOR . 'uniprocur_secrets' . DIRECTORY_SEPARATOR . 'finance_integration_token.txt';
}

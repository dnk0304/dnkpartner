$maxAttempts = 12
$waitMinutes = 30
$attempt = 0

Write-Host "Starting retry loop - max $maxAttempts attempts, every $waitMinutes min"
Write-Host "Quota expected to reset around 08:00 Canarian"
Write-Host "Started: $(Get-Date -Format 'HH:mm')"

while ($attempt -lt $maxAttempts) {
    $attempt++
    Write-Host ""
    Write-Host "Attempt $attempt at $(Get-Date -Format 'HH:mm')..."
    
    $output = & node generate-clips.mjs 2>&1
    $exitCode = $LASTEXITCODE
    
    Write-Host $output
    
    if ($exitCode -eq 0) {
        Write-Host "COMPLETE - All clips generated."
        exit 0
    }
    
    if ($exitCode -eq 1) {
        Write-Host "Non-rate-limit failure (exit 1). Stopping."
        exit 1
    }
    
    Write-Host "Rate limit still active. Waiting $waitMinutes minutes..."
    Start-Sleep -Seconds ($waitMinutes * 60)
}

Write-Host "Max attempts reached without success."
exit 1

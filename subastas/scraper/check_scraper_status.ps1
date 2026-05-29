# Check Province Update Scraper Status

Write-Host "`n=== Province Update Scraper Status ===" -ForegroundColor Cyan

# Check running processes
$pythonProcesses = Get-Process python -ErrorAction SilentlyContinue
Write-Host "`nRunning Scrapers: $($pythonProcesses.Count)" -ForegroundColor Green

if ($pythonProcesses.Count -gt 0) {
    $pythonProcesses | ForEach-Object {
        $runtime = (Get-Date) - $_.StartTime
        Write-Host "  PID $($_.Id) - CPU: $([math]::Round($_.CPU,2))s - Memory: $([math]::Round($_.WorkingSet64/1MB,2))MB - Runtime: $($runtime.ToString('hh\:mm\:ss'))"
    }
}

# Check progress files
Write-Host "`n=== Progress by Date Range ===" -ForegroundColor Cyan

$progressFiles = Get-ChildItem -Path . -Filter "province_update_*_progress.json" | Sort-Object Name

foreach ($file in $progressFiles) {
    $progress = Get-Content $file.FullName | ConvertFrom-Json
    $dateRanges = @{
        1 = "2015-2017"
        2 = "2018-2019"
        3 = "2020-2021"
        4 = "2022-2023"
        5 = "2024-2025"
        6 = "2026-Now"
    }
    
    $range = $dateRanges[$progress.scraper_id]
    $percentComplete = [math]::Round(($progress.completed_batches.Count / $progress.total_batches) * 100, 1)
    
    Write-Host "`nScraper $($progress.scraper_id) ($range):" -ForegroundColor Yellow
    Write-Host "  Batches: $($progress.completed_batches.Count)/$($progress.total_batches) ($percentComplete%)"
    Write-Host "  Updated: $($progress.total_updated) auctions"
    Write-Host "  Failed: $($progress.total_failed) auctions"
    Write-Host "  Last Active: $($progress.last_updated)"
}

Write-Host "`n=== Database Statistics ===" -ForegroundColor Cyan
Write-Host "(Run: node scripts/check-scraper-progress.js for detailed stats)`n"

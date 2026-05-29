# PowerShell script to launch 6 parallel province update scrapers

Write-Host "======================================================================"  -ForegroundColor Cyan
Write-Host "  BOE Province/Municipality Update - Parallel Scrapers" -ForegroundColor Cyan
Write-Host "======================================================================"  -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting 6 scrapers to update auction location data..." -ForegroundColor Yellow
Write-Host "Each scraper processes 15-day batches"
Write-Host "Estimated time: 2-3 hours with all 6 running"
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$scraperScript = Join-Path $scriptDir "scrapers\province_update_scraper.py"

# Define scraper configurations
$scrapers = @(
    @{Id=1; Start="2015-01-01"; End="2017-12-31"; Desc="2015-2017"},
    @{Id=2; Start="2018-01-01"; End="2019-12-31"; Desc="2018-2019"},
    @{Id=3; Start="2020-01-01"; End="2021-12-31"; Desc="2020-2021"},
    @{Id=4; Start="2022-01-01"; End="2023-12-31"; Desc="2022-2023"},
    @{Id=5; Start="2024-01-01"; End="2025-12-31"; Desc="2024-2025"},
    @{Id=6; Start="2026-01-01"; End=(Get-Date -Format "yyyy-MM-dd"); Desc="2026-Now"}
)

$processes = @()

foreach ($scraper in $scrapers) {
    $id = $scraper.Id
    $start = $scraper.Start
    $end = $scraper.End
    $desc = $scraper.Desc
    
    Write-Host "🚀 Launching Scraper $id ($desc): $start to $end" -ForegroundColor Green
    
    # Start process in new window
    $process = Start-Process -FilePath "python" `
        -ArgumentList "$scraperScript --id $id --start $start --end $end" `
        -WindowStyle Normal `
        -PassThru `
        -WorkingDirectory $scriptDir
    
    $processes += $process
}

Write-Host ""
Write-Host "======================================================================"  -ForegroundColor Cyan
Write-Host "All 6 scrapers launched in separate windows!" -ForegroundColor Green
Write-Host "======================================================================"  -ForegroundColor Cyan
Write-Host ""
Write-Host "Monitor progress in the scraper directory:" -ForegroundColor Yellow

foreach ($scraper in $scrapers) {
    $id = $scraper.Id
    $desc = $scraper.Desc
    $date = Get-Date -Format "yyyyMMdd"
    Write-Host "  Scraper $id ($desc):" -ForegroundColor White
    Write-Host "    Log: scraper/province_update_${id}_${date}.log"
    Write-Host "    Progress: scraper/province_update_${id}_progress.json"
}

Write-Host ""
Write-Host "Press Ctrl+C to stop monitoring (scrapers will continue running)" -ForegroundColor Yellow
Write-Host "Close individual windows to stop specific scrapers" -ForegroundColor Yellow
Write-Host ""

# Wait for user to press a key
Write-Host "Press any key to exit this monitor window..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

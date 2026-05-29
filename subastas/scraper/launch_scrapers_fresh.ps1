Write-Host "`n=== Launching Province Update Scrapers (Fresh Start) ===" -ForegroundColor Cyan
Write-Host "Scraper 6 will restart from the beginning with fixed extraction logic`n" -ForegroundColor Yellow

$scrapers = @(
    @{id=1; start="2015-01-01"; end="2017-12-31"; range="2015-2017"}
    @{id=2; start="2018-01-01"; end="2019-12-31"; range="2018-2019"}
    @{id=3; start="2020-01-01"; end="2021-12-31"; range="2020-2021"}
    @{id=4; start="2022-01-01"; end="2023-12-31"; range="2022-2023"}
    @{id=5; start="2024-01-01"; end="2025-12-31"; range="2024-2025"}
    @{id=6; start="2026-01-01"; end="2026-12-31"; range="2026-Now (FRESH RESTART)"}
)

foreach ($scraper in $scrapers) {
    Write-Host "Launching Scraper $($scraper.id) ($($scraper.range))..." -ForegroundColor Green
    Start-Process python -ArgumentList "scrapers/province_update_scraper.py --id $($scraper.id) --start $($scraper.start) --end $($scraper.end)" -WindowStyle Normal
    Start-Sleep -Milliseconds 500
}

Write-Host "`nAll 6 scrapers launched!" -ForegroundColor Green
Write-Host "`nMonitor progress with:" -ForegroundColor Yellow
Write-Host "  powershell -ExecutionPolicy Bypass -File check_scraper_status.ps1" -ForegroundColor White
Write-Host "`nView logs in:" -ForegroundColor Yellow
Write-Host "  province_update_X_YYYYMMDD.log" -ForegroundColor White

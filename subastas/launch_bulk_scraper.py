"""
Simple Bulk Scraper Launcher
Runs the bulk historical scraper as a module to fix import issues
"""

import subprocess
import sys
import os

# Change to scraper directory
os.chdir('scraper')

# Run as module
result = subprocess.run([
    sys.executable, '-m', 'bulk_historical_scraper',
    '--pages', '200',
    '--delay', '180', 
    '--reset'
], capture_output=False, text=True)

sys.exit(result.returncode)

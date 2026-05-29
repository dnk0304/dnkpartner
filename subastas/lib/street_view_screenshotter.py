"""
Street View Screenshot Generator
Uses Playwright to screenshot Google Street View for property images
100% Free - No API keys required
"""

import asyncio
import os
from pathlib import Path
from typing import Optional
from playwright.async_api import async_playwright, Page, Browser
import hashlib
from lib.maps_url_generator import GoogleMapsUrlGenerator


class StreetViewScreenshotter:
    """
    Capture screenshots from Google Street View using Playwright.
    Completely free - navigates to Street View URLs and takes screenshots.
    """
    
    def __init__(self, output_dir: str = 'data/images/street_view'):
        """
        Initialize screenshot generator.
        
        Args:
            output_dir: Directory to save screenshots
        """
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.url_generator = GoogleMapsUrlGenerator()
    
    def _generate_filename(
        self,
        latitude: float,
        longitude: float,
        heading: int = 0
    ) -> str:
        """
        Generate unique filename for screenshot based on location.
        
        Args:
            latitude: Location latitude
            longitude: Location longitude
            heading: Camera heading
            
        Returns:
            Filename string
        """
        # Create hash of coordinates for unique filename
        location_str = f"{latitude:.6f},{longitude:.6f},{heading}"
        location_hash = hashlib.md5(location_str.encode()).hexdigest()[:12]
        return f"sv_{location_hash}.jpg"
    
    async def capture_street_view(
        self,
        latitude: float,
        longitude: float,
        heading: int = 0,
        pitch: int = 0,
        browser: Optional[Browser] = None,
        wait_time: int = 3000
    ) -> Optional[str]:
        """
        Capture screenshot from Google Street View.
        
        Args:
            latitude: Location latitude
            longitude: Location longitude
            heading: Camera heading (0-360, 0=North)
            pitch: Camera pitch (-90 to 90, 0=horizontal)
            browser: Optional existing browser instance
            wait_time: Time to wait for Street View to load (ms)
            
        Returns:
            Path to saved screenshot, or None if failed
        """
        # Generate Street View URL
        street_view_url = self.url_generator.generate_street_view_url(
            latitude, longitude, heading, pitch
        )
        
        if not street_view_url:
            print(f"  ❌ Could not generate Street View URL for {latitude},{longitude}")
            return None
        
        # Generate filename
        filename = self._generate_filename(latitude, longitude, heading)
        output_path = self.output_dir / filename
        
        # Check if already exists
        if output_path.exists():
            print(f"  ✓ Screenshot already exists: {filename}")
            return str(output_path)
        
        # Capture screenshot
        close_browser = False
        if browser is None:
            playwright = await async_playwright().start()
            browser = await playwright.chromium.launch(headless=True)
            close_browser = True
        
        try:
            page = await browser.new_page(
                viewport={'width': 1920, 'height': 1080}
            )
            
            print(f"  📸 Loading Street View: {latitude},{longitude} (heading: {heading}°)")
            await page.goto(street_view_url, wait_until='networkidle', timeout=30000)
            
            # Wait for Street View to fully load
            await page.wait_for_timeout(wait_time)
            
            # Take screenshot of the main content area
            await page.screenshot(
                path=str(output_path),
                quality=85,
                type='jpeg',
                full_page=False
            )
            
            await page.close()
            
            print(f"  ✅ Screenshot saved: {filename}")
            return str(output_path)
            
        except Exception as e:
            print(f"  ❌ Error capturing screenshot: {str(e)}")
            return None
            
        finally:
            if close_browser and browser:
                await browser.close()
    
    async def capture_multiple_angles(
        self,
        latitude: float,
        longitude: float,
        headings: list[int] = [0, 90, 180, 270],
        pitch: int = 0
    ) -> list[str]:
        """
        Capture multiple screenshots from different angles.
        
        Args:
            latitude: Location latitude
            longitude: Location longitude
            headings: List of camera headings to capture
            pitch: Camera pitch
            
        Returns:
            List of paths to saved screenshots
        """
        async with async_playwright() as playwright:
            browser = await playwright.chromium.launch(headless=True)
            
            screenshots = []
            for heading in headings:
                path = await self.capture_street_view(
                    latitude, longitude, heading, pitch, browser
                )
                if path:
                    screenshots.append(path)
                
                # Small delay between captures
                await asyncio.sleep(1)
            
            await browser.close()
            
            return screenshots
    
    async def capture_best_angle(
        self,
        latitude: float,
        longitude: float,
        title: Optional[str] = None
    ) -> Optional[str]:
        """
        Capture the best angle for a property.
        For now, captures front view (0°). Could be enhanced with ML to find best angle.
        
        Args:
            latitude: Location latitude
            longitude: Location longitude
            title: Optional property title for context
            
        Returns:
            Path to screenshot or None
        """
        return await self.capture_street_view(latitude, longitude, heading=0, pitch=0)


# Example usage
async def main():
    screenshotter = StreetViewScreenshotter()
    
    print("Example 1: Single screenshot (front view)")
    print("="*80)
    screenshot = await screenshotter.capture_street_view(
        latitude=40.4168,
        longitude=-3.7038,
        heading=0  # Face North
    )
    print(f"Saved to: {screenshot}\n")
    
    print("\n" + "="*80 + "\n")
    
    print("Example 2: Multiple angles")
    print("="*80)
    screenshots = await screenshotter.capture_multiple_angles(
        latitude=41.3851,
        longitude=2.1734,
        headings=[0, 90]  # North and East
    )
    print(f"Captured {len(screenshots)} screenshots:")
    for path in screenshots:
        print(f"  - {path}")


if __name__ == '__main__':
    asyncio.run(main())

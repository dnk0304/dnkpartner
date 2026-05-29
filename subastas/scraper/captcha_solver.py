#!/usr/bin/env python3
"""
CAPTCHA Solver for BOE Portal de Subastas
Uses Tesseract OCR to solve simple image CAPTCHAs
"""
import os
import sys
import re
import time
from pathlib import Path
from typing import Optional, Tuple
import logging

# Try to import required libraries
try:
    from PIL import Image, ImageFilter, ImageEnhance, ImageOps
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False
    print("⚠️ PIL not available. Install: pip install Pillow")

try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except ImportError:
    TESSERACT_AVAILABLE = False
    print("⚠️ pytesseract not available. Install: pip install pytesseract")

# Configure Tesseract path for Windows
if sys.platform == 'win32' and TESSERACT_AVAILABLE:
    # Common Windows installation paths (winget installs to Program Files)
    tesseract_paths = [
        r'C:\Program Files\Tesseract-OCR\tesseract.exe',
        r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
        r'C:\Users\D\AppData\Local\Programs\Tesseract-OCR\tesseract.exe',
        r'C:\Users\D\AppData\Local\Microsoft\WinGet\Packages\UB-Mannheim.TesseractOCR_Microsoft.Winget.Source_8wekyb3d8bbwe\tesseract.exe',
    ]
    for path in tesseract_paths:
        if os.path.exists(path):
            pytesseract.pytesseract.tesseract_cmd = path
            print(f"Tesseract found at: {path}")
            break

logger = logging.getLogger(__name__)

SCRIPT_DIR = Path(__file__).parent
CAPTCHA_DIR = SCRIPT_DIR / "captcha_images"
CAPTCHA_DIR.mkdir(exist_ok=True)


def preprocess_captcha_image(image: Image.Image) -> Image.Image:
    """
    Preprocess CAPTCHA image for better OCR recognition
    BOE CAPTCHAs are typically simple alphanumeric with some noise
    """
    # Convert to grayscale
    img = image.convert('L')
    
    # Increase contrast
    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(2.0)
    
    # Increase sharpness
    enhancer = ImageEnhance.Sharpness(img)
    img = enhancer.enhance(2.0)
    
    # Apply threshold to make it binary (black and white)
    threshold = 128
    img = img.point(lambda p: 255 if p > threshold else 0)
    
    # Remove noise with median filter
    img = img.filter(ImageFilter.MedianFilter(size=3))
    
    # Invert if needed (OCR works better with black text on white background)
    # Check if image is mostly dark (inverted)
    histogram = img.histogram()
    dark_pixels = sum(histogram[:128])
    light_pixels = sum(histogram[128:])
    
    if dark_pixels > light_pixels:
        img = ImageOps.invert(img)
    
    # Scale up for better recognition
    width, height = img.size
    img = img.resize((width * 3, height * 3), Image.Resampling.LANCZOS)
    
    return img


def solve_captcha_from_image(image: Image.Image, save_debug: bool = False) -> Optional[str]:
    """
    Solve CAPTCHA from PIL Image
    
    Args:
        image: PIL Image of the CAPTCHA
        save_debug: Whether to save debug images
    
    Returns:
        Solved CAPTCHA text or None if failed
    """
    if not PIL_AVAILABLE or not TESSERACT_AVAILABLE:
        logger.error("Required libraries not available")
        return None
    
    try:
        # Save original for debugging
        if save_debug:
            timestamp = int(time.time())
            image.save(CAPTCHA_DIR / f"captcha_original_{timestamp}.png")
        
        # Preprocess
        processed = preprocess_captcha_image(image)
        
        if save_debug:
            processed.save(CAPTCHA_DIR / f"captcha_processed_{timestamp}.png")
        
        # OCR with Tesseract
        # Configure for alphanumeric characters only
        custom_config = r'--oem 3 --psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        
        text = pytesseract.image_to_string(processed, config=custom_config)
        
        # Clean up the result
        text = text.strip()
        text = re.sub(r'[^A-Za-z0-9]', '', text)  # Remove any non-alphanumeric
        
        logger.info(f"CAPTCHA solved: {text}")
        return text if text else None
        
    except Exception as e:
        logger.error(f"Error solving CAPTCHA: {e}")
        return None


def solve_captcha_from_file(filepath: str) -> Optional[str]:
    """Solve CAPTCHA from file path"""
    if not PIL_AVAILABLE:
        return None
    
    try:
        image = Image.open(filepath)
        return solve_captcha_from_image(image)
    except Exception as e:
        logger.error(f"Error loading CAPTCHA image: {e}")
        return None


def solve_captcha_from_bytes(image_bytes: bytes) -> Optional[str]:
    """Solve CAPTCHA from bytes"""
    if not PIL_AVAILABLE:
        return None
    
    try:
        from io import BytesIO
        image = Image.open(BytesIO(image_bytes))
        return solve_captcha_from_image(image)
    except Exception as e:
        logger.error(f"Error loading CAPTCHA from bytes: {e}")
        return None


def solve_captcha_from_element(page, captcha_selector: str = 'img[alt*="CAPTCHA"], img[src*="captcha"]') -> Optional[str]:
    """
    Solve CAPTCHA from a Playwright page element
    
    Args:
        page: Playwright page object
        captcha_selector: CSS selector for CAPTCHA image
    
    Returns:
        Solved CAPTCHA text or None
    """
    try:
        # Find CAPTCHA image
        captcha_img = page.locator(captcha_selector).first
        
        if captcha_img.count() == 0:
            logger.warning("No CAPTCHA image found")
            return None
        
        # Screenshot the CAPTCHA element
        screenshot_bytes = captcha_img.screenshot()
        
        # Solve it
        return solve_captcha_from_bytes(screenshot_bytes)
        
    except Exception as e:
        logger.error(f"Error capturing CAPTCHA from page: {e}")
        return None


def handle_boe_captcha(page, max_attempts: int = 3) -> bool:
    """
    Handle BOE CAPTCHA if present on the page
    
    Args:
        page: Playwright page object
        max_attempts: Maximum solve attempts
    
    Returns:
        True if CAPTCHA was solved or not present, False if failed
    """
    # Check if CAPTCHA is present
    captcha_indicators = [
        'text=Verificación de seguridad',
        'text=introduzca los caracteres',
        'img[alt*="CAPTCHA"]',
    ]
    
    captcha_present = False
    for indicator in captcha_indicators:
        try:
            if page.locator(indicator).count() > 0:
                captcha_present = True
                break
        except:
            continue
    
    if not captcha_present:
        return True  # No CAPTCHA, proceed normally
    
    print("🔐 CAPTCHA detected, attempting to solve...")
    
    for attempt in range(max_attempts):
        print(f"   Attempt {attempt + 1}/{max_attempts}...")
        
        try:
            # Find and solve the CAPTCHA
            # BOE CAPTCHA selectors
            captcha_selectors = [
                'img[alt*="CAPTCHA"]',
                'img[src*="captcha"]',
                'img[src*="imagen"]',
                '.captcha img',
                'fieldset img',  # BOE puts CAPTCHA in a fieldset
            ]
            
            solution = None
            for selector in captcha_selectors:
                try:
                    captcha_img = page.locator(selector).first
                    if captcha_img.count() > 0:
                        screenshot_bytes = captcha_img.screenshot()
                        solution = solve_captcha_from_bytes(screenshot_bytes)
                        if solution:
                            break
                except:
                    continue
            
            if not solution:
                print(f"   ❌ Could not solve CAPTCHA")
                # Try refreshing the CAPTCHA
                try:
                    page.click('text=difícil', timeout=2000)  # "¿Muy difícil?" link
                    time.sleep(1)
                except:
                    pass
                continue
            
            print(f"   🔑 Solution: {solution}")
            
            # Enter the solution
            input_selectors = [
                'input[name*="captcha"]',
                'input[id*="captcha"]',
                'input[type="text"]',
                'fieldset input[type="text"]',
            ]
            
            for selector in input_selectors:
                try:
                    input_field = page.locator(selector).first
                    if input_field.count() > 0:
                        input_field.fill(solution)
                        break
                except:
                    continue
            
            # Submit
            time.sleep(0.5)
            try:
                submit_selectors = [
                    'button:has-text("Enviar")',
                    'input[value="Enviar"]',
                    'button[type="submit"]',
                    'input[type="submit"]',
                ]
                
                for selector in submit_selectors:
                    try:
                        page.click(selector, timeout=2000)
                        break
                    except:
                        continue
                
                page.wait_for_load_state('networkidle', timeout=10000)
                time.sleep(2)
                
            except Exception as e:
                print(f"   ⚠️ Submit error: {e}")
            
            # Check if CAPTCHA is still present (means we failed)
            still_present = False
            for indicator in captcha_indicators:
                try:
                    if page.locator(indicator).count() > 0:
                        still_present = True
                        break
                except:
                    continue
            
            if not still_present:
                print(f"   ✅ CAPTCHA solved successfully!")
                return True
            else:
                print(f"   ❌ CAPTCHA still present, solution was wrong")
                
        except Exception as e:
            print(f"   ❌ Error: {e}")
    
    print(f"❌ Failed to solve CAPTCHA after {max_attempts} attempts")
    return False


def check_tesseract_installation() -> Tuple[bool, str]:
    """
    Check if Tesseract is properly installed
    
    Returns:
        Tuple of (is_installed, message)
    """
    if not TESSERACT_AVAILABLE:
        return False, "pytesseract not installed. Run: pip install pytesseract"
    
    try:
        version = pytesseract.get_tesseract_version()
        return True, f"Tesseract {version} installed"
    except Exception as e:
        return False, f"Tesseract not found. Install from: https://github.com/UB-Mannheim/tesseract/wiki\nError: {e}"


if __name__ == '__main__':
    import sys
    if sys.platform == 'win32':
        sys.stdout.reconfigure(encoding='utf-8')
    
    # Test the installation
    installed, message = check_tesseract_installation()
    print(f"Tesseract status: {message}")
    
    if installed:
        print("\nCAPTCHA solver ready!")
        print(f"   Debug images will be saved to: {CAPTCHA_DIR}")
    else:
        print("\nPlease install Tesseract OCR:")
        print("   Windows: https://github.com/UB-Mannheim/tesseract/wiki")
        print("   Then run: pip install pytesseract Pillow")

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
import math

# Get Downloads directory
downloads_dir = os.path.join(os.path.expanduser('~'), 'Downloads')

# Load the ORIGINAL flyer (not the corrupted one)
print("Loading images...")

# Use the original viken flyer
original_flyer_path = os.path.join(downloads_dir, 'viken_promo_flyer_final.png')
signal_logo_path = os.path.join(downloads_dir, 'Signal logo.png')

if not os.path.exists(original_flyer_path):
    print(f"ERROR: Could not find original flyer at {original_flyer_path}")
    exit(1)
    
if not os.path.exists(signal_logo_path):
    print(f"ERROR: Could not find Signal logo at {signal_logo_path}")
    exit(1)

flyer = Image.open(original_flyer_path)
signal_logo = Image.open(signal_logo_path)

print(f"Loaded flyer: {flyer.size}")
print(f"Loaded Signal logo: {signal_logo.size}")

# Create a copy to work with
flyer = flyer.convert('RGBA')
width, height = flyer.size

# ============================================
# STEP 1: Replace VIKEN FIBER logo with Signal
# ============================================
print("Step 1: Replacing VIKEN FIBER logo with Signal...")

# The "VIKEN FIBER" text is at the top left
# We need to cover it with the background color first, then paste Signal logo
signal_logo = signal_logo.convert('RGBA')

# Resize Signal logo to appropriate size (original VIKEN FIBER area is about 280px wide)
logo_target_width = 220
logo_ratio = logo_target_width / signal_logo.width
logo_target_height = int(signal_logo.height * logo_ratio)
signal_logo_resized = signal_logo.resize((logo_target_width, logo_target_height), Image.Resampling.LANCZOS)

# Sample background color from the flyer (dark teal/blue)
bg_color = flyer.getpixel((50, 50))

# Cover the old "VIKEN FIBER" text area (approximately x:45-330, y:45-100)
draw = ImageDraw.Draw(flyer)
draw.rectangle([(45, 45), (340, 110)], fill=bg_color)

# Paste the Signal logo in place
flyer.paste(signal_logo_resized, (50, 50), signal_logo_resized)

# ============================================
# STEP 2: Change price from 899 to 999
# ============================================
print("Step 2: Changing price from 899 to 999...")

# The price "899,-" is on the right side, below "KAMPANJE"
# We need to cover it and redraw with 999

# Sample background color near the price area
price_bg_color = flyer.getpixel((550, 300))

# Cover the old price area (approximately x:510-780, y:265-380)
draw.rectangle([(510, 265), (780, 385)], fill=price_bg_color)

# Load a bold font for the price
try:
    font_price = ImageFont.truetype("C:\\Windows\\Fonts\\arialbd.ttf", 115)
except:
    try:
        font_price = ImageFont.truetype("C:\\Windows\\Fonts\\Arial.ttf", 115)
    except:
        font_price = ImageFont.load_default()

# Draw the new price "999,-" in white
draw.text((515, 265), "999,-", fill=(255, 255, 255, 255), font=font_price)

# ============================================
# STEP 3: Change "Stabil fiber fra Viken" to "Stabilt hele døgnet"
# ============================================
print("Step 3: Updating 'Stabil fiber fra Viken' text...")

# This text is in the bottom-right feature box (99.99% Oppetid box)
# The subtitle text is below "99.99% Oppetid"

# Sample background color from the box (dark/black area)
box_bg_color = (0, 0, 0, 255)  # The boxes have black background

# Cover the old text "Stabil fiber fra Viken" (approximately x:455-750, y:530-560)
draw.rectangle([(455, 530), (755, 565)], fill=box_bg_color)

# Load font for the subtitle text
try:
    font_subtitle = ImageFont.truetype("C:\\Windows\\Fonts\\Arial.ttf", 24)
except:
    font_subtitle = ImageFont.load_default()

# Draw the new text
draw.text((460, 535), "Stabilt hele døgnet", fill=(200, 200, 200, 255), font=font_subtitle)

# ============================================
# STEP 4: Add Northern Lights gradient effect
# ============================================
print("Step 4: Adding northern lights gradient effect...")

# Create a subtle northern lights overlay
gradient = Image.new('RGBA', (width, height), (0, 0, 0, 0))
grad_draw = ImageDraw.Draw(gradient)

for y in range(height):
    ratio = y / height
    
    # Northern lights colors - flowing from top to bottom
    # Top: deep blue/purple, Middle: teal/green, Bottom: hints of purple
    if ratio < 0.25:
        # Top section - subtle purple/blue
        r = int(20 + (ratio * 4 * 30))
        g = int(60 + (ratio * 4 * 80))
        b = int(100 + (ratio * 4 * 50))
    elif ratio < 0.5:
        # Upper-middle - teal/cyan
        local_ratio = (ratio - 0.25) / 0.25
        r = int(50 - (local_ratio * 30))
        g = int(140 + (local_ratio * 40))
        b = int(150 - (local_ratio * 20))
    elif ratio < 0.75:
        # Lower-middle - green tones
        local_ratio = (ratio - 0.5) / 0.25
        r = int(20 + (local_ratio * 40))
        g = int(180 - (local_ratio * 60))
        b = int(130 - (local_ratio * 30))
    else:
        # Bottom - subtle purple hints
        local_ratio = (ratio - 0.75) / 0.25
        r = int(60 + (local_ratio * 30))
        g = int(120 - (local_ratio * 40))
        b = int(100 + (local_ratio * 40))
    
    # Add wave-like horizontal variation
    wave = math.sin(ratio * math.pi * 4) * 15
    r = max(0, min(255, r + int(wave)))
    g = max(0, min(255, g + int(wave * 0.5)))
    b = max(0, min(255, b + int(wave * 0.3)))
    
    # Keep alpha low for subtlety (15-35 range)
    alpha = int(15 + (math.sin(ratio * math.pi * 2) * 10))
    
    grad_draw.line([(0, y), (width, y)], fill=(r, g, b, alpha))

# Apply blur for smooth effect
gradient = gradient.filter(ImageFilter.GaussianBlur(radius=80))

# Composite the gradient onto the flyer
flyer = Image.alpha_composite(flyer, gradient)

# ============================================
# SAVE THE FINAL IMAGE
# ============================================
print("Saving final flyer...")
output_path = os.path.join(downloads_dir, 'signal_flyer_updated.png')

# Convert to RGB for saving as PNG
flyer_final = flyer.convert('RGB')
flyer_final.save(output_path, 'PNG', optimize=True)

print(f"\nFlyer created successfully!")
print(f"Saved to: {output_path}")
print("\nChanges applied:")
print("  [OK] Logo: VIKEN FIBER -> Signal")
print("  [OK] Price: 899,- -> 999,-")
print("  [OK] Text: 'Stabil fiber fra Viken' -> 'Stabilt hele døgnet'")
print("  [OK] Northern lights gradient effect added")

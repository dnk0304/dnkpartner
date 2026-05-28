from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

def create_flyer():
    # --- Configuration ---
    user_home = os.path.expanduser("~")
    filename = os.path.join(user_home, "Downloads", "viken_promo_flyer_v3.png")
    
    width, height = 1080, 1920 
    
    # Brand Colors
    COLOR_RED = "#E3000F"
    COLOR_DARK = "#002B49" # Deep Nordic Blue used in bg
    COLOR_WHITE = "#FFFFFF"
    COLOR_GREY_TEXT = "#CCCCCC"
    
    # Create Image
    img = Image.new('RGB', (width, height), COLOR_WHITE)
    draw = ImageDraw.Draw(img)
    
    # --- Fonts ---
    def get_font(size, bold=False):
        try:
            font_name = "arialbd.ttf" if bold else "arial.ttf"
            return ImageFont.truetype(font_name, size)
        except IOError:
            return ImageFont.load_default()

    font_header = get_font(70, bold=True)
    font_title = get_font(90, bold=True)
    font_subtitle = get_font(40, bold=False)
    font_body_bold = get_font(35, bold=True)
    font_body = get_font(30, bold=False)
    font_small = get_font(24, bold=False)
    font_badge = get_font(30, bold=True)
    font_price_lg = get_font(130, bold=True)
    font_price_md = get_font(70, bold=True)
    
    # --- Background: Gradient ---
    for y in range(height):
        p = y / height
        if p < 0.5:
            # Deep Blue -> Greenish
            r1, g1, b1 = (0, 43, 73)
            r2, g2, b2 = (0, 79, 75)
            ratio = p * 2
        else:
            # Greenish -> Dark
            r1, g1, b1 = (0, 79, 75)
            r2, g2, b2 = (20, 20, 20)
            ratio = (p - 0.5) * 2
            
        r = int(r1 + (r2 - r1) * ratio)
        g = int(g1 + (g2 - g1) * ratio)
        b = int(b1 + (b2 - b1) * ratio)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    # --- Header (Logo) ---
    y_cursor = 80
    
    # "VIKEN FIBER"
    draw.text((80, y_cursor), "VIKEN", fill=COLOR_WHITE, font=get_font(60, True))
    draw.text((290, y_cursor), "FIBER", fill="#AAAAAA", font=get_font(60, False))
    
    # Divider
    draw.line([(500, y_cursor - 5), (500, y_cursor + 80)], fill=COLOR_WHITE, width=2)
    
    # Altibox
    draw.text((530, y_cursor), "VI LEVERER", fill="#CCCCCC", font=get_font(18, True))
    draw.rounded_rectangle([(530, y_cursor + 30), (750, y_cursor + 85)], radius=25, fill=COLOR_RED)
    draw.text((565, y_cursor + 35), "altibox", fill=COLOR_WHITE, font=get_font(35, True))

    # --- Tidsbegrenset Badge (Top Right) ---
    # Moved down slightly to avoid overlapping with header
    badge_text = "TIDSBEGRENSET TILBUD"
    left, top, right, bottom = draw.textbbox((0, 0), badge_text, font=font_badge)
    w_b, h_b = right - left, bottom - top
    
    bx = width - w_b - 80
    by = y_cursor + 10 # Aligned with logo
    # No, let's move it below or above? User said overlapping.
    # Let's move it well below the logo area or top right corner ABOVE content.
    by = y_cursor + 120 
    
    # Actually, let's place it top right but ensure no overlap with "Altibox Standard" title
    # or place it as a banner across?
    # User screenshot showed it overlapping the red altibox logo.
    # Let's move it down.
    
    draw.rounded_rectangle([(bx - 20, by - 10), (bx + w_b + 20, by + h_b + 10)], radius=15, fill="#FFD700")
    draw.text((bx, by), badge_text, fill=COLOR_DARK, font=font_badge)

    # --- Hero Section: Title & Price ---
    y_cursor += 150
    
    # Title (Left)
    draw.text((80, y_cursor), "ALTIBOX", fill=COLOR_WHITE, font=font_title)
    draw.text((80, y_cursor + 100), "STANDARD", fill=COLOR_WHITE, font=font_title)
    draw.text((80, y_cursor + 210), "Underholdning for", fill="#DDDDDD", font=font_subtitle)
    draw.text((80, y_cursor + 260), "hele familien", fill="#DDDDDD", font=font_subtitle)
    
    # Price Stack (Right aligned, vertically centered with title)
    price_right_margin = width - 80
    
    # Old Price
    old_price = "1339,-"
    left, top, right, bottom = draw.textbbox((0, 0), old_price, font=font_price_md)
    w_old = right - left
    draw.text((price_right_margin - w_old, y_cursor + 20), old_price, fill="#888888", font=font_price_md)
    draw.text((price_right_margin - w_old, y_cursor - 25), "Ordinær pris:", fill="#AAAAAA", font=font_small)
    draw.line([(price_right_margin - w_old - 5, y_cursor + 55), (price_right_margin + 5, y_cursor + 55)], fill="#888888", width=4)
    
    # Promo Price
    promo_price = "899,-"
    left, top, right, bottom = draw.textbbox((0, 0), promo_price, font=font_price_lg)
    w_new = right - left
    
    draw.text((price_right_margin - w_new - 10, y_cursor + 100), "KAMPANJE", fill="#FFD700", font=font_body_bold)
    draw.text((price_right_margin - w_new, y_cursor + 140), promo_price, fill=COLOR_WHITE, font=font_price_lg)
    draw.text((price_right_margin - w_new, y_cursor + 280), "/mnd i 12 md.", fill=COLOR_WHITE, font=font_body)

    # --- Awards / CTA Section (Removed EPSI, Added Custom CTA) ---
    # User removed EPSI banner.
    # Added "Passer det ikke nå?" text on right side
    
    # Instead of the banner, let's just add the text or badge where appropriate.
    # We can add "99.99% Oppetid" back to badges or as a standalone.
    
    # "Passer det ikke nå?" Text - Right side
    # Make more space so it stands differently placed.
    # Let's move it further down or right align with more gap.
    # Currently: passer_y = y_cursor + 320
    
    passer_y = y_cursor + 350 # Moved down further
    passer_text = "Har du binding?\nSi i fra så ordner vi en løsning"
    
    f_passer = get_font(28, True)
    # manual right align
    line1 = "Har du binding?"
    line2 = "Si i fra så ordner vi en løsning"
    
    bbox1 = draw.textbbox((0,0), line1, font=f_passer)
    w1 = bbox1[2]-bbox1[0]
    bbox2 = draw.textbbox((0,0), line2, font=f_passer)
    w2 = bbox2[2]-bbox2[0]
    
    draw.text((price_right_margin - w1, passer_y), line1, fill="#FFFFFF", font=f_passer) # White text
    draw.text((price_right_margin - w2, passer_y + 40), line2, fill="#FFFFFF", font=f_passer)

    y_cursor += 420 # Increased spacing flow to next section

    # --- Feature Grid (Cleaned up) ---
    y_cursor += 150
    
    # Row 1
    # User requested different color combination and design for highlighted buttons (badges) based on attached picture.
    # The picture shows solid black/very dark background with sharp colored vertical accent bars on left.
    # Let's adjust draw_badge_clean.
    
    def draw_badge_clean(x, y, title, subtitle, color):
        w_box, h_box = 440, 140
        # Solid black fill (or very dark) as per image reference
        draw.rounded_rectangle([(x, y), (x + w_box, y + h_box)], radius=15, fill=(0, 0, 0, 255), outline=(255, 255, 255, 100))
        
        # Color bar - thicker and brighter
        draw.rectangle([(x + 25, y + 25), (x + 35, y + h_box - 25)], fill=color)
        
        draw.text((x + 60, y + 25), title, fill=COLOR_WHITE, font=get_font(34, True))
        draw.text((x + 60, y + 75), subtitle, fill="#CCCCCC", font=font_small)

    # Row 1
    draw_badge_clean(80, y_cursor, "TV-pakke: 60 poeng", "Velg fritt i portalen", COLOR_RED)
    draw_badge_clean(560, y_cursor, "10+ Strømmetjenester", "Netflix, HBO m.fl.", "#00AEEF")
    
    y_cursor += 170
    
    # Row 2
    # Replaced "Topp WiFi" with "99.99% Oppetid" as requested
    draw_badge_clean(80, y_cursor, "5 steder samtidig", "TV, Mobil, Nettbrett", "#FFD700")
    draw_badge_clean(560, y_cursor, "99.99% Oppetid", "Stabil fiber fra Viken", "#4CAF50")

    # --- Devices Strip ---
    y_cursor += 180
    draw.text((80, y_cursor), "Se overalt med Altibox-appen:", fill="#FFFFFF", font=font_body_bold)
    y_cursor += 60 # increased spacing
    
    devices = ["TV", "Chromecast/Apple TV", "Mobil", "Nettbrett", "PC/Mac"]
    x_dev = 80
    for dev in devices:
        # Pill shape for device
        left, top, right, bottom = draw.textbbox((0, 0), dev, font=font_small)
        w_d = right - left
        # Ensure text color is visible (User saw white pill with white text?)
        # Let's make pill darker or text darker. 
        # Pill fill=(255, 255, 255, 40) is light transparent white. Text white. Should work on dark BG.
        # But let's make it clearer.
        draw.rounded_rectangle([(x_dev, y_cursor), (x_dev + w_d + 40, y_cursor + 50)], radius=25, fill=(255, 255, 255, 255)) # Solid white
        draw.text((x_dev + 20, y_cursor + 10), dev, fill=COLOR_DARK, font=font_small) # Dark text on light pill
        x_dev += w_d + 60

    # --- List Items (Vertical) ---
    y_cursor += 100
    features = [
        "Symmetrisk Fiber 500/500 Mbps",
        "500 timer opptak i skyen",
        "Start forfra & Ukesarkiv",
        "0,- Etablering",
    ]
    for feat in features:
        draw.ellipse([(80, y_cursor + 10), (100, y_cursor + 30)], fill=COLOR_RED)
        draw.text((120, y_cursor), feat, fill=COLOR_WHITE, font=font_body)
        y_cursor += 60

    # --- Streaming Logos ---
    y_cursor += 50
    draw.text((80, y_cursor), "Velg dine favoritter:", fill="#FFFFFF", font=font_body_bold)
    y_cursor += 70
    
    def draw_circle(x, y, text, bg, fg):
        size = 120
        draw.ellipse([(x, y), (x + size, y + size)], fill=bg)
        
        f = get_font(20, True)
        if len(text) > 8: f = get_font(16, True)
        left, top, right, bottom = draw.textbbox((0, 0), text, font=f)
        w_t, h_t = right - left, bottom - top
        draw.text((x + (size-w_t)/2, y + (size-h_t)/2), text, fill=fg, font=f)

    logos = [
        ("Netflix", "#000000", "#E50914"),
        ("HBO Max", "#240E39", "#FFFFFF"),
        ("Viaplay", "#222222", "#FFFFFF"),
        ("TV2 Play", "#4B0082", "#FFFFFF"), # Glossy lighter purple (Indigo/Purple)
        ("V sport", "#141414", "#FFFFFF"),
        ("TV2 Sport", "#FFFFFF", "#E3000F"),
    ]
    
    lx = 80
    for name, bg, fg in logos:
        if lx + 120 > width: lx = 80; y_cursor += 130
        draw_circle(lx, y_cursor, name, bg, fg)
        lx += 150

    # --- Footer ---
    y_final = height - 120
    draw.text((80, y_final), "Full oversikt: altibox.no/privat/tv/innholdsoversikt/", fill="#AAAAAA", font=get_font(22))
    draw.text((80, y_final + 40), "Vilkår: altibox.no/vilkar", fill="#AAAAAA", font=get_font(22))

    try:
        img.save(filename)
        print(f"Flyer created: {filename}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    create_flyer()

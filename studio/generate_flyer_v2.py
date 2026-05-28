from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
import math

def create_flyer():
    # --- Configuration ---
    user_home = os.path.expanduser("~")
    filename = os.path.join(user_home, "Downloads", "viken_promo_flyer_nature.png")
    
    width, height = 1080, 1920 
    
    # Brand Colors
    COLOR_RED = "#E3000F"
    COLOR_DARK = "#333333"
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

    font_header = get_font(80, bold=True)
    font_title = get_font(100, bold=True) # Slightly smaller to fit
    font_subtitle = get_font(40, bold=False)
    font_body_bold = get_font(40, bold=True)
    font_body = get_font(35, bold=False)
    font_small = get_font(30, bold=False)
    font_badge = get_font(35, bold=True)
    font_price_lg = get_font(140, bold=True)
    font_price_md = get_font(80, bold=True)
    font_price_sm = get_font(40, bold=True)

    # --- Background: Gradient (Norwegian Nature Inspiration) ---
    # Deep Blue (Fjord) -> Greenish (Aurora/Forest) -> Dark Grey (Brand)
    for y in range(height):
        p = y / height
        if p < 0.5:
            r1, g1, b1 = (0, 43, 73)
            r2, g2, b2 = (0, 79, 75)
            ratio = p * 2
        else:
            r1, g1, b1 = (0, 79, 75)
            r2, g2, b2 = (26, 26, 26)
            ratio = (p - 0.5) * 2
            
        r = int(r1 + (r2 - r1) * ratio)
        g = int(g1 + (g2 - g1) * ratio)
        b = int(b1 + (b2 - b1) * ratio)
        draw.line([(0, y), (width, y)], fill=(r, g, b))

    # --- Header Section (Logo) ---
    y_logo = 80
    
    # "VIKEN FIBER"
    draw.text((80, y_logo), "VIKEN", fill=COLOR_WHITE, font=get_font(70, True))
    draw.text((310, y_logo), "FIBER", fill="#AAAAAA", font=get_font(70, False))
    
    # Divider line
    draw.line([(530, y_logo - 10), (530, y_logo + 90)], fill=COLOR_WHITE, width=3)
    
    # "Vi leverer" small text
    draw.text((560, y_logo), "VI LEVERER", fill="#CCCCCC", font=get_font(20, True))
    
    # Altibox Lozenge
    draw.rounded_rectangle([(560, y_logo + 30), (810, y_logo + 90)], radius=30, fill=COLOR_RED)
    draw.text((595, y_logo + 35), "altibox", fill=COLOR_WHITE, font=get_font(40, True))

    # --- Tidsbegrenset Badge ---
    y_cursor = 250
    badge_text = "TILBUDET ER TIDSBEGRENSET"
    
    left, top, right, bottom = draw.textbbox((0, 0), badge_text, font=font_badge)
    w_b, h_b = right - left, bottom - top
    
    pad_b = 20
    draw.rounded_rectangle([(width/2 - w_b/2 - pad_b, y_cursor), (width/2 + w_b/2 + pad_b, y_cursor + h_b + pad_b*2)], radius=20, fill="#FFD700")
    draw.text((width/2 - w_b/2, y_cursor + pad_b/2), badge_text, fill=COLOR_DARK, font=font_badge)

    # --- Hero Section (Title Left + Price Right) ---
    y_cursor += 120
    
    # Left: Title
    draw.text((80, y_cursor), "ALTIBOX", fill=COLOR_WHITE, font=font_title)
    draw.text((80, y_cursor + 110), "STANDARD", fill=COLOR_WHITE, font=font_title)
    draw.text((80, y_cursor + 230), "Underholdning for", fill="#DDDDDD", font=font_subtitle)
    draw.text((80, y_cursor + 280), "hele familien", fill="#DDDDDD", font=font_subtitle)
    
    # Right: Price Stack
    # Align roughly to right margin (width - 80)
    price_x_right = width - 80
    
    # Old Price (Top/Back)
    old_price_str = "1339,-"
    left, top, right, bottom = draw.textbbox((0, 0), old_price_str, font=font_price_md)
    w_op = right - left
    
    draw.text((price_x_right - w_op, y_cursor + 20), old_price_str, fill="#888888", font=font_price_md)
    draw.text((price_x_right - w_op, y_cursor - 30), "Ordinær pris:", fill="#AAAAAA", font=font_small)
    # Strikethrough
    draw.line([(price_x_right - w_op - 10, y_cursor + 60), (price_x_right + 10, y_cursor + 60)], fill="#888888", width=5)
    
    # Promo Price (Front/Underneath)
    promo_price_str = "899,-"
    left, top, right, bottom = draw.textbbox((0, 0), promo_price_str, font=font_price_lg)
    w_pp = right - left
    
    # Campaign Label
    draw.text((price_x_right - w_pp - 10, y_cursor + 110), "KAMPANJE", fill="#FFD700", font=font_body_bold)
    
    # Price
    draw.text((price_x_right - w_pp, y_cursor + 160), promo_price_str, fill=COLOR_WHITE, font=font_price_lg)
    draw.text((price_x_right - w_pp, y_cursor + 320), "/mnd i 12 md.", fill=COLOR_WHITE, font=font_body)
    
    # --- Feature Grid (Badges) ---
    y_cursor += 420
    
    def draw_feature_badge(x, y, text1, text2, icon_color):
        # Increased spacing and width
        w_box = 420
        h_box = 130
        
        # Darker transparent background for contrast against white text, or lighter for dark text?
        # User complained about readability. Let's use a Darker overlay so white text pops.
        draw.rounded_rectangle([(x, y), (x + w_box, y + h_box)], radius=20, fill=(0, 0, 0, 60), outline=(255, 255, 255, 50))
        
        # Icon bar
        draw.rectangle([(x + 20, y + 25), (x + 30, y + h_box - 25)], fill=icon_color)
        
        draw.text((x + 50, y + 20), text1, fill=COLOR_WHITE, font=get_font(38, True))
        draw.text((x + 50, y + 70), text2, fill="#DDDDDD", font=font_small)

    # Row 1
    draw_feature_badge(80, y_cursor, "60+ TV-kanaler", "Velg fritt", COLOR_RED)
    draw_feature_badge(540, y_cursor, "10+ Strømming", "Inkludert", "#00AEEF")
    
    y_cursor += 160 # More vertical gap
    
    # Row 2
    draw_feature_badge(80, y_cursor, "5 steder samtidig", "Se TV hvor du vil", "#FFD700")
    draw_feature_badge(540, y_cursor, "99.99% Oppetid", "Alltid på nett", "#4CAF50")

    # --- List Items ---
    y_cursor += 200
    features = [
        "Internett 500/500 Mbps",
        "500 timer opptak i skyen",
        "Start forfra & Ukesarkiv",
        "0,- Etablering (Spar penger!)",
    ]
    
    for feat in features:
        draw.ellipse([(80, y_cursor + 12), (100, y_cursor + 32)], fill=COLOR_RED)
        draw.text((120, y_cursor), feat, fill=COLOR_WHITE, font=font_body)
        y_cursor += 70

    # --- Streaming Logos ---
    y_cursor += 50
    draw.text((80, y_cursor), "Velg dine favoritter:", fill="#FFFFFF", font=font_body_bold)
    y_cursor += 80
    
    def draw_circle_logo(x, y, label, bg_col, text_col):
        size = 130
        draw.ellipse([(x, y), (x + size, y + size)], fill=bg_col)
        
        f = get_font(22, True)
        if len(label) > 8: f = get_font(18, True)
        
        left, top, right, bottom = draw.textbbox((0, 0), label, font=f)
        w_t = right - left
        h_t = bottom - top
        
        draw.text((x + (size-w_t)/2, y + (size-h_t)/2), label, fill=text_col, font=f)
    
    logos = [
        ("Netflix", "#000000", "#E50914"),
        ("HBO Max", "#240E39", "#FFFFFF"),
        ("Viaplay", "#222222", "#FFFFFF"),
        ("TV2 Play", "#FFFFFF", "#E3000F"),
        ("V sport", "#141414", "#FFFFFF"),
        ("TV2 Sport", "#FFFFFF", "#E3000F"),
    ]
    
    lx = 80
    for name, bg, fg in logos:
        if lx + 130 > width: # Wrap if needed
            lx = 80
            y_cursor += 150
            
        draw_circle_logo(lx, y_cursor, name, bg, fg)
        lx += 160
        
    y_cursor += 200
    
    # --- Footer ---
    # Ensure ample space
    if y_cursor > height - 150:
        y_cursor = height - 150
        
    draw.text((80, height - 120), "Se full kanal- og strømmeliste: altibox.no/privat/tv/innholdsoversikt/", fill="#AAAAAA", font=get_font(24))
    draw.text((80, height - 80), "Vilkår: altibox.no/vilkar", fill="#AAAAAA", font=get_font(24))

    try:
        img.save(filename)
        print(f"Flyer created: {filename}")
    except Exception as e:
        print(f"Error saving: {e}")

if __name__ == "__main__":
    create_flyer()

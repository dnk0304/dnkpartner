from PIL import Image, ImageDraw, ImageFont
import os

def create_flyer():
    # --- Configuration ---
    # Save to Downloads folder
    user_home = os.path.expanduser("~")
    filename = os.path.join(user_home, "Downloads", "viken_promo_flyer.png")
    
    width, height = 1080, 2100 
    
    # Brand Colors
    COLOR_RED = "#E3000F"       # Altibox Red
    COLOR_DARK = "#333333"      # Dark Grey/Black
    COLOR_WHITE = "#FFFFFF"
    COLOR_BG_LIGHT = "#F4F4F4"
    COLOR_ACCENT_BLUE = "#00AEEF" 
    
    # Create Image
    img = Image.new('RGB', (width, height), COLOR_WHITE)
    draw = ImageDraw.Draw(img)
    
    # --- Helper: Fonts ---
    def get_font(size, bold=False):
        try:
            # Try loading Arial as a standard safe font
            font_name = "arialbd.ttf" if bold else "arial.ttf"
            return ImageFont.truetype(font_name, size)
        except IOError:
            return ImageFont.load_default()

    font_header = get_font(100, bold=True)
    font_title = get_font(70, bold=True)
    font_subtitle = get_font(40, bold=False)
    font_body_bold = get_font(35, bold=True)
    font_body = get_font(30, bold=False)
    font_small = get_font(24, bold=False)
    font_tiny = get_font(20, bold=False)
    font_badge = get_font(30, bold=True)
    font_price_lg = get_font(130, bold=True)

    # --- Header Section ---
    header_height = 220
    draw.rectangle([(0, 0), (width, header_height)], fill=COLOR_DARK)
    
    # Textual Logo "viken fiber"
    draw.text((50, 70), "viken", fill=COLOR_WHITE, font=get_font(60, True))
    draw.text((220, 70), "fiber", fill=COLOR_RED, font=get_font(60, True))
    
    # Textual Logo "altibox"
    draw.text((width - 300, 80), "altibox", fill=COLOR_WHITE, font=get_font(50, True))

    # --- Hero / Title ---
    y_cursor = 280
    
    # LIMITED TIME BADGE (Top Area)
    draw.rounded_rectangle([(50, y_cursor), (450, y_cursor + 60)], radius=30, fill="#FFCC00")
    draw.text((80, y_cursor + 10), "TIDSBEGRENSET TILBUD", fill=COLOR_DARK, font=font_body_bold)
    
    y_cursor += 100
    draw.text((50, y_cursor), "ALTIBOX STANDARD", fill=COLOR_DARK, font=font_title)
    y_cursor += 90
    draw.text((50, y_cursor), "Underholdning for hele familien", fill=COLOR_DARK, font=font_subtitle)
    
    # --- Uptime Badge (Blue Circle) ---
    badge_x, badge_y = width - 200, 350
    badge_radius = 80
    draw.ellipse([(badge_x - badge_radius, badge_y - badge_radius), 
                  (badge_x + badge_radius, badge_y + badge_radius)], fill=COLOR_ACCENT_BLUE)
    draw.text((badge_x - 55, badge_y - 20), "99.99%", fill=COLOR_WHITE, font=font_badge)
    draw.text((badge_x - 50, badge_y + 15), "Oppetid", fill=COLOR_WHITE, font=get_font(25, True))

    y_cursor += 80
    draw.line([(50, y_cursor), (width-50, y_cursor)], fill=COLOR_RED, width=4)
    y_cursor += 60

    # --- Features List ---
    # Add new badges near features
    
    features = [
        ("Internett 500/500 Mbps", "Symmetrisk fiberhastighet"),
        ("500 timer opptak", "Lagre i skyen – se når du vil"),
        ("Start forfra & Arkiv", "Gå ikke glipp av favorittene"),
        ("Altibox-appen", "Se TV hvor som helst i hele EU"),
    ]

    # Two Main Badges for Content
    draw.rounded_rectangle([(50, y_cursor), (350, y_cursor + 100)], radius=20, fill=COLOR_DARK)
    draw.text((80, y_cursor + 15), "60+", fill=COLOR_RED, font=get_font(40, True))
    draw.text((160, y_cursor + 15), "TV-kanaler", fill=COLOR_WHITE, font=font_body_bold)
    draw.text((80, y_cursor + 55), "Velg fritt", fill="#AAAAAA", font=font_small)

    draw.rounded_rectangle([(400, y_cursor), (750, y_cursor + 100)], radius=20, fill=COLOR_DARK)
    draw.text((430, y_cursor + 15), "12+", fill=COLOR_RED, font=get_font(40, True))
    draw.text((510, y_cursor + 15), "Strømming", fill=COLOR_WHITE, font=font_body_bold)
    draw.text((430, y_cursor + 55), "Inkludert", fill="#AAAAAA", font=font_small)

    y_cursor += 150

    for title, desc in features:
        # Custom Bullet
        draw.rectangle([(50, y_cursor + 10), (65, y_cursor + 25)], fill=COLOR_RED)
        draw.text((85, y_cursor), title, fill=COLOR_DARK, font=font_body_bold)
        draw.text((85, y_cursor + 40), desc, fill="#555555", font=font_body)
        y_cursor += 90

    y_cursor += 40

    # --- Streaming Logos Section ---
    draw.text((50, y_cursor), "Velg ditt innhold (inkludert i poengpotten):", fill=COLOR_DARK, font=font_body_bold)
    y_cursor += 60
    
    # Helper to draw stylized brand logos
    def draw_brand_logo(draw, x, y, name):
        w, h = 180, 80
        
        # Defaults
        bg_col = "#DDDDDD"
        txt_col = "#000000"
        text_content = name
        
        if name == "Netflix":
            bg_col = "#000000"
            txt_col = "#E50914"
            text_content = "NETFLIX"
        elif name == "HBO MAX":
            bg_col = "#240E39" # Dark purple
            txt_col = "#FFFFFF"
        elif name == "Viaplay":
            bg_col = "#141414"
            txt_col = "#FFFFFF"
        elif name == "TV2 Play":
            bg_col = "#FFFFFF"
            txt_col = "#E3000F" # Red text
        elif name == "Sky":
            bg_col = "#FFFFFF" # Sky gradient hard to do, use white
            txt_col = "#000000" # Sky logo usually multicolored or black
            text_content = "SkyShowtime"
        elif name == "V sport":
            bg_col = "#141414"
            txt_col = "#FFFFFF"
        elif name == "TV2 Sport":
            bg_col = "#FFFFFF"
            txt_col = "#E3000F"
            
        # Draw Box
        draw.rounded_rectangle([(x, y), (x + w, y + h)], radius=10, fill=bg_col, outline="#CCCCCC", width=1)
        
        # Draw Text
        # Center text
        f = get_font(28, True)
        if name == "Sky": f = get_font(22, True) # Smaller for longer name
            
        bbox = draw.textbbox((0, 0), text_content, font=f)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]
        
        # Add special V for Viaplay/Vsport if needed, but text is fine for now
        draw.text((x + (w - text_w)/2, y + (h - text_h)/2 - 4), text_content, fill=txt_col, font=f)

    logo_names = ["TV2 Play", "HBO MAX", "Netflix", "Viaplay", "V sport", "TV2 Sport", "Sky"]
    
    logo_start_x = 50
    logo_x = logo_start_x
    logo_y = y_cursor
    
    for i, name in enumerate(logo_names):
        if logo_x + 200 > width:
            logo_x = logo_start_x
            logo_y += 100
        draw_brand_logo(draw, logo_x, logo_y, name)
        logo_x += 210
    
    y_cursor = logo_y + 120
    
    # Link
    draw.text((50, y_cursor), "Full oversikt: altibox.no/privat/tv/innholdsoversikt/", fill=COLOR_RED, font=font_small)
    y_cursor += 80

    # --- Pricing / Offer Box (Revised) ---
    box_height = 420
    draw.rectangle([(0, y_cursor), (width, y_cursor + box_height)], fill=COLOR_RED)
    
    box_y = y_cursor + 40
    
    # Left: Price
    draw.text((50, box_y), "KAMPANJE", fill="#FFDD00", font=font_body_bold) # Yellow pop
    draw.text((50, box_y + 50), "899,-", fill=COLOR_WHITE, font=font_price_lg)
    draw.text((380, box_y + 130), "/mnd", fill=COLOR_WHITE, font=font_title)
    
    # "0,- Etablering" Highlight
    draw.rounded_rectangle([(50, box_y + 200), (350, box_y + 270)], radius=35, fill=COLOR_WHITE)
    draw.text((75, box_y + 215), "0,- Etablering", fill=COLOR_RED, font=font_body_bold)
    
    # Right: Comparison & CTA
    right_x = 550
    draw.text((right_x, box_y + 60), "Ordinær pris:", fill=COLOR_WHITE, font=font_body)
    draw.text((right_x, box_y + 100), "1339,- /mnd", fill=COLOR_WHITE, font=font_title)
    draw.line([(right_x - 10, box_y + 125), (right_x + 400, box_y + 125)], fill=COLOR_WHITE, width=4)
    
    # CTA Button Effect
    button_y = box_y + 200
    draw.rounded_rectangle([(right_x, button_y), (right_x + 400, button_y + 120)], radius=20, fill="#FFFFFF", outline="#FFDD00", width=4)
    draw.text((right_x + 80, button_y + 35), "BESTILL NÅ", fill=COLOR_RED, font=get_font(45, True))

    y_cursor += box_height

    # --- Footer (Cleaned up) ---
    footer_y = y_cursor
    draw.rectangle([(0, footer_y), (width, height)], fill=COLOR_DARK)
    
    footer_text_y = footer_y + 50
    draw.text((50, footer_text_y), "Vilkår gjelder.", fill=COLOR_WHITE, font=font_small)
    draw.text((50, footer_text_y + 35), "Se vilkår på: https://altibox.no/vilkar", fill=COLOR_WHITE, font=font_small)
    
    # No more "nye kunder" text here as requested.

    # Save
    try:
        img.save(filename)
        print(f"Flyer created: {filename}")
    except OSError:
        # Fallback to current dir if permission denied
        local_filename = "viken_promo_flyer.png"
        img.save(local_filename)
        print(f"Flyer created in local folder (could not save to Downloads): {local_filename}")

if __name__ == "__main__":
    create_flyer()

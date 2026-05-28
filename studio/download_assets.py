import os
import urllib.request
import ssl

def download_logos():
    if not os.path.exists("assets"):
        os.makedirs("assets")

    logos = {
        "netflix.png": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/08/Netflix_2015_logo.svg/800px-Netflix_2015_logo.svg.png",
        "hbo_max.png": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/HBO_Max_Logo.svg/800px-HBO_Max_Logo.svg.png",
        "viaplay.png": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Viaplay_logo.svg/800px-Viaplay_logo.svg.png",
        "tv2play.png": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/TV_2_Play_logo_2021.svg/800px-TV_2_Play_logo_2021.svg.png",
        "skyshowtime.png": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/SkyShowtime_logo.svg/800px-SkyShowtime_logo.svg.png",
        "tv2sport.png": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/TV_2_Sport_1_logo.svg/800px-TV_2_Sport_1_logo.svg.png",
        "vsport.png": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/V_Sport_logo_%282020%29.svg/800px-V_Sport_logo_%282020%29.svg.png" 
    }

    # Create unverified context to avoid SSL errors in some environments
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    
    opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))
    opener.addheaders = [('User-agent', 'Mozilla/5.0')]
    urllib.request.install_opener(opener)

    for filename, url in logos.items():
        print(f"Downloading {filename}...")
        try:
            urllib.request.urlretrieve(url, f"assets/{filename}")
            print(f"Success: {filename}")
        except Exception as e:
            print(f"Failed to download {filename}: {e}")

if __name__ == "__main__":
    download_logos()

import os
import sys
import urllib.request
from fontTools import subset
from fontTools.ttLib import TTFont

SOURCE_WOFF2_URL = "https://fonts.gstatic.com/s/googlesansflex/v22/t5s6IQcYNIWbFgDgAAzZ34auoVyXkJCOvp3SFWJbN5hF8Ju1x6sKCyp0l9sI40swNJwInycYAJzz0m7kJ4qFQOJBOjLvDSndo0SKMpKSTzwliVdHAy4xyRg2.woff2"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "public", "fonts")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "google-sans-flex.woff2")
TEMP_RAW = os.path.join(OUTPUT_DIR, "_raw_google_sans.woff2")

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print(f"Downloading Google Sans Flex variable font...")
    req = urllib.request.Request(
        SOURCE_WOFF2_URL,
        headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    )
    with urllib.request.urlopen(req) as response:
        raw_data = response.read()

    with open(TEMP_RAW, "wb") as f:
        f.write(raw_data)
    
    raw_size = len(raw_data)
    print(f"Downloaded raw font: {raw_size:,} bytes ({raw_size / 1024:.2f} KB)")

    options = subset.Options()
    options.flavor = "woff2"
    options.hinting = False
    options.desubroutinize = True
    options.layout_features = ["kern", "liga", "calt", "tnum", "pnum"]
    options.name_IDs = [1, 2, 4, 6]
    options.name_languages = ["*"]
    options.glyph_names = False

    unicodes = (
        "U+0020-007E,"
        "U+00A0-00FF,"
        "U+2000-206F,"
        "U+20A0-20CF,"
        "U+2122,"
        "U+2190-2193,"
        "U+2212"
    )

    print("Subsetting and compressing into WOFF2...")
    font = subset.load_font(TEMP_RAW, options)
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=subset.parse_unicodes(unicodes))
    subsetter.subset(font)
    subset.save_font(font, OUTPUT_FILE, options)
    font.close()

    if os.path.exists(TEMP_RAW):
        try:
            os.remove(TEMP_RAW)
        except Exception:
            pass

    opt_size = os.path.getsize(OUTPUT_FILE)
    saved_bytes = raw_size - opt_size
    reduction = (saved_bytes / raw_size) * 100

    print("\nOptimization Complete!")
    print(f"Output File: {OUTPUT_FILE}")
    print(f"Original Size:  {raw_size:,} bytes ({raw_size / 1024:.2f} KB)")
    print(f"Optimized Size: {opt_size:,} bytes ({opt_size / 1024:.2f} KB)")
    print(f"Savings:        {saved_bytes:,} bytes ({reduction:.1f}% reduction)")

    check_font = TTFont(OUTPUT_FILE)
    if "fvar" in check_font:
        for axis in check_font["fvar"].axes:
            print(f"Variable Axis:  '{axis.axisTag}' (min: {axis.minValue}, default: {axis.defaultValue}, max: {axis.maxValue})")
    check_font.close()

if __name__ == "__main__":
    main()

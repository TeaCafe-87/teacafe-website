"""Build the calligraphy title font (dist/assets/fonts/teacafe-shufa.woff2).

Source: 莫大毛筆字體 Bakudai (Taiwan glyphs), https://github.com/max32002/bakudaifont, SIL OFL 1.1,
based on 衡山毛筆フォント by 青柳衡山. "Bakudai" is a Reserved Font Name, so this subset is renamed
"TeaCafe Shufa"; the copyright notice is kept in the font and in dist/assets/fonts/LICENSE-teacafe-shufa.txt.

The subset holds only the characters of the site's fixed titles (h1, home scene titles and marks,
seals, step numerals, the settings title), so it stays small. Re-run after changing a title:

    pip install fonttools brotli
    python tools/build-title-font.py path/to/bakudaifont/tw/Bakudai-Bold.ttf
"""
import glob
import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
OUT = DIST / "assets" / "fonts" / "teacafe-shufa.woff2"
FAMILY = "TeaCafe Shufa"
# Titles set in JavaScript rather than HTML, plus the seal-pass glyphs.
EXTRA = "設定拓印已茶咖暖居山居"

PATTERNS = [
    r"<h1[^>]*>(.*?)</h1>",
    r'<h2 class="scene-title">(.*?)</h2>',
    r'<h2 class="scene-heading"[^>]*>(.*?)</h2>',
    r'<span class="scene-mark"[^>]*>(.*?)</span>',
    r'class="(?:ink|cta)-seal"[^>]*>(.*?)<',
    r'class="j-no"[^>]*>(.*?)<',
    r'class="ink-pass-seal"[^>]*><i>(.*?)</i>',
]


def title_text():
    text = EXTRA
    for page in glob.glob(str(DIST / "*.html")):
        html = Path(page).read_text(encoding="utf-8")
        for pattern in PATTERNS:
            for hit in re.findall(pattern, html, re.S):
                text += re.sub(r"<[^>]+>", "", hit)
    return "".join(sorted({c for c in text if not c.isspace()}))


def main(source):
    chars = title_text()
    font = TTFont(source)
    missing = [c for c in chars if ord(c) not in font.getBestCmap() and ord(c) > 0x2E80]
    if missing:
        sys.exit("source font lacks: " + "".join(missing))
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=chars)
    subsetter.subset(font)
    # OFL: a Modified Version may not use the Reserved Font Name "Bakudai".
    for record in font["name"].names:
        if record.nameID in (1, 4, 16):
            record.string = FAMILY
        elif record.nameID == 6:
            record.string = FAMILY.replace(" ", "")
        elif record.nameID == 3:
            record.string = FAMILY + " subset"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = "woff2"
    font.save(OUT)
    print(f"{OUT.relative_to(ROOT)}: {len(chars)} characters, {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])

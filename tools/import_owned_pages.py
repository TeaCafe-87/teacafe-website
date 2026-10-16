"""Snapshot the owner's career guide and market content into the TeaCafe shell.

Run deliberately when the source sites change; the published pages never import
scripts from those sites at runtime. Their live market data uses our Pages proxy.
"""
from pathlib import Path
from urllib.request import Request, urlopen
import re

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"

def fetch(url):
    with urlopen(Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; TeaCafeSiteImporter/1.0)"}), timeout=20) as response:
        return response.read()

def text(url):
    return fetch(url).decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")

def between(source, start, end):
    return source.split(start, 1)[1].split(end, 1)[0]

def shell(title, description, slug, inner, scripts="", extra_css=""):
    return f'''<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="{description}"><title>{title}｜TeaCafe 茶咖暖居</title>
<link rel="canonical" href="https://teacafe.xyz/{slug}.html"><link rel="icon" href="/image/server_icon.png" type="image/png">
<link rel="stylesheet" href="/assets/css/styles.css?v=20261017"><link rel="stylesheet" href="/assets/css/community.css?v=20261017">
<link rel="stylesheet" href="/assets/css/integrations.css?v=20261017">{extra_css}</head>
<body class="{slug}-page"><div data-header></div><main class="page"><div class="integration-page">{inner}</div></main><div data-footer></div>
<script src="/assets/js/app.js?v=20261017"></script>{scripts}</body></html>'''

career_base = "https://tea-coffee-career-guide.easonn-u.chatgpt.site/"
career = text(career_base)
career_main = between(career, "<main>", "</main>").replace('class="hero"', 'class="career-hero"')
career_main = career_main.replace('id="builder"></section>', 'id="builder"></section>')
career_main = career_main.replace('TEAPROFESSIONS ／ 職業生活指南', '茶咖暖居 ／ 職業生活指南')
career_script = between(career, "</footer><script>", "</script>")
(DIST / "assets/js/careers.js").write_text(career_script, encoding="utf-8")
for filename in ("block-models.js", "structures.js"):
    content = text(career_base + filename)
    if filename == "structures.js":
        content = content.replace("'textures/'+", "'/assets/careers/textures/'+")
    (DIST / "assets/js" / filename).write_text(content.rstrip() + "\n", encoding="utf-8")
(DIST / "assets/css/structures.css").write_text(text(career_base + "structures.css"), encoding="utf-8")
models = (DIST / "assets/js/block-models.js").read_text(encoding="utf-8")
textures = set(re.findall(r'"texture":"([^"]+)"', models))
texture_dir = DIST / "assets/careers/textures"
texture_dir.mkdir(parents=True, exist_ok=True)
for texture in textures:
    name = texture.replace("/", "_") + ".png"
    path = texture_dir / name
    if not path.exists():
        path.write_bytes(fetch(career_base + "textures/" + name))
career_inner = '<div class="integration-back"><a class="mc-button secondary" href="/wiki.html">← 回到 Wiki</a></div><div class="career-guide">' + career_main + '</div>'
(DIST / "careers.html").write_text(shell("職業生活指南", "五種職業的選職、引導、設備搭建與升級指南。", "careers", career_inner,
    '<script src="/assets/js/careers.js?v=1"></script><script src="/assets/js/block-models.js?v=1"></script><script src="/assets/js/structures.js?v=1"></script>',
    '<link rel="stylesheet" href="/assets/css/structures.css?v=1">'), encoding="utf-8")

market = text("https://stock.teacafe.xyz/")
market_main = between(market, "<main>", "</main>")
market_script = between(market, "<script>", "</script>")
market_script = market_script.replace("refresh=d.refreshSeconds*1000", "refresh=Math.max(5000,Number(d.refreshSeconds||5)*1000)")
(DIST / "assets/js/market.js").write_text(market_script, encoding="utf-8")
market_inner = '<div class="integration-back"><a class="mc-button secondary" href="/wiki.html">← 回到 Wiki</a></div><div class="market-dashboard">' + market_main + '</div>'
(DIST / "market.html").write_text(shell("月映茶行即時行情", "查看月映茶行的價格、K 棒、市場資金池與最近成交。", "market", market_inner,
    '<script src="/assets/js/market.js?v=1"></script>'), encoding="utf-8")
print(f"Imported career guide, {len(textures)} Minecraft textures, and market dashboard")

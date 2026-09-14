#!/usr/bin/env python3
"""public/ klasöründen GitHub Pages uyumlu docs/ üretir.

- Mutlak varlık yollarını göreli yapar (proje sayfası /YolPano/ altında çalışsın)
- local-api.js shim'ini ekler (tarayıcı içi backend)
- Statik mod bilgi şeridi ekler
"""
import io, os, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
DOCS = os.path.join(ROOT, 'docs')

shutil.rmtree(DOCS, ignore_errors=True)
for sub in ('css', 'js'):
    os.makedirs(os.path.join(DOCS, sub), exist_ok=True)

for rel in ['css/app.css', 'js/provinces.js', 'js/app.js', 'js/local-api.js', 'logo.svg', 'manifest.webmanifest']:
    shutil.copy2(os.path.join(PUB, rel), os.path.join(DOCS, rel))

html = io.open(os.path.join(PUB, 'index.html'), encoding='utf-8').read()
html = html.replace('href="/logo.svg"', 'href="logo.svg"')
html = html.replace('href="/manifest.webmanifest"', 'href="manifest.webmanifest"')
html = html.replace('href="/css/app.css"', 'href="css/app.css"')
html = html.replace('<script src="/js/provinces.js"></script>',
                    '<script src="js/provinces.js"></script>\n<script src="js/local-api.js"></script>')
html = html.replace('<script src="/js/app.js"></script>', '<script src="js/app.js"></script>')
html = html.replace('<body>', '''<body>
<div style="background:#0b1f26;color:#9dc3bd;font:12.5px/1.5 system-ui,sans-serif;text-align:center;padding:7px 12px">Statik demo (github.io): veriler yalnızca bu tarayıcıda saklanır. Çok kullanıcılı canlı sürüm için README'deki sunucu kurulumuna bakın.</div>''', 1)

io.open(os.path.join(DOCS, 'index.html'), 'w', encoding='utf-8').write(html)
print('docs/ üretildi:', sorted(os.listdir(DOCS)))

/**
 * Yolpano — GitHub Pages (statik) modu testi
 * docs/ klasörünü statik sunucuyla açıp Chromium ile doğrular.
 * Önce:  python3 scripts/build_static.py
 */
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright-core');

const PORT = 3951;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (e ? ' → ' + e : '')); } };

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--directory', path.join(ROOT, 'docs')], { stdio: 'ignore' });
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  try {
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.waitForSelector('.post', { timeout: 8000 });
    ok('statik modda ilanlar render oldu', (await page.locator('.post').count()) >= 8);
    ok('statik bilgi şeridi var', (await page.textContent('body')).includes('Statik demo'));
    ok('canlı rozet bağlı (SSE sahtesi)', await page.locator('#liveDot:not(.off)').count() === 1);

    // ilan ver
    await page.click('#topPostBtn');
    await page.waitForTimeout(300);
    await page.click('#catPick button[data-cat="bos_arac"]');
    await page.fill('#cFrom', 'Gaziantep');
    await page.fill('#cTo', 'İstanbul');
    await page.fill('#cText', 'Gaziantep’ten İstanbul yönüne aracımız boş, tam ev veya parça eşya alırız.');
    await page.fill('#cName', 'Statik Demo Nakliyat');
    await page.fill('#cPhone', '0532 111 22 33');
    await page.click('#publishBtn');
    await page.waitForTimeout(900);
    const first = await page.locator('.post').first().textContent();
    ok('ilan localStorage üzerinden yayınlandı', first.includes('Statik Demo Nakliyat'), first.slice(0, 50));

    // kalıcılık: sayfa yenilenince ilan durmalı
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.post');
    const after = await page.locator('.post').first().textContent();
    ok('yenilemeden sonra veri kalıcı', after.includes('Statik Demo Nakliyat'), after.slice(0, 50));

    // hesaplayıcı
    await page.goto(BASE + '/#/hesapla', { waitUntil: 'load' });
    await page.waitForTimeout(700);
    ok('fiyat tahmini statik modda çalışıyor', (await page.textContent('#calcOut')).includes('₺'));

    // numara açma
    await page.goto(BASE + '/#/', { waitUntil: 'load' });
    await page.waitForSelector('.post');
    await page.locator('.post').nth(1).locator('.post-link').click();
    await page.waitForSelector('.modal');
    const rv = page.locator('.modal [data-act="reveal"]').first();
    if (await rv.count()) { await rv.click(); await page.waitForTimeout(500); }
    ok('numara statik modda açılıyor', (await page.locator('.modal .phone-reveal b').count()) > 0);

    ok('konsol/sayfa hatası yok', errs.length === 0, errs.slice(0, 2).join(' | '));
  } catch (e) {
    fail++;
    console.log('!! statik test hatası: ' + e.message);
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(`\n=== ${pass} başarılı, ${fail} başarısız ===`);
  process.exit(fail ? 1 : 0);
})();

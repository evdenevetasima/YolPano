/**
 * Yolpano — arayüz (UI) testi: gerçek Chromium ile uçtan uca
 * Çalıştırma:  npm i -D playwright-core && node test/ui.test.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const PORT = 3933;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
};

(async () => {
  const dbFile = path.join(ROOT, 'data', 'db.json');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const server = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), YOLPANO_QUIET: '1' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '';
  server.stdout.on('data', d => log += d);
  server.stderr.on('data', d => log += d);

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));

  try {
    // sunucuyu bekle
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch(BASE + '/api/stats'); if (r.ok) break; } catch (_) {}
      await new Promise(r => setTimeout(r, 200));
    }

    console.log('\n[A] Ana sayfa');
    // Önceki çalıştırmalardan kalan kotaları sıfırla (test deterministik kalsın)
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.evaluate(() => localStorage.clear());

    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.waitForSelector('.post', { timeout: 8000 });
    ok('başlık render oldu', (await page.textContent('h1')).includes('tek panoda'));
    const cardCount = await page.locator('.post').count();
    ok('ilan kartları listelendi', cardCount >= 10, 'kart=' + cardCount);
    ok('hero istatistiği doldu', !((await page.textContent('#todayCount')).includes('—')));
    ok('canlı akış bağlandı', await page.locator('#liveDot:not(.off)').count() === 1);
    ok('kategori sekmeleri var', (await page.locator('#catTabs .tab').count()) === 7);
    ok('il ızgarası 81 düğme', (await page.locator('.province-grid button').count()) === 81);
    ok('kart içinde mesafesi hesaplanmış rota var', (await page.locator('.route .km').count()) > 0);

    console.log('\n[B] Filtreleme + arama');
    await page.click('#catTabs .tab[data-cat="asansor"]');
    await page.waitForTimeout(500);
    let tags = await page.locator('.post .cat-tag').allTextContents();
    ok('kategori filtresi arayüzde çalıştı', tags.length > 0 && tags.every(t => t.trim() === 'Asansör'), tags.slice(0, 3).join('|'));
    await page.click('#catTabs .tab[data-cat="all"]');
    await page.waitForTimeout(400);

    await page.fill('#fromInput', 'İstanbul');
    await page.fill('#toInput', 'Ankara');
    await page.waitForTimeout(900);
    ok('rota mesafesi göründü', (await page.textContent('#routeMeta')).includes('km'), await page.textContent('#routeMeta'));
    const rl = await page.textContent('#resultline');
    ok('sonuç satırı rotayı gösteriyor', rl.includes('rotası'), rl);

    await page.fill('#globalSearch', 'asansör');
    await page.waitForTimeout(700);
    const marked = await page.locator('.post-text mark').count();
    ok('arama sonuçları vurgulandı', marked > 0, 'mark=' + marked);
    await page.fill('#globalSearch', '');
    await page.click('[data-act="clear-route"]');
    await page.waitForTimeout(600);

    console.log('\n[C] İlan verme');
    await page.click('#topPostBtn');
    await page.waitForTimeout(400);
    ok('besteci açıldı', await page.locator('#composer:not(.collapsed)').count() === 1);
    await page.click('#catPick button[data-cat="yuk_is"]');
    await page.fill('#cFrom', 'Gaziantep');
    await page.fill('#cTo', 'İzmir');
    await page.fill('#cText', 'Gaziantep Şahinbey’den İzmir Bornova’ya 2+1 ev eşyası taşınacak, 3. kat asansörlü.');
    await page.fill('#cName', 'Arena Test Nakliyat');
    await page.fill('#cPhone', '0532 987 65 43');
    await page.fill('#cCity', 'Gaziantep');
    const countTxt = await page.textContent('#cCount');
    ok('karakter sayacı çalışıyor', Number(countTxt) > 25, 'sayı=' + countTxt);
    await page.click('#publishBtn');
    await page.waitForTimeout(1200);
    ok('başarı bildirimi çıktı', (await page.locator('.toast.ok').count()) > 0);
    await page.waitForTimeout(1200);   // akış yeniden yüklensin
    const firstCard = await page.locator('.post').first().textContent();
    ok('yeni ilan akışın başında', firstCard.includes('Arena Test Nakliyat'), firstCard.slice(0, 60));
    ok('rota kartta görünüyor', (await page.locator('.post').first().locator('.route .city').first().textContent()).includes('Gaziantep'));

    console.log('\n[D] İlan detayı + iletişim + mesaj');
    const target = page.locator('.post', { hasText: 'Kervan Yol Taşımacılık' }).first();
    await target.locator('.post-link').click();
    await page.waitForSelector('.modal', { timeout: 6000 });
    ok('detay penceresi açıldı', (await page.locator('.modal').count()) === 1);
    ok('mesajlaşma alanı var', (await page.locator('#chat').count()) === 1);
    const revealBtn = page.locator('.modal [data-act="reveal"]').first();
    if (await revealBtn.count()) {
      await revealBtn.click();
      await page.waitForTimeout(900);
      ok('numara açıldı ve görünüyor', (await page.locator('.modal .phone-reveal b').count()) > 0);
      ok('numara açma bildirimi çıktı', (await page.locator('.toast.ok').count()) > 0);
    } else {
      ok('numara zaten görünür (kendi ilanı/Altın üye)', (await page.locator('.modal .phone-reveal b').count()) > 0);
    }
    await page.fill('#msgText', 'Merhaba, bu hafta sonu için uygun musunuz?');
    await page.click('[data-act="send"]');
    await page.waitForTimeout(600);
    ok('mesaj balonu eklendi', (await page.locator('#chat .bubble.me').count()) > 0);
    await page.waitForTimeout(3200);
    ok('karşı taraftan yanıt geldi (canlı SSE)', (await page.locator('#chat .bubble:not(.me)').count()) > 0);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    ok('pencere kapandı', (await page.locator('.modal').count()) === 0);

    console.log('\n[E] Fiyat tahmini');
    await page.click('a[href="#/hesapla"]');
    await page.waitForTimeout(900);
    await page.fill('#kFrom', 'Antalya');
    await page.fill('#kTo', 'Trabzon');
    await page.click('#presetPick [data-preset="3+1"]');
    await page.waitForTimeout(700);
    const estTxt = await page.textContent('#calcOut');
    ok('tahmin üretildi', estTxt.includes('₺'), estTxt.slice(0, 40));
    ok('mesafe gösterildi', estTxt.includes('km'));
    ok('kırılım listelendi', (await page.locator('#calcOut .kv').count()) >= 5);
    await page.click('#svcPick [data-svc="paketleme"]');
    await page.waitForTimeout(600);
    const estTxt2 = await page.textContent('#calcOut');
    ok('ek hizmet fiyatı değiştirdi', estTxt2 !== estTxt);

    console.log('\n[F] Kayıt + hesap + yönetim');
    await page.goto(BASE + '/#/kayitli', { waitUntil: 'load' });
    await page.waitForTimeout(700);
    ok('kayıtlı sayfası açıldı', (await page.textContent('.crumbs')).includes('Kayıtlı'));

    await page.goto(BASE + '/#/pano', { waitUntil: 'load' });
    await page.waitForTimeout(800);
    ok('hesap sayfası: firma kartı', (await page.textContent('body')).includes('Arena Test Nakliyat'));
    ok('kota çubukları var', (await page.locator('.bar').count()) === 3);
    ok('ilanlarım listelendi', (await page.locator('.post').count()) >= 1);

    await page.goto(BASE + '/#/', { waitUntil: 'load' });
    await page.waitForTimeout(400);

    console.log('\n[G] Canlı akış + rota alarmı');
    await page.fill('#alarmFrom', 'Gaziantep');
    await page.fill('#alarmTo', 'İstanbul');
    await page.click('[data-act="add-alarm"]');
    await page.waitForTimeout(700);
    const alarmTxt = await page.textContent('#alarmList');
    ok('rota alarmı listeye eklendi', alarmTxt.includes('Gaziantep') && alarmTxt.includes('İstanbul'), alarmTxt.slice(0, 60));
    // Ölçütsüz alarm reddedilmeli
    await page.fill('#alarmFrom', '');
    await page.fill('#alarmTo', '');
    await page.click('[data-act="add-alarm"]');
    await page.waitForTimeout(500);
    ok('ölçütsüz alarm reddedildi', (await page.locator('.toast.warn').count()) > 0);

    await page.evaluate(async () => {
      await fetch('/api/demo/gen', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-device': localStorage.getItem('yp.device') }, body: '{}' });
    });
    await page.waitForTimeout(1200);
    ok('yeni ilan bildirimi düştü', (await page.locator('.newpill').count()) === 1, await page.locator('.newpill').count().then(String));
    await page.click('.newpill');
    await page.waitForTimeout(900);
    ok('akış yenilendi', (await page.locator('.post').count()) > 0);

    console.log('\n[G2] Yönetim paneli');
    await page.goto(BASE + '/#/yonetim', { waitUntil: 'load' });
    await page.waitForTimeout(800);
    ok('metrik kartları var', (await page.locator('.metric').count()) >= 4);
    ok('son ilanlar tablosu dolu', (await page.locator('.table tbody tr').count()) >= 5);
    await page.click('[data-act="gen"]');
    await page.waitForTimeout(800);
    ok('demo üretim bildirimi', (await page.locator('.toast.ok').count()) > 0);

    console.log('\n[H] Mobil görünüm');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.waitForSelector('.post');
    ok('mobil alt menü görünür', await page.locator('.mobilenav').isVisible());
    ok('kartlar mobilde listeleniyor', (await page.locator('.post').count()) > 5);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok('yatay taşma yok', overflow <= 1, 'taşma=' + overflow);
    await page.setViewportSize({ width: 1366, height: 900 });

    console.log('\n[I] Konsol temizliği');
    const realErrors = consoleErrors.filter(e => !/favicon|EventSource|Failed to load resource: the server responded with a status of 404/.test(e));
    ok('konsol hatası yok', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
    ok('sayfa hatası yok', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

    await page.screenshot({ path: path.join(ROOT, 'test', 'ui-desktop.png'), fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.waitForSelector('.post');
    await page.screenshot({ path: path.join(ROOT, 'test', 'ui-mobile.png') });
    console.log('  (ekran görüntüleri test/ klasörüne kaydedildi)');
  } catch (e) {
    fail++;
    console.log('\n!! UI test hatası: ' + e.message);
    console.log('--- sunucu günlüğü ---\n' + log.slice(-1500));
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }

  console.log(`\n=== ${pass} başarılı, ${fail} başarısız ===`);
  process.exit(fail ? 1 : 0);
})();

/**
 * Yolpano — API uçtan uca testi
 * Sunucuyu ayrı bir portta, temiz bir veri klasörüyle başlatır ve gerçek HTTP
 * istekleriyle tüm kritik yolları dener:  node test/api.test.js
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 3919;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')); }
}
function eq(name, a, b) { ok(name, a === b, `beklenen ${JSON.stringify(b)}, gelen ${JSON.stringify(a)}`); }

async function req(url, opts = {}, device) {
  const r = await fetch(BASE + url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(device ? { 'x-device': device } : {}), ...(opts.headers || {}) }
  });
  const type = r.headers.get('content-type') || '';
  const body = type.includes('json') ? await r.json() : await r.text();
  return { status: r.status, body, headers: r.headers };
}

async function waitForServer(timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(BASE + '/api/stats'); if (r.ok) return true; } catch (_) {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Sunucu başlamadı');
}

(async () => {
  const dbFile = path.join(ROOT, 'data', 'db.json');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);   // temiz veriyle başla

  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: { ...process.env, PORT: String(PORT), YOLPANO_QUIET: '1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let serverLog = '';
  child.stdout.on('data', d => serverLog += d);
  child.stderr.on('data', d => serverLog += d);

  try {
    await waitForServer();
    const dev = 'test-device-1';

    console.log('\n[1] Başlangıç verisi');
    const bs = await req('/api/bootstrap', {}, dev);
    eq('bootstrap 200', bs.status, 200);
    eq('81 il yüklü', bs.body.provinces.length, 81);
    eq('6 kategori', bs.body.categories.length, 6);
    eq('3 üyelik kademesi', bs.body.tiers.length, 3);
    ok('örnek ilanlar hazır', bs.body.stats.activeListings >= 30, 'aktif: ' + bs.body.stats.activeListings);
    eq('yeni cihaz standart üye', bs.body.viewer.tier, 'standart');
    ok('ücretsiz model: haklar sınırsız', bs.body.viewer.quota.posts.limit >= 999,
      'limit=' + bs.body.viewer.quota.posts.limit);

    console.log('\n[2] Statik dosyalar');
    const home = await req('/');
    eq('index.html 200', home.status, 200);
    ok('HTML içinde marka var', String(home.body).includes('Yolpano'));
    eq('css 200', (await req('/css/app.css')).status, 200);
    eq('app.js 200', (await req('/js/app.js')).status, 200);
    eq('bilinmeyen dosya 404', (await req('/yok.js')).status, 404);
    // Node'un URL ayrıştırıcısı '/../x' yolunu '/x' olarak normalleştirir; iki durumda da
    // public/ dışındaki dosyaya erişilememeli.
    const trav1 = await req('/../server.js');
    const trav2 = await req('/..%2f..%2fetc%2fpasswd');
    ok('dizin dışına çıkış engelli', [403, 404].includes(trav1.status) && [403, 404].includes(trav2.status),
      `status=${trav1.status}/${trav2.status}`);
    ok('sunucu kodu sızmıyor', !String(trav1.body).includes('http.createServer'));

    console.log('\n[3] Rota + fiyat tahmini');
    const route = await req('/api/route?from=İstanbul&to=Ankara');
    ok('İstanbul-Ankara mesafesi makul (300-500 km)', route.body.km > 300 && route.body.km < 500, 'km=' + route.body.km);
    const est = await req('/api/estimate?from=İstanbul&to=Ankara&m3=32&floor=3&elevator=0');
    ok('tahmin toplamı pozitif', est.body.total > 0, JSON.stringify(est.body.total));
    ok('kırılım kalemleri var', est.body.breakdown.length >= 4, 'kalem=' + est.body.breakdown.length);
    ok('kat farkı eklendi', est.body.breakdown.some(b => b.label.includes('Kat farkı')));
    const estNoFloor = await req('/api/estimate?from=İstanbul&to=Ankara&m3=32&floor=0');
    ok('asansörlü/katsız daha ucuz', estNoFloor.body.total < est.body.total,
      `${estNoFloor.body.total} < ${est.body.total}`);
    const badRoute = await req('/api/estimate?from=Yokşehir&to=Ankara');
    ok('geçersiz il hata veriyor', !!badRoute.body.error, JSON.stringify(badRoute.body));

    console.log('\n[4] İlan oluşturma + doğrulama');
    const short = await req('/api/post', { method: 'POST', body: JSON.stringify({ category: 'bos_arac', from: 'İzmir', text: 'kısa' }) }, dev);
    ok('kısa metin reddedildi', !!short.body.error, JSON.stringify(short.body));
    const phone = await req('/api/post', { method: 'POST', body: JSON.stringify({ category: 'bos_arac', from: 'İzmir', to: 'Ankara', text: 'Aracım boş, beni arayın 0532 123 45 67 hemen.' }) }, dev);
    ok('metinde telefon reddedildi', !!phone.body.error, JSON.stringify(phone.body));
    const badCat = await req('/api/post', { method: 'POST', body: JSON.stringify({ category: 'olmayan', text: 'x'.repeat(40) }) }, dev);
    ok('geçersiz kategori reddedildi', !!badCat.body.error);
    const noRoute = await req('/api/post', { method: 'POST', body: JSON.stringify({ category: 'bos_arac', text: 'x'.repeat(40) }) }, dev);
    ok('rotasız boş araç reddedildi', !!noRoute.body.error);

    const created = await req('/api/post', {
      method: 'POST',
      body: JSON.stringify({
        category: 'yuk_is', from: 'Gaziantep', to: 'İstanbul',
        text: 'Gaziantep Şehitkamil’den İstanbul Ataşehir’e 2+1 ev eşyası taşınacak, 4. kat asansörsüz.',
        companyName: 'Test Nakliyat', phone: '0532 111 22 33', city: 'Gaziantep', about: 'Test firması'
      })
    }, dev);
    ok('ilan oluşturuldu', !!created.body.ok, JSON.stringify(created.body));
    const newId = created.body.post.id;
    ok('sahibe token verildi', typeof created.body.post.token === 'string' && created.body.post.token.length > 6);
    eq('kategori doğru', created.body.post.category, 'yuk_is');
    ok('mesafe hesaplandı', created.body.post.route && created.body.post.route.km > 500,
      JSON.stringify(created.body.post.route));
    ok('başlık büyük harfe çevrildi', created.body.post.from === 'Gaziantep');

    const mine = await req('/api/posts?mine=1', {}, dev);
    eq('ilanlarım listesinde 1 kayıt', mine.body.total, 1);

    // Regresyon: taze ilan, yüksek kademeli/eski ilanların üstüne çıkmalı
    const smart = await req('/api/posts?sort=smart&limit=3', {}, dev);
    eq('yeni ilan varsayılan akışta birinci', smart.body.items[0].id, newId);
    const someoneElse = (await req('/api/posts?limit=6', {}, dev)).body.items.filter(x => x.id !== newId)[0];
    const boosted = await req('/api/post/refresh', { method: 'POST', body: JSON.stringify({ id: someoneElse.id, token: 'tok_sahte' }) }, dev);
    ok('başkasının ilanı öne alınamaz', !!boosted.body.error);

    // "Öne al" hakkı kullanılan ilan akışın en üstüne oturmalı
    const second = await req('/api/post', {
      method: 'POST',
      body: JSON.stringify({ category: 'bos_arac', from: 'Konya', to: 'Ankara', text: 'Konya’dan Ankara yönüne aracımız boş geçiyor, parça eşya ve tam ev işi alabiliriz.' })
    }, dev);
    ok('ikinci ilan oluşturuldu', !!second.body.ok, JSON.stringify(second.body));
    const bump = await req('/api/post/refresh', { method: 'POST', body: JSON.stringify({ id: second.body.post.id, token: second.body.post.token }) }, dev);
    ok('öne alma hakkı kullanıldı', !!bump.body.ok, JSON.stringify(bump.body));
    const afterBoost = await req('/api/posts?limit=2', {}, dev);
    eq('öne alınan ilan akışın birincisi', afterBoost.body.items[0].id, second.body.post.id);
    ok('öne alınan ilan işaretli', afterBoost.body.items[0].boosted === true);

    console.log('\n[5] Numara açma + günlük kota');
    // Kendi ilanımız akıllı sıralamada en üste çıkabildiği için başka firmalara ait
    // ilanları açıkça seçiyoruz (kota testi deterministik olsun).
    const owned = (await req('/api/viewer', {}, dev)).body.ownedPosts;
    const others = (await req('/api/posts?limit=12', {}, dev)).body.items.filter(p => !owned.includes(p.id));
    ok('başkasına ait yeterli ilan var', others.length >= 5, 'adet=' + others.length);
    const rev = await req('/api/post/reveal', { method: 'POST', body: JSON.stringify({ id: others[0].id }) }, dev);
    ok('numara açıldı', /^\d{4} /.test(rev.body.phone || ''), JSON.stringify(rev.body));
    ok('ücretsiz: numara açma sınırsız', rev.body.left >= 999, 'left=' + rev.body.left);

    const rev2 = await req('/api/post/reveal', { method: 'POST', body: JSON.stringify({ id: others[1].id }) }, dev);
    ok('2. açma da başarılı (kota yok)', !!rev2.body.ok, JSON.stringify(rev2.body));

    const own = await req('/api/post/reveal', { method: 'POST', body: JSON.stringify({ id: newId }) }, dev);
    ok('kendi ilanında da sınırsız', own.body.left >= 999, 'left=' + own.body.left);
    ok('kendi ilanının numarası doğrudan görünüyor', /^\d{4} /.test(own.body.phone || ''), JSON.stringify(own.body));

    const rev3 = await req('/api/post/reveal', { method: 'POST', body: JSON.stringify({ id: others[2].id }) }, dev);
    ok('3. açma da başarılı', !!rev3.body.ok, JSON.stringify(rev3.body));

    const rev4 = await req('/api/post/reveal', { method: 'POST', body: JSON.stringify({ id: others[3].id }) }, dev);
    ok('4. açmada da kota hatası yok (tamamen ücretsiz)', !!rev4.body.ok && !rev4.body.error, JSON.stringify(rev4.body));

    console.log('\n[6] Kaydet, mesaj, şikâyet');
    const target = others[4];
    const sv = await req('/api/post/save', { method: 'POST', body: JSON.stringify({ id: target.id }) }, dev);
    eq('kaydedildi', sv.body.saved, true);
    const sv2 = await req('/api/post/save', { method: 'POST', body: JSON.stringify({ id: target.id }) }, dev);
    eq('tekrar tıklayınca kayıttan çıktı', sv2.body.saved, false);
    await req('/api/post/save', { method: 'POST', body: JSON.stringify({ id: target.id }) }, dev);
    const saved = await req('/api/posts?saved=1', {}, dev);
    eq('kayıtlı ilanlar 1', saved.body.total, 1);

    const msg = await req('/api/message', { method: 'POST', body: JSON.stringify({ postId: target.id, text: 'Merhaba, fiyat alabilir miyim?' }) }, dev);
    ok('mesaj gönderildi', !!msg.body.ok);
    const detail = await req('/api/post/' + target.id, {}, dev);
    ok('mesaj dizisinde görünüyor', detail.body.thread.some(m => m.text.includes('fiyat alabilir miyim')));
    ok('benzer ilanlar döndü', Array.isArray(detail.body.related));

    const rep = await req('/api/post/report', { method: 'POST', body: JSON.stringify({ id: target.id, reason: 'test' }) }, dev);
    eq('şikâyet sayacı 1', rep.body.flags, 1);

    console.log('\n[7] Rota alarmı');
    const alarm = await req('/api/alarm', { method: 'POST', body: JSON.stringify({ from: 'Gaziantep', to: 'İstanbul' }) }, dev);
    eq('alarm kuruldu', alarm.body.on, true);
    eq('alarm listesi 1', alarm.body.alarms.length, 1);
    const alarmOff = await req('/api/alarm', { method: 'POST', body: JSON.stringify({ from: 'Gaziantep', to: 'İstanbul' }) }, dev);
    eq('aynı alarm tekrar tıklayınca kapandı', alarmOff.body.on, false);

    console.log('\n[8] Sahiplik: öne alma, güncelleme, silme');
    // ücretsiz model: haklar sınırsız, kademe yükseltmeye gerek yok
    const tok = created.body.post.token;
    ok('sahibe token verildi (doğrulama)', typeof tok === 'string' && tok.length > 6, String(tok));
    const refresh = await req('/api/post/refresh', { method: 'POST', body: JSON.stringify({ id: newId, token: tok }) }, dev);
    ok('öne alma başarılı', !!refresh.body.ok, JSON.stringify(refresh.body));
    ok('öne alınan ilan güçlendirildi', refresh.body.post && refresh.body.post.boosted === true);
    const wrongToken = await req('/api/post/refresh', { method: 'POST', body: JSON.stringify({ id: newId, token: 'tok_sahte' }) }, dev);
    ok('sahte token reddedildi', !!wrongToken.body.error);

    const solved = await req('/api/post/update', { method: 'POST', body: JSON.stringify({ id: newId, token: tok, status: 'solved' }) }, dev);
    eq('iş tamamlandı işaretlendi', solved.body.post && solved.body.post.status, 'solved');

    const del = await req('/api/post/delete', { method: 'POST', body: JSON.stringify({ id: newId, token: tok }) }, dev);
    ok('ilan silindi', !!del.body.ok);
    const after = await req('/api/post/' + newId, {}, dev);
    eq('silinen ilan 404', after.status, 404);

    console.log('\n[9] Günlük ilan limiti');
    const d2 = 'test-device-2';
    let made = 0;
    for (let i = 0; i < 5; i++) {
      const r = await req('/api/post', {
        method: 'POST',
        body: JSON.stringify({ category: 'parca', from: 'Bursa', to: 'İzmir', text: 'Bursa’dan İzmir’e parça eşya seferimiz var, koli ve beyaz eşya alınır. Test ' + i })
      }, d2);
      if (r.body.ok) made++;
    }
    eq('ücretsiz: 5 ilanın tümü kabul edildi', made, 5);

    console.log('\n[10] Üyelik yükseltme');
    const up = await req('/api/tier', { method: 'POST', body: JSON.stringify({ tier: 'altin' }) }, d2);
    eq('Altın Pro aktif', up.body.tier, 'altin');
    const v = await req('/api/viewer', {}, d2);
    ok('altın kademe de ücretsiz/sınırsız', v.body.quota.posts.limit >= 999,
      'limit=' + v.body.quota.posts.limit);

    console.log('\n[11] Filtreleme ve sıralama');
    const catFilter = await req('/api/posts?cat=asansor&limit=40', {}, dev);
    ok('kategori filtresi çalışıyor', catFilter.body.items.every(p => p.category === 'asansor'),
      'adet=' + catFilter.body.items.length);
    const cityFilter = await req('/api/posts?city=Trabzon&limit=40', {}, dev);
    ok('şehir filtresi Trabzon ilanları', cityFilter.body.items.length > 0 && cityFilter.body.items.every(p =>
      [p.from, p.to, p.company.city].some(c => c && c.includes('Trabzon'))));
    const routeFilter = await req('/api/posts?from=İstanbul&to=İzmir&limit=40', {}, dev);
    ok('rota filtresi eşleşme döndürdü', routeFilter.body.items.length > 0, 'adet=' + routeFilter.body.items.length);
    const search = await req('/api/posts?q=asans%C3%B6r&limit=40', {}, dev);
    ok('arama sonuç döndürdü', search.body.items.length > 0, 'adet=' + search.body.items.length);
    // Varsayılan akış: "öne alınmış" ilanlar en üstte, kalanlar en yeni önce
    const feed = await req('/api/posts?limit=10', {}, dev);
    const boostedIdx = feed.body.items.map((p, i) => p.boosted ? i : -1).filter(i => i >= 0);
    ok('öne alınanlar akışın başında', boostedIdx.every(i => i === 0), 'indeksler=' + boostedIdx.join(','));
    const rest = feed.body.items.filter(p => !p.boosted).map(p => p.bumpedAt);
    ok('kalanlar en yeni önce sıralı', rest.every((t, i) => i === 0 || rest[i - 1] >= t), rest.slice(0, 4).join(','));
    const popular = await req('/api/posts?sort=popular&limit=5', {}, dev);
    const pop = popular.body.items.map(p => p.views + p.saves * 3);
    ok('popüler sıralaması azalan', pop.every((t, i) => i === 0 || pop[i - 1] >= t), pop.join(','));

    console.log('\n[12] Canlı akış (SSE) + demo üretim');
    const ctrl = new AbortController();
    const sseRes = await fetch(BASE + '/api/stream', { headers: { 'x-device': dev }, signal: ctrl.signal });
    eq('SSE content-type', sseRes.headers.get('content-type'), 'text/event-stream');
    const reader = sseRes.body.getReader();
    const dec = new TextDecoder();
    let got = '';
    const readTask = (async () => {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        got += dec.decode(value);
        if (got.includes('event: post')) break;
      }
    })();
    await new Promise(r => setTimeout(r, 200));
    const gen = await req('/api/demo/gen', { method: 'POST', body: JSON.stringify({}) }, dev);
    ok('demo ilan üretildi', !!gen.body.ok, JSON.stringify(gen.body));
    await readTask;
    ok('SSE üzerinden yeni ilan olayı geldi', got.includes('event: post'), got.slice(0, 120));
    ctrl.abort();

    console.log('\n[13] Kalıcılık');
    await new Promise(r => setTimeout(r, 400));   // saveDb 120 ms debounce ile yazar
    ok('db.json oluştu', fs.existsSync(dbFile));
    const raw = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
    ok('üretilen ilan diske yazıldı', raw.posts.some(p => p.id === gen.body.post.id));

    console.log('\n[14] Güvenlik');
    const xss = await req('/api/post', {
      method: 'POST',
      body: JSON.stringify({ category: 'depo', from: 'Ankara', text: '<script>alert(1)</script> Ankara’da kapalı depolama alanı müsait, aylık kiralama yapılır.' })
    }, 'test-device-3');
    ok('HTML etiketleri temizlendi', !xss.body.post.text.includes('<script'), xss.body.post && xss.body.post.text);

  } catch (e) {
    fail++;
    console.log('\n!! Test hatası: ' + e.message);
    console.log('--- sunucu günlüğü ---\n' + serverLog.slice(-2000));
  } finally {
    child.kill('SIGTERM');
  }

  console.log(`\n=== ${pass} başarılı, ${fail} başarısız ===`);
  process.exit(fail ? 1 : 0);
})();

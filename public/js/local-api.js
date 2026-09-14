/* =============================================================
   Yolpano — Statik (GitHub Pages) modu
   Sunucu olmadan çalışır: /api/* isteklerini tarayıcı içinde
   localStorage tabanlı bir mini-backend ile yanıtlar.
   Gerçek çok kullanıcılı sürüm için Node sunucusuna bakın.
   ============================================================= */
(function () {
  'use strict';
  if (window.__YP_STATIC__) return;
  window.__YP_STATIC__ = true;

  const LS_DB = 'yp.staticdb.v1';

  /* -------------------------------------------------- sabitler */
  const CATEGORIES = [
    { id: 'bos_arac', label: 'Boş Araç', short: 'Boş', icon: 'truck', desc: 'Aracın boş, yük/iş arıyorsun. Güzergâh belirt.', needsRoute: true, color: 'teal' },
    { id: 'yuk_is', label: 'Yük / İş', short: 'Yük', icon: 'box', desc: 'Taşınacak işin var, araç arıyorsun.', needsRoute: true, color: 'amber' },
    { id: 'asansor', label: 'Asansör', short: 'Asansör', icon: 'crane', desc: 'Modüler asansör kiralama / operatörlü asansör ilanı.', needsRoute: false, color: 'sky' },
    { id: 'depo', label: 'Depolama', short: 'Depo', icon: 'warehouse', desc: 'Eşya depolama alanı, m² ve süre bilgisiyle.', needsRoute: false, color: 'violet' },
    { id: 'parca', label: 'Parça Eşya', short: 'Parça', icon: 'package', desc: 'Az parça / koli taşımacılığı, aynı güzergâhta birleştirme.', needsRoute: true, color: 'rose' },
    { id: 'ekip', label: 'Ekip / Usta', short: 'Ekip', icon: 'users', desc: 'Yükleme-boşaltma ekibi, montaj ustası, hamal desteği.', needsRoute: false, color: 'slate' }
  ];
  const PRICING = { base: 3200, perKm: 26, perM3: 950, perFloorNoElevator: 450, longHaulDiscount: 0.82, longHaulKm: 400, insurance: 0.02, vat: 0.2, volumePresets: { '1+1': 22, '2+1': 32, '3+1': 45, '4+1': 58, 'Ofis': 50, 'Parça': 8 } };
  const SERVICE_OPTIONS = [
    { id: 'paketleme', label: 'Paketleme / ambalaj dahil', mult: 1.12 },
    { id: 'sigorta', label: 'Genişletilmiş sigorta', mult: 1.06 },
    { id: 'montaj', label: 'Mobilya sökme-takma', mult: 1.08 },
    { id: 'gece', label: 'Gece / hafta sonu taşıma', mult: 1.1 },
    { id: 'asansor', label: 'Dış cephe asansörü', mult: 1.05 }
  ];
  const HOT_ROUTES = [['İstanbul', 'Ankara'], ['İstanbul', 'İzmir'], ['Ankara', 'Antalya'], ['İzmir', 'Gaziantep'], ['Bursa', 'Diyarbakır'], ['İstanbul', 'Trabzon']];

  /* -------------------------------------------------- yardımcılar */
  const trLower = s => String(s || '').toLocaleLowerCase('tr-TR');
  const norm = s => trLower(s).replace(/[çğıöşü]/g, c => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }[c]));
  const titleCase = s => trLower(s).replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('tr-TR'));
  const uid = p => p + Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-4);
  const P = () => window.PROVINCES || [];
  const cityOf = n => P().find(p => norm(p.name) === norm(n || ''));

  function routeInfo(from, to) {
    const a = cityOf(from), b = cityOf(to);
    if (!a || !b) return null;
    const R = 6371, rad = d => d * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    const km = Math.round(2 * R * Math.asin(Math.sqrt(h)) * 1.25);
    return { km, hours: Math.round((km / 72) * 10) / 10, from: a.name, to: b.name };
  }
  function estimatePrice(q) {
    const r = routeInfo(q.from, q.to);
    if (!r) return null;
    const volume = Number(q.m3) > 0 ? Number(q.m3) : 32;
    let perKm = PRICING.perKm;
    if (r.km > PRICING.longHaulKm) perKm *= PRICING.longHaulDiscount;
    let total = PRICING.base + r.km * perKm + volume * PRICING.perM3;
    const floors = Math.max(0, Number(q.floor) || 0);
    const breakdown = [
      { label: 'Yükleme & organizasyon', value: PRICING.base },
      { label: `Mesafe (${r.km} km × ${Math.round(perKm)} ₺)`, value: Math.round(r.km * perKm) },
      { label: `Hacim (${volume} m³ × ${PRICING.perM3} ₺)`, value: volume * PRICING.perM3 }
    ];
    if (floors > 0 && q.elevator !== '1') {
      const v = floors * PRICING.perFloorNoElevator;
      total += v; breakdown.push({ label: `Kat farkı (${floors} kat, asansörsüz)`, value: v });
    }
    (q.services || '').split(',').filter(Boolean).forEach(id => {
      const o = SERVICE_OPTIONS.find(x => x.id === id);
      if (!o) return;
      const add = Math.round(total * (o.mult - 1));
      total += add; breakdown.push({ label: o.label, value: add });
    });
    const vat = Math.round(total * PRICING.vat), ins = Math.round(total * PRICING.insurance);
    return { route: r, volume, subtotal: Math.round(total), insurance: ins, vat, total: Math.round(total + vat + ins), range: [Math.round((total + vat) * .88), Math.round((total + vat) * 1.14)], breakdown };
  }

  /* -------------------------------------------------- db */
  function seed() {
    const now = Date.now();
    const mkCo = (id, name, city, tier, since, rating, jobs, verified, phone, about) =>
      ({ id, name, city, tier, since, rating, jobs, verified, phone, about, createdAt: now });
    const companies = [
      mkCo('f1', 'Kervan Yol Taşımacılık', 'İstanbul', 'altin', '2016-04', 4.8, 612, true, '0532 000 11 01', 'Şehirler arası evden eve taşıma, modüler asansör ve parça eşya hattı.'),
      mkCo('f2', 'Toroslar Evden Eve', 'Adana', 'gumus', '2019-09', 4.6, 288, true, '0533 000 11 02', 'Çukurova bölgesi ve Akdeniz hattında tam kapsamlı taşımacılık.'),
      mkCo('f3', 'Meridyen Nakliyat', 'Ankara', 'altin', '2012-02', 4.9, 1040, true, '0535 000 11 03', 'Başkent çıkışlı Türkiye geneli sefer planlaması.'),
      mkCo('f4', 'Ege Rota Lojistik', 'İzmir', 'gumus', '2020-06', 4.5, 173, false, '0536 000 11 04', 'Ege içi ve Ege çıkışlı hatlarda parça eşya birleştirme.'),
      mkCo('f5', 'Fırat Asansörlü Taşıma', 'Gaziantep', 'standart', '2022-11', 4.3, 64, true, '0537 000 11 05', 'Güneydoğu hattında asansörlü taşıma.'),
      mkCo('f6', 'Karadeniz Sefer Nakliye', 'Samsun', 'gumus', '2018-03', 4.4, 341, true, '0538 000 11 06', 'Karadeniz sahili boyunca şehirler arası taşımacılık.'),
      mkCo('f8', 'Boğaziçi Ekspres Nakliyat', 'İstanbul', 'gumus', '2015-01', 4.7, 528, true, '0541 000 11 08', 'Avrupa yakası çıkışlı hızlı sevkiyat.'),
      mkCo('f10', 'Doğu Ekseni Lojistik', 'Diyarbakır', 'altin', '2014-10', 4.8, 780, true, '0543 000 11 10', 'Doğu ve Güneydoğu hattında tam donanımlı filo.')
    ];
    const mkP = (id, f, cat, from, to, text, min) => ({
      id, companyId: f, category: cat, from, to, text,
      createdAt: now - min * 60000, bumpedAt: now - min * 60000, updatedAt: now - min * 60000,
      boostUntil: 0, status: 'active',
      views: 5 + Math.floor(Math.random() * 180), saves: Math.floor(Math.random() * 18),
      flags: 0, token: uid('tok_')
    });
    const posts = [
      mkP('p1', 'f1', 'bos_arac', 'İstanbul', 'İzmir', 'Yarın sabah İstanbul çıkışlı aracımız İzmir yönüne boş geçiyor. 2+1 / 3+1 tam ev ya da parça eşya alabiliriz. Kapalı kasa, asansör mevcut.', 4),
      mkP('p2', 'f10', 'bos_arac', 'Diyarbakır', 'Gaziantep', 'Diyarbakır’dan Gaziantep ve Kahramanmaraş istikametine aracımız boş. Aynı gün yükleme yapabiliriz.', 11),
      mkP('p3', 'f3', 'yuk_is', 'Ankara', 'Antalya', 'Ankara Çankaya’dan Antalya Muratpaşa’ya 3+1 ev eşyası taşınacak. 5. kat, dış cephe asansörü kurulacak. Fiyat bekliyoruz.', 17),
      mkP('p4', 'f5', 'asansor', 'Gaziantep', null, 'Gaziantep merkez ve ilçelerde operatörlü modüler asansör kiralama. 12. kata kadar, günlük ve saatlik seçenek.', 23),
      mkP('p5', 'f8', 'parca', 'İstanbul', 'Ankara', 'İstanbul Avrupa yakasından Ankara’ya koli, beyaz eşya ve küçük mobilya seferi. Aynı gün teslim.', 31),
      mkP('p6', 'f6', 'bos_arac', 'Samsun', 'İstanbul', 'Samsun’dan İstanbul yönüne boş dönüş yapıyoruz. Perşembe akşamı yola çıkıyoruz.', 44),
      mkP('p7', 'f4', 'parca', 'İzmir', 'Aydın', 'İzmir’den Aydın ve Denizli yönüne haftada üç gün parça eşya seferi. Fiyat hacme göre.', 134),
      mkP('p8', 'f2', 'bos_arac', 'Adana', 'Mersin', 'Adana’dan Mersin ve Tarsus yönüne boş aracımız var. Bugün öğleden sonra yükleme yapılabilir.', 198),
      mkP('p9', 'f3', 'yuk_is', 'Ankara', 'İstanbul', 'Ankara Etimesgut’tan İstanbul Kadıköy’e 4+1 villa eşyası. Piyano ve antika var, sigorta zorunlu.', 486),
      mkP('p10', 'f10', 'bos_arac', 'Şanlıurfa', 'İstanbul', 'Şanlıurfa’dan İstanbul yönüne haftalık seferimiz var. Tam ev ve parça eşya, sigortalı taşıma.', 812)
    ];
    return { companies, posts, messages: [], devices: {}, published: 11427 };
  }
  let db;
  function load() {
    try { db = JSON.parse(localStorage.getItem(LS_DB)); } catch (e) { db = null; }
    if (!db || !db.posts) { db = seed(); save(); }
  }
  function save() { localStorage.setItem(LS_DB, JSON.stringify(db)); }
  load();

  const deviceId = () => localStorage.getItem('yp.device') || 'anon';
  function device() {
    let d = db.devices[deviceId()];
    if (!d) {
      d = db.devices[deviceId()] = { saved: [], alarms: [], ownedPosts: [], name: '', daily: { posts: 0, reveals: 0, refreshes: 0 } };
      save();
    }
    return d;
  }
  const company = id => db.companies.find(c => c.id === id);

  function publicCompany(c) {
    return { id: c.id, name: c.name, city: c.city, since: c.since, about: c.about, rating: c.rating, jobs: c.jobs, verified: !!c.verified, initials: (c.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('') || 'YP').toLocaleUpperCase('tr-TR') };
  }
  function publicPost(p, full) {
    const d = device();
    const c = company(p.companyId) || {};
    const mine = (d.ownedPosts || []).includes(p.id);
    const out = {
      id: p.id, category: p.category, categoryLabel: (CATEGORIES.find(x => x.id === p.category) || {}).label,
      from: p.from, to: p.to, text: p.text, createdAt: p.createdAt, bumpedAt: p.bumpedAt,
      boosted: p.boostUntil > Date.now(), status: p.status, views: p.views, saves: p.saves,
      route: p.from && p.to ? routeInfo(p.from, p.to) : null,
      saved: (d.saved || []).includes(p.id), company: publicCompany(c)
    };
    out.mine = mine;
    if (mine) out.token = p.token;
    if (full) out.phone = c.phone;
    return out;
  }
  function stats() {
    const now = Date.now();
    const live = db.posts.filter(p => now - p.createdAt < 14 * 86400000);
    return {
      published: db.published,
      today: db.posts.filter(p => now - p.createdAt < 86400000).length,
      activeListings: live.filter(p => p.status === 'active').length,
      companies: db.companies.length,
      volumeTL: 98620000,
      categories: CATEGORIES.map(c => ({ id: c.id, label: c.label, count: live.filter(p => p.category === c.id).length }))
    };
  }
  function viewer() {
    const d = device();
    const co = db.companies.find(c => (d.ownedPosts || []).some(id => (db.posts.find(p => p.id === id) || {}).companyId === c.id));
    return {
      deviceId: deviceId(), todayPosts: d.daily.posts,
      saved: d.saved, alarms: d.alarms, ownedPosts: d.ownedPosts, name: d.name,
      company: co ? { ...publicCompany(co), phone: co.phone, token: co.token } : null
    };
  }
  function listPosts(q) {
    const now = Date.now();
    let rows = db.posts.filter(p => now - p.createdAt < 14 * 86400000);
    const d = device();
    if (q.cat && q.cat !== 'all') rows = rows.filter(p => p.category === q.cat);
    if (q.city) rows = rows.filter(p => [p.from, p.to, (company(p.companyId) || {}).city].some(c => c && norm(c).includes(norm(q.city))));
    if (q.from || q.to) rows = rows.filter(p => {
      let s = 0;
      if (q.from && p.from && norm(p.from).includes(norm(q.from))) s++;
      if (q.to && p.to && norm(p.to).includes(norm(q.to))) s++;
      if (q.from && p.to && norm(p.to).includes(norm(q.from))) s += .5;
      if (q.to && p.from && norm(p.from).includes(norm(q.to))) s += .5;
      return s > 0;
    });
    if (q.q) {
      const toks = norm(q.q).split(/\s+/).filter(t => t.length > 1);
      rows = rows.filter(p => {
        const hay = norm([p.text, p.from, p.to, (company(p.companyId) || {}).name].join(' '));
        return toks.every(t => hay.includes(t));
      });
    }
    if (q.saved === '1') rows = rows.filter(p => (d.saved || []).includes(p.id));
    if (q.mine === '1') rows = rows.filter(p => (d.ownedPosts || []).includes(p.id));
    if (q.sort === 'popular') rows.sort((a, b) => (b.views + b.saves * 3) - (a.views + a.saves * 3));
    else rows.sort((a, b) => ((b.boostUntil > now) - (a.boostUntil > now)) || b.bumpedAt - a.bumpedAt);
    const limit = Math.min(40, Number(q.limit) || 12);
    const page = Number(q.page) || 1;
    return { items: rows.slice((page - 1) * limit, page * limit).map(p => publicPost(p)), total: rows.length, page, pages: Math.max(1, Math.ceil(rows.length / limit)), limit, stats: stats() };
  }

  /* -------------------------------------------------- SSE sahtesi */
  const bus = { ls: {}, emit(t, data) { (this.ls[t] || []).forEach(cb => { try { cb({ data: JSON.stringify(data) }); } catch (e) {} }); } };
  window.EventSource = class {
    constructor(url) { this.url = url; setTimeout(() => bus.emit('hello', { t: Date.now() }), 50); }
    addEventListener(t, cb) { (bus.ls[t] = bus.ls[t] || []).push(cb); }
    onerror = null; close() {} get readyState() { return 1; }
  };

  // Kurgusal canlı akış: 40 sn'de bir ilan düşer
  setInterval(() => {
    const co = db.companies[Math.floor(Math.random() * db.companies.length)];
    const cat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)].id;
    const a = P()[Math.floor(Math.random() * P().length)];
    const b = P()[(P().indexOf(a) + 9) % P().length];
    const need = (CATEGORIES.find(c => c.id === cat) || {}).needsRoute;
    const lines = {
      bos_arac: `${a.name}'dan ${b.name} yönüne aracımız boş geçiyor, parça ya da tam ev işi alabiliriz.`,
      yuk_is: `${a.name} çıkışlı ${b.name} varışlı taşıma işi için araç aranıyor.`,
      parca: `${a.name}'dan ${b.name}'a parça eşya seferimiz var, koli kabul ediyoruz.`,
      asansor: `${a.name} ve çevresinde operatörlü modüler asansör kiralama.`,
      depo: `${a.name}'da kapalı eşya depolama alanımız müsait.`,
      ekip: `${a.name} bölgesinde yükleme-boşaltma ekibi günlük kiralanır.`
    };
    const now = Date.now();
    const post = { id: uid('p'), companyId: co.id, category: cat, from: a.name, to: need ? b.name : null, text: lines[cat], createdAt: now, bumpedAt: now, updatedAt: now, boostUntil: 0, status: 'active', views: 0, saves: 0, flags: 0, token: uid('tok_') };
    db.posts.unshift(post); db.published++; save();
    bus.emit('post', publicPost(post));
    (device().alarms || []).forEach(al => {
      const okCat = !al.cat || post.category === al.cat;
      const okF = !al.from || (post.from && norm(post.from).includes(norm(al.from)));
      const okT = !al.to || (post.to && norm(post.to).includes(norm(al.to)));
      if (okCat && okF && okT) bus.emit('alarm', { postId: post.id, deviceId: deviceId(), alarm: al, post: publicPost(post) });
    });
  }, 40000);

  /* -------------------------------------------------- fetch yakalayıcı */
  const realFetch = window.fetch.bind(window);
  const R = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

  window.fetch = async function (input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith('/api/')) return realFetch(input, init);
    const u = new URL(url, 'https://static.local');
    const p = u.pathname;
    const body = init.body ? JSON.parse(init.body) : {};
    await new Promise(r => setTimeout(r, 60)); // gerçekçi gecikme

    if (p === '/api/bootstrap') return R({ provinces: P().map(x => ({ name: x.name, plaka: x.plaka })), categories: CATEGORIES, serviceOptions: SERVICE_OPTIONS, hotRoutes: HOT_ROUTES, pricing: PRICING, stats: stats(), viewer: viewer() });
    if (p === '/api/posts') return R(listPosts(Object.fromEntries(u.searchParams.entries())));
    if (p === '/api/stats') return R({ ...stats(), viewer: viewer() });
    if (p === '/api/viewer') return R(viewer());
    if (p === '/api/route') return R(routeInfo(u.searchParams.get('from'), u.searchParams.get('to')) || { error: 'İl bulunamadı' });
    if (p === '/api/estimate') return R(estimatePrice(Object.fromEntries(u.searchParams.entries())) || { error: 'İl bulunamadı' });

    let m = p.match(/^\/api\/post\/([\w-]+)$/);
    if (m && (init.method || 'GET') === 'GET') {
      const post = db.posts.find(x => x.id === m[1]);
      if (!post) return R({ error: 'İlan bulunamadı.' }, 404);
      post.views++; save();
      const rel = db.posts.filter(x => x.category === post.category && x.id !== post.id).slice(0, 4).map(x => publicPost(x));
      return R({ post: publicPost(post, true), thread: db.messages.filter(x => x.postId === post.id).map(x => ({ id: x.id, fromViewer: x.fromViewer, text: x.text, createdAt: x.createdAt, ago: 'az önce' })), companyPosts: db.posts.filter(x => x.companyId === post.companyId && x.id !== post.id).slice(0, 5).map(x => publicPost(x)), related: rel, companyStats: {} });
    }
    m = p.match(/^\/api\/company\/([\w-]+)$/);
    if (m) {
      const c = company(m[1]);
      if (!c) return R({ error: 'Firma bulunamadı.' }, 404);
      return R({ company: publicCompany(c), posts: db.posts.filter(x => x.companyId === c.id).map(x => publicPost(x)), isMine: (device().ownedPosts || []).some(id => (db.posts.find(pp => pp.id === id) || {}).companyId === c.id) });
    }

    if (p === '/api/post' && init.method === 'POST') {
      const d = device();
      if (!CATEGORIES.find(c => c.id === body.category)) return R({ error: 'Geçersiz kategori.' });
      const text = String(body.text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length < 25) return R({ error: 'Açıklama en az 25 karakter olmalı.' });
      if (/[0-9]{3}[\s-]?[0-9]{3}[\s-]?[0-9]{2}[\s-]?[0-9]{2}/.test(text)) return R({ error: 'İlan metnine telefon numarası yazmayın.' });
      const need = CATEGORIES.find(c => c.id === body.category).needsRoute;
      const from = body.from ? titleCase(body.from) : null;
      const to = body.to ? titleCase(body.to) : null;
      if (need && !from) return R({ error: 'Bu kategori için çıkış ili seçin.' });
      let co = db.companies.find(c => (d.ownedPosts || []).some(id => (db.posts.find(pp => pp.id === id) || {}).companyId === c.id));
      if (!co) {
        co = { id: uid('f'), name: titleCase(body.companyName) || 'Misafir Taşımacı', city: titleCase(body.city) || from || '', since: new Date().toISOString().slice(0, 7), about: body.about || 'Yolpano üzerinden ilan veren taşımacı.', rating: 0, jobs: 0, verified: false, phone: body.phone || '0500 000 00 00', createdAt: Date.now(), token: uid('tok_') };
        db.companies.push(co);
      }
      const now = Date.now();
      const post = { id: uid('p'), companyId: co.id, category: body.category, from, to, text, createdAt: now, updatedAt: now, bumpedAt: now, boostUntil: 0, status: 'active', views: 0, saves: 0, flags: 0, token: uid('tok_') };
      db.posts.unshift(post);
      d.ownedPosts = [...(d.ownedPosts || []), post.id];
      d.daily.posts++; db.published++; save();
      bus.emit('post', publicPost(post));
      return R({ ok: true, post: publicPost(post, true) });
    }
    if (p === '/api/post/update') { const x = db.posts.find(y => y.id === body.id); if (!x || x.token !== body.token) return R({ error: 'Bu ilan size ait değil.' }); if (body.text) x.text = body.text; if (body.status) x.status = body.status; save(); return R({ ok: true, post: publicPost(x, true) }); }
    if (p === '/api/post/delete') { const i = db.posts.findIndex(y => y.id === body.id); if (i < 0 || db.posts[i].token !== body.token) return R({ error: 'Bu ilan size ait değil.' }); db.posts.splice(i, 1); save(); bus.emit('post:deleted', { id: body.id }); return R({ ok: true }); }
    if (p === '/api/post/refresh') { const x = db.posts.find(y => y.id === body.id); if (!x || x.token !== body.token) return R({ error: 'Bu ilan size ait değil.' }); x.bumpedAt = Date.now(); x.boostUntil = Date.now() + 3600000; save(); return R({ ok: true, post: publicPost(x, true) }); }
    if (p === '/api/post/reveal') { const x = db.posts.find(y => y.id === body.id); if (!x) return R({ error: 'İlan bulunamadı.' }); return R({ ok: true, phone: (company(x.companyId) || {}).phone, left: 9999 }); }
    if (p === '/api/post/save') { const d = device(); const x = db.posts.find(y => y.id === body.id); if (!x) return R({ error: 'İlan bulunamadı.' }); const has = d.saved.includes(body.id); d.saved = has ? d.saved.filter(i => i !== body.id) : [...d.saved, body.id]; x.saves = Math.max(0, x.saves + (has ? -1 : 1)); save(); return R({ ok: true, saved: !has, count: x.saves }); }
    if (p === '/api/post/report') { const x = db.posts.find(y => y.id === body.id); if (!x) return R({ error: 'İlan bulunamadı.' }); x.flags++; save(); return R({ ok: true, flags: x.flags }); }
    if (p === '/api/alarm') {
      const d = device();
      const key = `${body.from || ''}|${body.to || ''}|${body.cat || ''}`;
      if (!body.from && !body.to && !body.cat) return R({ error: 'En az bir ölçüt seçin.' });
      const ex = (d.alarms || []).find(a => a.key === key);
      if (ex) d.alarms = d.alarms.filter(a => a.key !== key);
      else { if ((d.alarms || []).length >= 20) return R({ error: 'Rota alarmı sınırınız 20.' }); d.alarms = [...(d.alarms || []), { key, from: body.from || null, to: body.to || null, cat: body.cat || null, createdAt: Date.now() }]; }
      save(); return R({ ok: true, on: !ex, alarms: d.alarms });
    }
    if (p === '/api/message') {
      const x = db.posts.find(y => y.id === body.postId);
      if (!x) return R({ error: 'İlan bulunamadı.' });
      const msg = { id: uid('m'), postId: x.id, fromViewer: true, text: String(body.text || '').slice(0, 400), createdAt: Date.now() };
      db.messages.push(msg); save();
      bus.emit('message', { postId: x.id, message: msg });
      setTimeout(() => {
        const reply = { id: uid('m'), postId: x.id, fromViewer: false, text: 'Merhaba, mesajınız için teşekkürler. Eşya hacmi ve kat bilgisi verirseniz net fiyat çıkarabiliriz.', createdAt: Date.now() };
        db.messages.push(reply); save();
        bus.emit('message', { postId: x.id, message: reply });
      }, 2500);
      return R({ ok: true, message: msg });
    }
    if (p === '/api/demo/gen') { bus.emit('post', publicPost(db.posts[0])); return R({ ok: true, post: publicPost(db.posts[0]) }); }
    if (p === '/api/reset') { db = seed(); save(); return R({ ok: true }); }
    return R({ error: 'Uç nokta bulunamadı.' }, 404);
  };

  console.info('Yolpano statik mod: veriler bu tarayıcıda saklanır.');
})();

/**
 * Yolpano — nakliyeciler için güzergâh panosu
 * Bağımlılıksız Node HTTP sunucusu: statik dosyalar + JSON API + SSE (canlı akış).
 * Veri: data/db.json (ilk açılışta data/seed.json'dan üretilir).
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA, 'db.json');
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const { CATEGORIES, PRICING, SERVICE_OPTIONS, HOT_ROUTES } = require('./data/taxonomy');

/* ---------------------------------------------------------------- iller */
// public/js/provinces.js tarayıcı içindir; sunucu tarafında aynı veriyi okuyoruz.
const PROVINCES = (function loadProvinces() {
  const src = fs.readFileSync(path.join(PUB, 'js', 'provinces.js'), 'utf8');
  const body = src.slice(src.indexOf('['), src.lastIndexOf(']') + 1);
  return eval('(' + body + ')');
})();
const CITY_BY_NAME = new Map(PROVINCES.map(p => [trLower(p.name), p]));

function trLower(s) {
  return String(s || '').toLocaleLowerCase('tr-TR').replace(/İ/g, 'i').replace(/I/g, 'ı');
}
function norm(s) {
  return trLower(s).replace(/[çğıöşü]/g, c => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }[c]));
}
function titleCase(s) {
  return String(s || '').toLocaleLowerCase('tr-TR').replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('tr-TR'));
}

/* ------------------------------------------------------------- mesafe */
function haversineKm(a, b) {
  const R = 6371, rad = d => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function routeInfo(fromName, toName) {
  const a = CITY_BY_NAME.get(trLower(fromName || ''));
  const b = CITY_BY_NAME.get(trLower(toName || ''));
  if (!a || !b) return null;
  const straight = haversineKm(a, b);
  const km = Math.round(straight * 1.25); // karayolu katsayısı
  return { km, hours: Math.round((km / 72) * 10) / 10, from: a.name, to: b.name };
}
function estimatePrice({ from, to, m3, floor, elevator, services }) {
  const r = routeInfo(from, to);
  if (!r) return null;
  const volume = Number(m3) > 0 ? Number(m3) : PRICING.volumePresets['2+1'];
  let perKm = PRICING.perKm;
  if (r.km > PRICING.longHaulKm) perKm *= PRICING.longHaulDiscount;
  let total = PRICING.base + r.km * perKm + volume * PRICING.perM3;
  const floors = Math.max(0, Number(floor) || 0);
  if (floors > 0 && !elevator) total += floors * PRICING.perFloorNoElevator;
  let breakdown = [
    { label: 'Yükleme & organizasyon', value: PRICING.base },
    { label: `Mesafe (${r.km} km × ${Math.round(perKm)} ₺)`, value: Math.round(r.km * perKm) },
    { label: `Hacim (${volume} m³ × ${PRICING.perM3} ₺)`, value: volume * PRICING.perM3 }
  ];
  if (floors > 0 && !elevator) breakdown.push({ label: `Kat farkı (${floors} kat, asansörsüz)`, value: floors * PRICING.perFloorNoElevator });
  (services || []).forEach(id => {
    const opt = SERVICE_OPTIONS.find(o => o.id === id);
    if (!opt) return;
    const add = Math.round(total * (opt.mult - 1));
    total += add;
    breakdown.push({ label: opt.label, value: add });
  });
  const vat = Math.round(total * PRICING.vat);
  const insurance = Math.round(total * PRICING.insurance);
  return {
    route: r, volume,
    subtotal: Math.round(total),
    insurance, vat,
    total: Math.round(total + vat + insurance),
    range: [Math.round((total + vat) * 0.88), Math.round((total + vat) * 1.14)],
    breakdown
  };
}

/* ---------------------------------------------------------------- db */
function uid(prefix) { return prefix + crypto.randomBytes(6).toString('hex'); }
let db = null;

function seedDb() {
  const seed = JSON.parse(fs.readFileSync(path.join(DATA, 'seed.json'), 'utf8'));
  const now = Date.now();
  const companies = seed.companies.map(c => ({
    ...c, createdAt: new Date(`${c.since}-05T10:00:00Z`).getTime(), token: uid('tok_')
  }));
  const byId = new Map(companies.map(c => [c.id, c]));
  const posts = seed.posts.map(p => {
    const created = now - p.minAgo * 60000;
    return {
      id: p.id,
      companyId: p.companyId,
      category: p.cat,
      from: p.from || null,
      to: p.to || null,
      text: p.text,
      createdAt: created,
      updatedAt: created,
      bumpedAt: created,
      boostUntil: 0,
      status: 'active',
      views: 8 + Math.floor(Math.random() * 240),
      saves: Math.floor(Math.random() * 24),
      flags: 0,
      token: uid('tok_')
    };
  });
  const messages = seed.messages.map(m => ({
    id: m.id, postId: m.postId,
    fromDevice: m.fromViewer ? 'viewer' : byId.get(seed.posts.find(p => p.id === m.postId).companyId)?.id,
    fromViewer: !!m.fromViewer,
    text: m.text,
    createdAt: now - m.minAgo * 60000
  }));
  return {
    version: 1,
    companies, posts, messages,
    devices: {},          // deviceId -> { daily:{date,posts,reveals,refreshes}, saved:[], alarms:[], name, ownedPosts }
    reports: [],
    stats: { published: 11427, activeCompanies: companies.length + 6391, volumeTL: 98620000 }
  };
}
function loadDb() {
  if (fs.existsSync(DB_FILE)) {
    try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); return; }
    catch (e) { console.error('db okunamadı, yeniden oluşturuluyor:', e.message); }
  }
  db = seedDb();
  saveDb();
}
let saveTimer = null;
function saveDb() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, DB_FILE);
  }, 120);
}
function resetDb() { db = seedDb(); fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 1)); }

/* -------------------------------------------------------------- viewer */
function getDevice(id) {
  if (!db.devices[id]) {
    db.devices[id] = {
      daily: freshDaily(),
      saved: [],
      alarms: [],
      name: '',
      phone: '',
      city: '',
      createdAt: Date.now()
    };
  }
  const d = db.devices[id];
  const today = new Date().toISOString().slice(0, 10);
  if (!d.daily || d.daily.date !== today) d.daily = freshDaily();
  return d;
}
function freshDaily() { return { date: new Date().toISOString().slice(0, 10), posts: 0, reveals: 0, refreshes: 0 }; }

/* --------------------------------------------------------------- sse */
const sseClients = new Set();
function sse(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) { try { res.write(payload); } catch (_) { sseClients.delete(res); } }
}

/* ----------------------------------------------------------- yardımcı */
const CAT_BY_ID = new Map(CATEGORIES.map(c => [c.id, c]));
function companyMap() { return new Map(db.companies.map(c => [c.id, c])); }
function cleanText(s, max = 1000) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function matchCity(name, query) {
  if (!name) return false;
  return norm(name).includes(query);
}
function relTime(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s} sn`;
  const m = Math.floor(s / 60); if (m < 60) return `${m} dk`;
  const h = Math.floor(m / 60); if (h < 24) return `${h} sa`;
  const d = Math.floor(h / 24); if (d < 30) return `${d} gün`;
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo} ay`;
  return `${Math.floor(mo / 12)} yıl`;
}
function isExpired(p) { return Date.now() - p.createdAt > 14 * 86400000; }
function isBoosted(p) { return p.boostUntil > Date.now(); }

function publicCompany(c) {
  return {
    id: c.id, name: c.name, city: c.city,
    since: c.since, about: c.about,
    rating: c.rating, jobs: c.jobs, verified: !!c.verified,
    initials: c.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toLocaleUpperCase('tr-TR')
  };
}
function publicPost(p, { deviceId, full = false } = {}) {
  const cm = companyMap();
  const c = cm.get(p.companyId) || {};
  const device = deviceId ? getDevice(deviceId) : { saved: [] };
  const mine = !!(device.ownedPosts || []).includes(p.id);
  const r = p.from && p.to ? routeInfo(p.from, p.to) : null;
  const out = {
    id: p.id, category: p.category,
    categoryLabel: CAT_BY_ID.get(p.category)?.label || p.category,
    from: p.from, to: p.to, text: p.text,
    createdAt: p.createdAt, ago: relTime(p.createdAt),
    bumpedAt: p.bumpedAt, boosted: isBoosted(p),
    status: p.status, views: p.views, saves: p.saves,
    route: r, saved: (device.saved || []).includes(p.id),
    company: publicCompany({ ...c })
  };
  if (full) {
    out.phone = mine ? c.phone : null;
    out.phoneTail = (c.phone || '').slice(-4);
  }
  out.mine = !!mine;
  if (mine) out.token = p.token;   // sahibi düzenleyebilsin/öne alabilsin/silebilsin
  return out;
}

/* --------------------------------------------------------- listeleme */
function rankScore(p, cm, filters) {
  const ageMin = Math.max(0, (Date.now() - p.bumpedAt) / 60000);
  const fresh = Math.max(0, 1 - (Date.now() - p.bumpedAt) / (24 * 3600 * 1000)); // 24 saatte 0'a iner
  // Ağırlık dengesi: tazelik (0-170) > ilgi (0-20).
  // Yeni ilan her zaman üste düşer; ilgi yalnızca benzer yaştaki ilanlar arasında fark yaratır.
  const freshnessBonus = Math.max(0, 130 - ageMin * 2);
  const interest = Math.min(12, p.views / 25) + Math.min(8, p.saves * 0.4);
  let score = fresh * 40 + freshnessBonus + interest;
  if (isBoosted(p)) score += 300;          // "öne al" hakkı 1 saat boyunca en üstte tutar
  if (p.status === 'solved') score -= 25;
  if (filters.routeMatch) score += filters.routeMatch(p) * 55;
  return score;
}

function listPosts(q, deviceId) {
  const cm = companyMap();
  const cat = q.cat && q.cat !== 'all' ? String(q.cat) : null;
  const firmType = q.firmType || null;
  const qSearch = norm(cleanText(q.q, 80));
  const from = q.from ? norm(q.from) : null;
  const to = q.to ? norm(q.to) : null;
  const city = q.city ? norm(q.city) : null;
  const sort = q.sort || 'new';
  const onlyOpen = q.open === '1';
  const page = Math.max(1, parseInt(q.page || '1', 10));
  const limit = Math.min(40, Math.max(5, parseInt(q.limit || '12', 10)));

  let routeMatch = null;
  if (from || to) {
    routeMatch = (p) => {
      let s = 0;
      if (from && p.from && norm(p.from).includes(from)) s += 1;
      if (to && p.to && norm(p.to).includes(to)) s += 1;
      if (from && p.to && norm(p.to).includes(from)) s += 0.5;
      if (to && p.from && norm(p.from).includes(to)) s += 0.5;
      return s;
    };
  }

  let rows = db.posts.filter(p => !isExpired(p));
  if (cat) rows = rows.filter(p => p.category === cat);
  if (city) rows = rows.filter(p => matchCity(p.from, city) || matchCity(p.to, city) || matchCity(cm.get(p.companyId)?.city, city));
  if (firmType) rows = rows.filter(p => {
    const c = cm.get(p.companyId);
    return firmType === 'asansor' ? p.category === 'asansor' : c && p.category !== 'asansor';
  });
  if (onlyOpen) rows = rows.filter(p => p.status === 'active');
  if (from || to) {
    rows = rows.filter(p => routeMatch(p) > 0);
  }
  if (qSearch) {
    rows = rows.filter(p => {
      const c = cm.get(p.companyId) || {};
      const hay = norm([p.text, p.from, p.to, c.name, c.city, CAT_BY_ID.get(p.category)?.label].filter(Boolean).join(' '));
      return qSearch.split(/\s+/).every(tok => hay.includes(tok));
    });
  }
  if (q.mine === '1' && deviceId) {
    const owned = getDevice(deviceId).ownedPosts || [];
    rows = rows.filter(p => owned.includes(p.id));
  }
  if (q.saved === '1' && deviceId) {
    const saved = getDevice(deviceId).saved || [];
    rows = rows.filter(p => saved.includes(p.id));
  }

  const withScore = rows.map(p => ({ p, score: rankScore(p, cm, { routeMatch }) }));
  if (sort === 'popular') {
    withScore.sort((a, b) => (b.p.views + b.p.saves * 3) - (a.p.views + a.p.saves * 3));
  } else {
    // Varsayılan akış: en yeni üstte. Ücretli "öne al" hakkını kullanan ilanlar
    // (boostUntil) yalnızca kendi aralarında, akışın en üstünde gruplanır.
    withScore.sort((a, b) => {
      const ab = isBoosted(a.p) ? 1 : 0, bb = isBoosted(b.p) ? 1 : 0;
      if (ab !== bb) return bb - ab;
      return b.p.bumpedAt - a.p.bumpedAt;
    });
  }

  const total = withScore.length;
  const slice = withScore.slice((page - 1) * limit, page * limit).map(x => publicPost(x.p, { deviceId }));
  return { items: slice, total, page, pages: Math.max(1, Math.ceil(total / limit)), limit };
}

/* ------------------------------------------------------------ eylemler */
function createPost(deviceId, body) {
  const device = getDevice(deviceId);   // tüm haklar sınırsız ve ücretsiz
  const cat = String(body.category || '');
  if (!CAT_BY_ID.has(cat)) return { error: 'Geçersiz kategori.' };
  const text = cleanText(body.text, 1000);
  if (text.length < 25) return { error: 'Açıklama en az 25 karakter olmalı.' };
  if (text.length > 1000) return { error: 'Açıklama en fazla 1000 karakter olabilir.' };
  if (/[0-9]{3}[\s-]?[0-9]{3}[\s-]?[0-9]{2}[\s-]?[0-9]{2}/.test(text)) return { error: 'İlan metnine telefon numarası yazmayın; iletişim butonları üzerinden ulaşılıyor.' };

  const needRoute = CAT_BY_ID.get(cat).needsRoute;
  let from = body.from ? titleCase(cleanText(body.from, 40)) : null;
  let to = body.to ? titleCase(cleanText(body.to, 40)) : null;
  if (needRoute && !from) return { error: 'Bu kategori için en az çıkış ili seçmelisiniz.' };
  if (from && !CITY_BY_NAME.has(trLower(from))) return { error: `Çıkış ili bulunamadı: ${from}` };
  if (to && !CITY_BY_NAME.has(trLower(to))) return { error: `Varış ili bulunamadı: ${to}` };

  // Firma bilgisi: ilk ilanda kayıt oluşturulur, sonraki ilanlarda güncellenir
  let company = db.companies.find(c => c.deviceId === deviceId);
  const name = titleCase(cleanText(body.companyName, 60)) || device.name || 'Misafir Taşımacı';
  const phone = cleanText(body.phone, 20).replace(/[^\d\s+]/g, '');
  if (phone && phone.replace(/\D/g, '').length < 10) return { error: 'Geçerli bir telefon numarası girin.' };
  if (!company) {
    company = {
      id: uid('f'), deviceId, name, city: titleCase(cleanText(body.city, 40)) || from || '',
      phone: phone || '0500 000 00 00',
      since: new Date().toISOString().slice(0, 7),
      about: cleanText(body.about, 400) || 'Yolpano üzerinden ilan veren taşımacı.',
      rating: 0, jobs: 0, verified: false, createdAt: Date.now(), token: uid('tok_')
    };
    db.companies.push(company);
  } else {
    if (body.companyName) company.name = name;
    if (body.city) company.city = titleCase(cleanText(body.city, 40));
    if (phone) company.phone = phone;
    if (body.about) company.about = cleanText(body.about, 400);
  }
  device.name = company.name;

  const now = Date.now();
  const post = {
    id: uid('p'), companyId: company.id, category: cat,
    from, to, text,
    createdAt: now, updatedAt: now, bumpedAt: now, boostUntil: 0,
    status: 'active', views: 0, saves: 0, flags: 0, token: uid('tok_')
  };
  db.posts.unshift(post);
  device.daily.posts += 1;
  device.ownedPosts = [...(device.ownedPosts || []), post.id];
  db.stats.published += 1;
  saveDb();
  sse('post', publicPost(post, { deviceId }));
  return { ok: true, post: publicPost(post, { deviceId, full: true }) };
}

function updatePost(deviceId, id, body) {
  const p = db.posts.find(x => x.id === id);
  if (!p) return { error: 'İlan bulunamadı.' };
  if (p.token !== body.token) return { error: 'Bu ilan size ait değil.' };
  if (body.text) {
    const t = cleanText(body.text, 1000);
    if (t.length < 25) return { error: 'Açıklama en az 25 karakter olmalı.' };
    p.text = t;
  }
  if (body.status) p.status = body.status === 'solved' ? 'solved' : 'active';
  if (body.from) p.from = titleCase(cleanText(body.from, 40));
  if (body.to !== undefined) p.to = body.to ? titleCase(cleanText(body.to, 40)) : null;
  p.updatedAt = Date.now();
  saveDb();
  sse('post', publicPost(p, { deviceId }));
  return { ok: true, post: publicPost(p, { deviceId, full: true }) };
}

function deletePost(deviceId, id, token) {
  const i = db.posts.findIndex(x => x.id === id);
  if (i < 0) return { error: 'İlan bulunamadı.' };
  if (db.posts[i].token !== token) return { error: 'Bu ilan size ait değil.' };
  db.posts.splice(i, 1);
  db.messages = db.messages.filter(m => m.postId !== id);
  const d = getDevice(deviceId);
  d.ownedPosts = (d.ownedPosts || []).filter(x => x !== id);
  saveDb();
  sse('post:deleted', { id });
  return { ok: true };
}

function refreshPost(deviceId, id, token) {
  const p = db.posts.find(x => x.id === id);
  if (!p) return { error: 'İlan bulunamadı.' };
  if (p.token !== token) return { error: 'Bu ilan size ait değil.' };
  const device = getDevice(deviceId);
  p.bumpedAt = Date.now();
  p.boostUntil = Date.now() + 60 * 60 * 1000;
  device.daily.refreshes += 1;
  saveDb();
  sse('post', publicPost(p, { deviceId }));
  return { ok: true, post: publicPost(p, { deviceId, full: true }) };
}

function revealPhone(deviceId, postId) {
  const p = db.posts.find(x => x.id === postId);
  if (!p) return { error: 'İlan bulunamadı.' };
  const c = db.companies.find(x => x.id === p.companyId);
  const mine = (getDevice(deviceId).ownedPosts || []).includes(p.id);
  saveDb();
  return { ok: true, phone: mine ? c.phone : (c ? c.phone : null), left: 9999 };
}

function toggleSave(deviceId, postId) {
  const device = getDevice(deviceId);
  const p = db.posts.find(x => x.id === postId);
  if (!p) return { error: 'İlan bulunamadı.' };
  const has = device.saved.includes(postId);
  device.saved = has ? device.saved.filter(x => x !== postId) : [...device.saved, postId];
  p.saves = Math.max(0, p.saves + (has ? -1 : 1));
  saveDb();
  return { ok: true, saved: !has, count: p.saves };
}

function toggleAlarm(deviceId, body) {
  const device = getDevice(deviceId);
  const from = titleCase(cleanText(body.from, 40)) || null;
  const to = titleCase(cleanText(body.to, 40)) || null;
  const cat = CAT_BY_ID.has(body.cat) ? body.cat : null;
  if (!from && !to && !cat) return { error: 'En az bir ölçüt seçin.' };
  const max = 20;   // tamamen ücretsiz model: herkes için 20 rota alarmı
  const key = `${from || ''}|${to || ''}|${cat || ''}`;
  const existing = (device.alarms || []).find(a => a.key === key);
  if (existing) {
    device.alarms = device.alarms.filter(a => a.key !== key);
    saveDb();
    return { ok: true, on: false, alarms: device.alarms };
  }
  if ((device.alarms || []).length >= max) return { error: `Rota alarmı sınırınız ${max}. Üyeliğinizi yükselterek artırabilirsiniz.` };
  device.alarms = [...(device.alarms || []), { key, from, to, cat, createdAt: Date.now() }];
  saveDb();
  return { ok: true, on: true, alarms: device.alarms };
}

function matchesAlarm(alarm, post) {
  if (alarm.cat && post.category !== alarm.cat) return false;
  if (alarm.from && !(post.from && norm(post.from).includes(norm(alarm.from)))) return false;
  if (alarm.to && !(post.to && norm(post.to).includes(norm(alarm.to)))) return false;
  return true;
}

function sendMessage(deviceId, body) {
  const p = db.posts.find(x => x.id === body.postId);
  if (!p) return { error: 'İlan bulunamadı.' };
  const text = cleanText(body.text, 400);
  if (text.length < 2) return { error: 'Mesaj çok kısa.' };
  const msg = { id: uid('m'), postId: p.id, fromDevice: deviceId, fromViewer: true, text, createdAt: Date.now() };
  db.messages.push(msg);
  saveDb();
  sse('message', { postId: p.id, message: msg });
  // Kurgusal otomatik yanıt: canlı mesajlaşma hissini verir
  setTimeout(() => {
    const replies = [
      'Merhaba, ilan için teşekkürler. Eşya hacmi ve kat bilgisi verirseniz net fiyat çıkarabilirim.',
      'Merhaba, o tarihte müsaitiz. Yükleme adresini yazarsanız güzergâha ekleyelim.',
      'Merhaba, belirttiğiniz yön için aracımız mevcut. Detayları telefonda görüşelim.'
    ];
    const reply = {
      id: uid('m'), postId: p.id, fromDevice: p.companyId, fromViewer: false,
      text: replies[Math.floor(Math.random() * replies.length)], createdAt: Date.now()
    };
    db.messages.push(reply);
    saveDb();
    sse('message', { postId: p.id, message: reply });
  }, 2600);
  return { ok: true, message: msg };
}

function threadFor(deviceId, postId) {
  return db.messages
    .filter(m => m.postId === postId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(m => ({ id: m.id, fromViewer: !!m.fromViewer, text: m.text, createdAt: m.createdAt, ago: relTime(m.createdAt) }));
}

function reportPost(deviceId, postId, reason) {
  const p = db.posts.find(x => x.id === postId);
  if (!p) return { error: 'İlan bulunamadı.' };
  p.flags = (p.flags || 0) + 1;
  db.reports.push({ id: uid('r'), postId, deviceId, reason: cleanText(reason, 200), createdAt: Date.now() });
  saveDb();
  return { ok: true, flags: p.flags };
}

function stats() {
  const active = db.posts.filter(p => !isExpired(p) && p.status === 'active').length;
  const today = db.posts.filter(p => Date.now() - p.createdAt < 86400000).length;
  return {
    published: db.stats.published,
    today,
    activeListings: active,
    companies: db.companies.length,
    volumeTL: db.stats.volumeTL,
    categories: CATEGORIES.map(c => ({ id: c.id, label: c.label, count: db.posts.filter(p => p.category === c.id && !isExpired(p)).length }))
  };
}

function viewerInfo(deviceId) {
  const d = getDevice(deviceId);
  const company = db.companies.find(c => c.deviceId === deviceId);
  return {
    deviceId,
    todayPosts: d.daily.posts,
    saved: d.saved, alarms: d.alarms || [],
    company: company ? { ...publicCompany(company), phone: company.phone, token: company.token } : null,
    ownedPosts: d.ownedPosts || []
  };
}

/* ------------------------------------------------------------- router */
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 200000) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon'
};
function serveStatic(req, res, urlPath) {
  let p = urlPath === '/' ? '/index.html' : urlPath;
  if (p.startsWith('/defter')) p = '/index.html';
  const file = path.normalize(path.join(PUB, p));
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404 — sayfa yok'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = u.pathname;
  const deviceId = String(req.headers['x-device'] || '').slice(0, 64) || 'anon';

  // SSE: canlı akış
  if (p === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive', 'X-Accel-Buffering': 'no'
    });
    res.write(`retry: 3000\nevent: hello\ndata: ${JSON.stringify({ t: Date.now() })}\n\n`);
    sseClients.add(res);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, 20000);
    req.on('close', () => { clearInterval(ping); sseClients.delete(res); });
    return;
  }

  if (!p.startsWith('/api/')) return serveStatic(req, res, p);

  try {
    /* GET uçları */
    if (req.method === 'GET') {
      if (p === '/api/bootstrap') {
        return send(res, 200, {
          provinces: PROVINCES.map(x => ({ name: x.name, plaka: x.plaka })),
          categories: CATEGORIES,
          serviceOptions: SERVICE_OPTIONS, hotRoutes: HOT_ROUTES,
          pricing: PRICING, stats: stats(), viewer: viewerInfo(deviceId)
        });
      }
      if (p === '/api/posts') {
        const q = Object.fromEntries(u.searchParams.entries());
        return send(res, 200, { ...listPosts(q, deviceId), stats: stats() });
      }
      if (p === '/api/stats') return send(res, 200, { ...stats(), viewer: viewerInfo(deviceId) });
      if (p === '/api/viewer') return send(res, 200, viewerInfo(deviceId));
      if (p === '/api/route') {
        return send(res, 200, routeInfo(u.searchParams.get('from'), u.searchParams.get('to')) || { error: 'İl bulunamadı' });
      }
      if (p === '/api/estimate') {
        const services = (u.searchParams.get('services') || '').split(',').filter(Boolean);
        const est = estimatePrice({
          from: u.searchParams.get('from'), to: u.searchParams.get('to'),
          m3: Number(u.searchParams.get('m3') || 0), floor: Number(u.searchParams.get('floor') || 0),
          elevator: u.searchParams.get('elevator') === '1', services
        });
        return send(res, 200, est || { error: 'İl bulunamadı' });
      }
      const mPost = p.match(/^\/api\/post\/([\w-]+)$/);
      if (mPost) {
        const post = db.posts.find(x => x.id === mPost[1]);
        if (!post) return send(res, 404, { error: 'İlan bulunamadı.' });
        post.views += 1; saveDb();
        const cm = companyMap();
        const company = cm.get(post.companyId);
        const related = listPosts({ cat: post.category, city: post.from || post.to || '', limit: 6 }, deviceId)
          .items.filter(x => x.id !== post.id).slice(0, 4);
        return send(res, 200, {
          post: publicPost(post, { deviceId, full: true }),
          thread: threadFor(deviceId, post.id),
          companyPosts: db.posts.filter(x => x.companyId === post.companyId && x.id !== post.id && !isExpired(x))
            .slice(0, 5).map(x => publicPost(x, { deviceId })),
          companyStats: { posts: db.posts.filter(x => x.companyId === post.companyId).length, ...(company ? {} : {}) },
          related
        });
      }
      const mCompany = p.match(/^\/api\/company\/([\w-]+)$/);
      if (mCompany) {
        const c = db.companies.find(x => x.id === mCompany[1]);
        if (!c) return send(res, 404, { error: 'Firma bulunamadı.' });
        return send(res, 200, {
          company: publicCompany(c),
          posts: db.posts.filter(x => x.companyId === c.id && !isExpired(x)).map(x => publicPost(x, { deviceId })),
          isMine: c.deviceId === deviceId
        });
      }
      return send(res, 404, { error: 'Uç nokta bulunamadı.' });
    }

    /* POST uçları */
    if (req.method === 'POST') {
      const body = await readBody(req);
      if (p === '/api/post') return send(res, 200, createPost(deviceId, body));
      if (p === '/api/post/update') return send(res, 200, updatePost(deviceId, body.id, body));
      if (p === '/api/post/delete') return send(res, 200, deletePost(deviceId, body.id, body.token));
      if (p === '/api/post/refresh') return send(res, 200, refreshPost(deviceId, body.id, body.token));
      if (p === '/api/post/reveal') return send(res, 200, revealPhone(deviceId, body.id));
      if (p === '/api/post/save') return send(res, 200, toggleSave(deviceId, body.id));
      if (p === '/api/post/report') return send(res, 200, reportPost(deviceId, body.id, body.reason));
      if (p === '/api/alarm') return send(res, 200, toggleAlarm(deviceId, body));
      if (p === '/api/message') return send(res, 200, sendMessage(deviceId, body));
      if (p === '/api/reset') { resetDb(); return send(res, 200, { ok: true }); }
      if (p === '/api/demo/gen') { const post = generateDemoPost(); return send(res, 200, { ok: true, post: publicPost(post) }); }
      return send(res, 404, { error: 'Uç nokta bulunamadı.' });
    }
    send(res, 405, { error: 'Metot desteklenmiyor.' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'Sunucu hatası: ' + e.message });
  }
});

loadDb();

// Kurgusal ilan üretici: hem zamanlayıcı hem de "demo üret" ucu kullanır.
function generateDemoPost() {
  const company = db.companies[Math.floor(Math.random() * db.companies.length)];
  const cat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)].id;
  const needRoute = CAT_BY_ID.get(cat).needsRoute;
  const a = PROVINCES[Math.floor(Math.random() * PROVINCES.length)];
  let b = PROVINCES[(PROVINCES.indexOf(a) + 5 + Math.floor(Math.random() * 20)) % PROVINCES.length];
  const lines = {
    bos_arac: `${a.name}'dan ${b.name} yönüne aracımız boş geçiyor, parça ya da tam ev işi alabiliriz.`,
    yuk_is: `${a.name} çıkışlı ${b.name} varışlı taşıma işi için araç aranıyor, fiyat teklifi bekliyoruz.`,
    parca: `${a.name}'dan ${b.name}'a parça eşya seferimiz var, koli ve beyaz eşya kabul ediyoruz.`,
    asansor: `${a.name} ve çevresinde operatörlü modüler asansör kiralama hizmeti veriyoruz.`,
    depo: `${a.name}'da kapalı eşya depolama alanımız müsait, aylık kiralama yapıyoruz.`,
    ekip: `${a.name} bölgesinde yükleme-boşaltma ve montaj ekibi günlük olarak kiralanır.`
  };
  const now = Date.now();
  const post = {
    id: uid('p'), companyId: company.id, category: cat,
    from: a.name, to: needRoute ? b.name : null,
    text: lines[cat], createdAt: now, updatedAt: now, bumpedAt: now,
    boostUntil: 0, status: 'active', views: 0, saves: 0, flags: 0, token: uid('tok_')
  };
  db.posts.unshift(post);
  db.stats.published += 1;
  saveDb();
  sse('post', publicPost(post));
  // Rota alarmı eşleşmelerini ilgililere bildir
  Object.entries(db.devices).forEach(([devId, dev]) => {
    (dev.alarms || []).forEach(al => {
      if (matchesAlarm(al, post)) {
        sse('alarm', { postId: post.id, deviceId: devId, alarm: al, post: publicPost(post) });
      }
    });
  });
  return post;
}

// Akış canlı kalsın diye belirli aralıkla kurgusal ilan düşür
if (process.env.YOLPANO_QUIET !== '1') {
  setInterval(generateDemoPost, Number(process.env.YOLPANO_TICK || 45000));
}

server.listen(PORT, HOST, () => {
  console.log(`Yolpano çalışıyor → http://${HOST}:${PORT}`);
});

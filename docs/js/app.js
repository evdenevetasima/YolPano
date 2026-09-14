/* =============================================================
   Yolpano — istemci uygulaması
   Bağımlılık yok: saf JS + hash yönlendirici + SSE canlı akış.
   ============================================================= */
(function () {
  'use strict';

  /* --------------------------------------------------------- durum */
  const S = {
    data: null,          // bootstrap (iller, kategoriler, fiyat modeli)
    posts: [], total: 0, page: 1, pages: 1, loading: false,
    q: '', cat: 'all', sort: 'smart', city: '', from: '', to: '',
    liveCount: 0,
    deviceId: localStorage.getItem('yp.device') || ('d_' + Math.random().toString(36).slice(2) + Date.now().toString(36)),
    revealed: new Map(), // postId -> telefon
    routeMeta: null
  };
  localStorage.setItem('yp.device', S.deviceId);
  const CATS = {};

  /* ----------------------------------------------------- yardımcılar */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const view = $('#view');

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const trLower = s => String(s || '').toLocaleLowerCase('tr-TR');
  const norm = s => trLower(s).replace(/[çğıöşü]/g, c => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }[c]));
  const money = n => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' ₺';
  const compact = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + 'M' : n >= 1000 ? Math.round(n / 1000) + 'B' : String(n);

  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  function ago(ts) {
    const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return s + ' sn önce';
    const m = Math.floor(s / 60); if (m < 60) return m + ' dk önce';
    const h = Math.floor(m / 60); if (h < 24) return h + ' saat önce';
    const d = Math.floor(h / 24); if (d < 30) return d + ' gün önce';
    return Math.floor(d / 30) + ' ay önce';
  }
  function clock(ts) {
    return new Date(ts).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }
  function highlight(text, q) {
    const safe = esc(text);
    if (!q) return safe;
    const toks = norm(q).split(/\s+/).filter(t => t.length > 1);
    if (!toks.length) return safe;
    const words = safe.split(/(\s+)/);
    return words.map(w => {
      const nw = norm(w.replace(/<[^>]+>/g, ''));
      if (toks.some(t => nw.includes(t))) return '<mark>' + w + '</mark>';
      return w;
    }).join('');
  }

  /* ------------------------------------------------------------- API */
  async function api(path, body) {
    const opt = { headers: { 'x-device': S.deviceId } };
    if (body !== undefined) {
      opt.method = 'POST';
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    const r = await fetch(path, opt);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  /* ---------------------------------------------------------- toast */
  function toast(title, desc, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = '<div><b>' + esc(title) + '</b>' + (desc ? '<small>' + esc(desc) + '</small>' : '') + '</div>';
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(20px)'; el.style.transition = '.3s'; }, 3800);
    setTimeout(() => el.remove(), 4200);
  }

  /* ---------------------------------------------------------- modal */
  function modal(html, opts = {}) {
    closeModal();
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = '<div class="modal ' + (opts.narrow ? 'narrow' : '') + '" role="dialog" aria-modal="true">' + html + '</div>';
    $('#modalRoot').appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });
    const first = ov.querySelector('input, textarea, select, button');
    if (first) setTimeout(() => first.focus(), 40);
    return ov;
  }
  function closeModal() { $('#modalRoot').innerHTML = ''; }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {
      e.preventDefault(); $('#globalSearch').focus();
    }
  });


  /* Çizgi ikonlar (emoji fontu gerektirmez) */
  const ICO = {
    eye: '<svg class="ico-s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    phone: '<svg class="ico-s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.13.96.36 1.9.7 2.8a2 2 0 0 1-.45 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.27a2 2 0 0 1 2.1-.45c.9.34 1.84.57 2.8.7a2 2 0 0 1 1.7 2.03z"/></svg>',
    flag: '<svg class="ico-s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 8 2a6 6 0 0 0 3-.7V14a6 6 0 0 1-3 .7c-3 0-5-2-8-2a6 6 0 0 0-4 1.3"/></svg>',
    save: '<svg class="ico-s" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-4.5L5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
  };
  /* ------------------------------------------------------ bileşenler */
  function catTag(catId) {
    const c = CATS[catId] || { label: catId };
    return '<span class="cat-tag cat-' + esc(catId) + '">' + esc(c.label) + '</span>';
  }
  function badgeFor(co) {
    if (!co) return '';
    return co.verified ? '<span class="badge badge-verified">✓ Doğrulanmış</span>' : '';
  }
  function avatarFor(co) {
    return '<span class="avatar">' + esc(co.initials || 'YP') + '</span>';
  }
  function routeLine(p) {
    if (!p.from && !p.to) return '';
    if (p.from && p.to) {
      const km = p.route ? '<span class="km">' + p.route.km + ' km · ' + p.route.hours + ' sa</span>' : '';
      return '<div class="route"><span class="city">' + esc(p.from) + '</span>' +
        '<span class="sep">➜</span><span class="city">' + esc(p.to) + '</span>' + km + '</div>';
    }
    return '<div class="route"><span class="city">' + esc(p.from || p.to) + '</span></div>';
  }

  function postCard(p, opts = {}) {
    const co = p.company || {};
    const revealedPhone = S.revealed.get(p.id);
    const mine = (S.data && S.data.viewer.ownedPosts || []).includes(p.id);
    const callBtn = revealedPhone
      ? '<a class="pill pill-call" href="tel:' + esc(revealedPhone.replace(/\s/g, '')) + '">' + ICO.phone + ' ' + esc(revealedPhone) + '</a>'
      : '<button class="pill pill-call" data-act="reveal" data-id="' + esc(p.id) + '">' + ICO.phone + ' Numarayı Göster</button>';
    return '' +
      '<article class="post ' + (p.boosted ? 'boosted ' : '') + (p.status === 'solved' ? 'solved ' : '') + '" data-post="' + esc(p.id) + '">' +
        '<div class="post-head">' +
          avatarFor(co) +
          '<div class="who">' +
            '<a href="#/firma/' + esc(co.id) + '">' + esc(co.name) + '</a>' +
            '<div class="meta">' + badgeFor(co) +
              '<span>' + esc(co.city || '') + '</span>' +
              (co.rating ? '<span>★ ' + co.rating.toFixed(1) + ' · ' + co.jobs + ' iş</span>' : '') +
              '<span>· ' + esc(ago(p.bumpedAt || p.createdAt)) + '</span>' +
            '</div>' +
          '</div>' +
          catTag(p.category) +
        '</div>' +
        '<a class="post-link" href="#/ilan/' + esc(p.id) + '">' + routeLine(p) + '</a>' +
        '<p class="post-text">' + highlight(p.text, opts.q || S.q) + '</p>' +
        '<div class="post-foot">' +
          '<div class="foot-left">' +
            (p.status === 'solved' ? '<span class="status-solved">İş tamamlandı</span>' : '') +
            (mine ? '<span class="pill-stat">◆ senin ilanınız</span>' : '') +
            ICO.eye + '<span class="pill-stat"> ' + p.views + '</span>' +
            '<span class="pill-stat" style="color:#a12339">♥ ' + p.saves + '</span>' +
          '</div>' +
          '<div class="actions">' +
            '<button class="pill pill-icon pill-save ' + (p.saved ? 'on' : '') + '" data-act="save" data-id="' + esc(p.id) + '" title="Kaydet">' + (p.saved ? '♥' : '♡') + '</button>' +
            '<button class="pill pill-msg" data-act="msg" data-id="' + esc(p.id) + '">Mesaj</button>' +
            callBtn +
          '</div>' +
        '</div>' +
      '</article>';
  }

  /* ---------------------------------------------------- ilan yükleme */
  async function loadPosts(reset) {
    if (reset) { S.page = 1; S.posts = []; }
    S.loading = true;
    const feed = $('#feed');
    if (reset && feed) feed.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
    const params = new URLSearchParams({
      page: S.page, limit: 12, sort: S.sort, q: S.q, cat: S.cat,
      city: S.city, from: S.from, to: S.to, open: '0'
    });
    const r = await api('/api/posts?' + params.toString());
    S.posts = reset ? r.items : S.posts.concat(r.items);
    S.total = r.total; S.pages = r.pages; S.page = r.page;
    S.loading = false;
    renderFeed(r.stats);
  }

  function renderFeed(stats) {
    const feed = $('#feed');
    if (!feed) return;
    if (!S.posts.length) {
      feed.innerHTML = '<div class="empty card"><span class="big-ico">◈</span><b>Bu ölçütlerde ilan yok.</b>' +
        '<p>Filtreleri gevşetin ya da ilk ilanı siz verin.</p>' +
        '<button class="btn btn-primary" data-act="open-composer">İlan Ver</button></div>';
    } else {
      feed.innerHTML = S.posts.map(p => postCard(p)).join('');
      if (S.page < S.pages) {
        feed.insertAdjacentHTML('beforeend',
          '<button class="btn btn-light loadmore" data-act="more">Daha fazla ilan (' + (S.total - S.posts.length) + ')</button>');
      }
    }
    const rl = $('#resultline');
    if (rl) {
      const bits = [];
      if (S.q) bits.push('“' + esc(S.q) + '” araması');
      if (S.cat !== 'all') bits.push(CATS[S.cat].label);
      if (S.from || S.to) bits.push((S.from || '?') + ' → ' + (S.to || '?') + ' rotası');
      if (S.city) bits.push(S.city);
      rl.innerHTML = '<div><b>' + S.total + '</b> ilan listeleniyor' + (bits.length ? ' · ' + bits.join(' · ') : '') + '</div>' +
        '<div class="quota">Bugün eklenen: <b>' + (stats ? stats.today : '—') + '</b></div>';
    }
    if (stats) renderRailStats(stats);
  }

  function renderRailStats(stats) {
    const el = $('#catCounts');
    if (el) {
      el.innerHTML = stats.categories.map(c =>
        '<div class="alarm-row"><b>' + esc(c.label) + '</b><small>' + c.count + ' aktif ilan</small>' +
        '<button class="btn btn-sm btn-light" data-act="cat" data-cat="' + esc(c.id) + '">Filtrele</button></div>').join('');
    }
    const t = $('#todayCount'); if (t) t.textContent = stats.today;
    const a = $('#activeCount'); if (a) a.textContent = compact(stats.activeListings);
    const pc = $('#publishedCount'); if (pc) pc.textContent = compact(stats.published);
  }

  /* --------------------------------------------------- akış görünümü */
  function renderFeedView() {
    const provinceButtons = S.data.provinces.slice(0, 81).map(p =>
      '<button data-act="city" data-city="' + esc(p.name) + '" class="' + (S.city === p.name ? 'on' : '') + '">' + esc(p.name) + '</button>').join('');

    view.innerHTML = '' +
      '<section class="hero">' +
        '<div>' +
          '<h1>Boş araç ile yükü <span>tek panoda</span> buluştur.</h1>' +
          '<p>Nakliyeciler güzergâhını, iş sahipleri yükünü yazar. Yolpano rotaları eşleştirir, mesafeyi hesaplar, fiyat aralığını çıkarır.</p>' +
          '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">' +
            '<button class="btn btn-primary" data-act="open-composer">Hemen ilan ver</button>' +
            '<a class="btn btn-ghost" href="#/hesapla">Fiyat tahmini al</a>' +
          '</div>' +
        '</div>' +
        '<div class="hero-stats">' +
          '<div class="stat"><b id="todayCount">—</b><small>bugün paylaşılan ilan</small></div>' +
          '<div class="stat"><b id="activeCount">—</b><small>aktif ilan</small></div>' +
          '<div class="stat"><b id="publishedCount">—</b><small>toplam paylaşım</small></div>' +
          '<div class="stat"><b>' + S.data.stats.companies + '</b><small>kayıtlı taşımacı</small></div>' +
        '</div>' +
      '</section>' +

      '<div class="layout">' +
        '<div>' +
          composerHTML() +
          '<div class="filterbar">' +
            '<div class="tabs" id="catTabs">' +
              '<button class="tab ' + (S.cat === 'all' ? 'active' : '') + '" data-act="cat" data-cat="all">Tümü</button>' +
              Object.values(CATS).map(c =>
                '<button class="tab ' + (S.cat === c.id ? 'active' : '') + '" data-act="cat" data-cat="' + esc(c.id) + '">' + esc(c.label) + '</button>').join('') +
            '</div>' +
            '<div class="routebox">' +
              '<input id="fromInput" list="cityList" placeholder="Çıkış ili" value="' + esc(S.from) + '" aria-label="Çıkış ili">' +
              '<span class="arrow">➜</span>' +
              '<input id="toInput" list="cityList" placeholder="Varış ili" value="' + esc(S.to) + '" aria-label="Varış ili">' +
              '<span class="route-meta" id="routeMeta" ' + (S.routeMeta ? '' : 'hidden') + '>' + (S.routeMeta ? S.routeMeta.km + ' km' : '') + '</span>' +
              '<button class="clear" data-act="clear-route" title="Rotayı temizle" ' + (S.from || S.to ? '' : 'hidden') + '>✕</button>' +
            '</div>' +
            '<div class="selectwrap"><select id="sortSel" aria-label="Sıralama">' +
              '<option value="smart"' + (S.sort === 'smart' ? ' selected' : '') + '>En yeni önce</option>' +
              '<option value="popular"' + (S.sort === 'popular' ? ' selected' : '') + '>En çok görüntülenen</option>' +
            '</select></div>' +
          '</div>' +
          '<datalist id="cityList">' + S.data.provinces.map(p => '<option value="' + esc(p.name) + '">').join('') + '</datalist>' +
          '<div class="resultline" id="resultline"></div>' +
          '<div id="liveNew"></div>' +
          '<div class="feed" id="feed"></div>' +
        '</div>' +

        '<aside class="rail">' +
          '<div class="card card-pad">' +
            '<div class="card-title"><span><span class="dot"></span> Rota alarmı</span><small>' + alarmQuotaText() + '</small></div>' +
            '<div class="fieldrow" style="margin-bottom:8px">' +
              '<div class="field"><label>Çıkış</label><input id="alarmFrom" list="cityList" placeholder="İl"></div>' +
              '<div class="field"><label>Varış</label><input id="alarmTo" list="cityList" placeholder="İl"></div>' +
            '</div>' +
            '<button class="btn btn-dark btn-sm" data-act="add-alarm" style="width:100%">+ Alarm kur</button>' +
            '<div id="alarmList" style="margin-top:10px">' + alarmListHTML() + '</div>' +
          '</div>' +

          '<div class="card card-pad">' +
            '<div class="card-title"><span><span class="dot"></span> Kategoriler</span></div>' +
            '<div id="catCounts"></div>' +
          '</div>' +

          '<div class="card card-pad">' +
            '<div class="card-title"><span><span class="dot"></span> Popüler güzergâhlar</span></div>' +
            '<div class="hotroutes">' + S.data.hotRoutes.map(r =>
              '<button data-act="route" data-from="' + esc(r[0]) + '" data-to="' + esc(r[1]) + '">' +
              '<span>' + esc(r[0]) + ' ➜ ' + esc(r[1]) + '</span><small>tıkla</small></button>').join('') +
            '</div>' +
          '</div>' +

          '<div class="card card-pad">' +
            '<div class="card-title"><span><span class="dot"></span> İller</span><small>81 il</small></div>' +
            '<div class="province-grid">' + provinceButtons + '</div>' +
            (S.city ? '<button class="btn btn-sm btn-light" style="margin-top:10px;width:100%" data-act="city" data-city="">Şehir filtresini kaldır</button>' : '') +
          '</div>' +

        '</aside>' +
      '</div>' +
      footerHTML();

    wireRouteInputs();
    wireComposer();
    loadPosts(true);
  }

  function alarmQuotaText() {
    const n = (S.data.viewer.alarms || []).length;
    return n + '/20';   // ücretsiz modelde herkes 20 alarm kurabilir
  }
  function alarmListHTML() {
    const al = S.data.viewer.alarms || [];
    if (!al.length) return '<small style="color:var(--muted)">Alarm yok. Güzergâh belirleyin, yeni ilan düşünce bildirelim.</small>';
    return al.map(a => '<div class="alarm-row"><div><b>' + esc((a.from || 'Her yer') + ' ➜ ' + (a.to || 'Her yön')) + '</b>' +
      '<small>' + (a.cat ? CATS[a.cat].label : 'Tüm kategoriler') + '</small></div>' +
      '<button class="btn btn-sm btn-danger" data-act="del-alarm" data-key="' + esc(a.key) + '">Kaldır</button></div>').join('');
  }
  function footerHTML() {
    return '<footer class="footer">' +
      '<div><b>Yolpano</b> — kurgusal demo platformu. Tüm firma, kişi ve ilanlar örnek veridir.</div>' +
      '<div>SSE canlı akış · rota eşleştirme · fiyat tahmini · rota alarmı · <a href="#/yonetim" style="text-decoration:underline">yönetim paneli (demo)</a></div></footer>';
  }

  /* ------------------------------------------------------- composer */
  function composerHTML() {
    const v = S.data.viewer;
    const opts = S.data.provinces.map(p => '<option value="' + esc(p.name) + '">').join('');
    return '<section class="card composer ' + (localStorage.getItem('yp.composer') === '1' ? '' : 'collapsed') + '" id="composer">' +
      '<div class="composer-top">' +
        '<div style="flex:1"><b>İlan ver — 30 saniyede yayında</b><br><small>Boş araç, yük/iş, parça eşya, asansör, depolama veya ekip ilanı</small></div>' +
        '<button class="btn btn-ghost btn-sm" data-act="toggle-composer" id="composerToggle">Aç / Kapat</button>' +
      '</div>' +
      '<div class="composer-body">' +
        '<datalist id="composerCities">' + opts + '</datalist>' +
        '<div class="catpick" id="catPick">' +
          Object.values(CATS).map((c, i) => '<button data-cat="' + esc(c.id) + '" class="' + (i === 0 ? 'on' : '') + '">' + esc(c.label) + '</button>').join('') +
        '</div>' +
        '<p id="catHint" style="margin:0 0 12px;color:var(--muted);font-size:13px"></p>' +
        '<div class="fieldrow" id="routeFields">' +
          '<div class="field"><label>Çıkış ili</label><input id="cFrom" list="composerCities" placeholder="Örn. İstanbul"></div>' +
          '<div class="field"><label>Varış ili <span style="font-weight:500">(boş bırakılabilir)</span></label><input id="cTo" list="composerCities" placeholder="Örn. İzmir"></div>' +
        '</div>' +
        '<div class="field"><label>İlan açıklaması</label>' +
          '<textarea id="cText" maxlength="1000" placeholder="Ne taşıyorsunuz / hangi yöne boşsunuz? Hacim, kat, tarih gibi detayları yazın. Telefon numarası yazmayın — iletişim butonları üzerinden ulaşılıyor."></textarea>' +
          '<div class="countbar"><span class="hint" id="catHint2"></span><span><b id="cCount">0</b>/1000 · en az 25</span></div>' +
        '</div>' +
        '<div class="fieldrow" style="margin-top:12px">' +
          '<div class="field"><label>Firma / kişi adı</label><input id="cName" value="' + esc(v.company ? v.company.name : (v.name || '')) + '" placeholder="Örn. Kervan Yol Taşımacılık"></div>' +
          '<div class="field"><label>Telefon (yalnızca karşı tarafa gösterilir)</label><input id="cPhone" value="' + esc(v.company ? v.company.phone : '') + '" placeholder="05xx xxx xx xx"></div>' +
        '</div>' +
        '<div class="fieldrow">' +
          '<div class="field"><label>Merkez il</label><input id="cCity" list="composerCities" value="' + esc(v.company ? v.company.city : '') + '" placeholder="Örn. İstanbul"></div>' +
          '<div class="field"><label>Kısa tanıtım</label><input id="cAbout" value="' + esc(v.company ? v.company.about : '') + '" placeholder="Filomuz, hizmet alanımız..."></div>' +
        '</div>' +
        '<div class="composer-foot">' +
          '<div class="quota">Yolpano tamamen ücretsiz — sınırsız paylaşım.</div>' +
          '<button class="btn btn-primary" data-act="publish" id="publishBtn">Yayınla</button>' +
        '</div>' +
      '</div>' +
    '</section>';
  }

  function wireComposer() {
    const pick = $('#catPick'); if (!pick) return;
    const hint = $('#catHint'), rf = $('#routeFields');
    function syncCat() {
      const on = pick.querySelector('button.on');
      if (!on) return;
      const c = CATS[on.dataset.cat];
      hint.textContent = c.desc;
      rf.style.display = c.needsRoute ? '' : 'none';
    }
    pick.addEventListener('click', e => {
      const b = e.target.closest('button[data-cat]'); if (!b) return;
      $$('#catPick button').forEach(x => x.classList.toggle('on', x === b));
      syncCat();
    });
    syncCat();
    const ta = $('#cText');
    ta.addEventListener('input', () => {
      const n = ta.value.trim().length;
      const el = $('#cCount');
      el.textContent = n;
      el.className = n > 0 && n < 25 ? 'bad' : '';
    });
  }

  async function publish() {
    const btn = $('#publishBtn');
    const onCat = $('#catPick button.on');
    const payload = {
      category: onCat ? onCat.dataset.cat : 'bos_arac',
      from: $('#cFrom').value.trim(), to: $('#cTo').value.trim(),
      text: $('#cText').value.trim(),
      companyName: $('#cName').value.trim(), phone: $('#cPhone').value.trim(),
      city: $('#cCity').value.trim(), about: $('#cAbout').value.trim()
    };
    btn.disabled = true; btn.textContent = 'Yayınlanıyor…';
    try {
      const r = await api('/api/post', payload);
      if (r.error) throw new Error(r.error);
      toast('İlan yayında', 'Pano akışının en üstünde görünüyor.', 'ok');
      S.revealed.set(r.post.id, null);
      await refreshViewer();
      renderFeedView();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      toast('Yayınlanamadı', e.message, 'err');
    } finally {
      const b2 = $('#publishBtn'); if (b2) { b2.disabled = false; b2.textContent = 'Yayınla'; }
    }
  }

  /* ------------------------------------------------- detay / mesaj */
  async function openPost(id) {
    let r;
    try { r = await api('/api/post/' + id); } catch (e) { toast('Açılamadı', e.message, 'err'); return; }
    const p = r.post;
    const v = S.data.viewer;
    const mine = (v.ownedPosts || []).includes(p.id);
    const phone = S.revealed.get(p.id) || p.phone;

    modal('' +
      '<div class="modal-head">' +
        '<div>' + catTag(p.category) + ' <h3 style="margin-top:6px">' + esc(p.from && p.to ? p.from + ' ➜ ' + p.to : (p.from || p.company.name)) + '</h3></div>' +
        '<button class="x-btn" data-act="close">✕</button>' +
      '</div>' +
      '<div class="modal-body">' +
        '<div class="detail-grid">' +
          '<div>' +
            '<p class="post-text" style="font-size:15px">' + esc(p.text) + '</p>' +
            '<div style="margin:14px 0">' + routeLine(p) + '</div>' +
            '<div class="kv"><span>Yayınlanma</span><b>' + esc(ago(p.createdAt)) + '</b></div>' +
            '<div class="kv"><span>Görüntülenme</span><b>' + p.views + '</b></div>' +
            '<div class="kv"><span>Kaydeden</span><b>' + p.saves + ' kişi</b></div>' +
            (p.route ? '<div class="kv"><span>Tahmini mesafe</span><b>' + p.route.km + ' km · ~' + p.route.hours + ' saat</b></div>' : '') +
            '<div class="contactbox">' +
              (phone
                ? '<div class="phone-reveal">' + ICO.phone + '<span style="width:8px"></span><div><small style="color:var(--accent-ink)">İletişim</small><br><b>' + esc(phone) + '</b><br>' +
                  '<a class="btn btn-sm btn-light" style="margin-top:6px" href="tel:' + esc(phone.replace(/\s/g, '')) + '">Ara</a></div></div>'
                : '<button class="btn btn-primary" style="width:100%" data-act="reveal" data-id="' + esc(p.id) + '">' + ICO.phone + ' Numarayı Göster</button>' +
                  '<p style="font-size:11.5px;color:var(--muted);margin-top:8px">Numara açma tamamen ücretsiz ve sınırsızdır.</p>') +
            '</div>' +
            '<div class="actionrow">' +
              '<button class="btn btn-light btn-sm" data-act="save" data-id="' + esc(p.id) + '">' + (p.saved ? '♥ Kayıtlı' : '♡ Kaydet') + '</button>' +
              '<button class="btn btn-light btn-sm" data-act="report" data-id="' + esc(p.id) + '">' + ICO.flag + ' Şikâyet et</button>' +
              (mine ? '<button class="btn btn-light btn-sm" data-act="refresh" data-id="' + esc(p.id) + '">↑ Öne al</button>' : '') +
              (mine ? '<button class="btn btn-danger btn-sm" data-act="solve" data-id="' + esc(p.id) + '">İşi tamamlandı işaretle</button>' : '') +
              (mine ? '<button class="btn btn-danger btn-sm" data-act="del" data-id="' + esc(p.id) + '">Sil</button>' : '') +
            '</div>' +
            '<div class="chatblock">' +
              '<div class="card-title"><span><span class="dot"></span> Mesajlaşma</span></div>' +
              '<div class="chat" id="chat">' + threadHTML(r.thread) + '</div>' +
              '<div class="chat-input">' +
                '<textarea id="msgText" maxlength="400" placeholder="Mesajınızı yazın..."></textarea>' +
                '<button class="btn btn-primary" data-act="send" data-id="' + esc(p.id) + '">Gönder</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<aside>' +
            '<div class="card card-pad" style="margin-bottom:12px">' +
              '<div style="display:flex;gap:10px;align-items:center">' + avatarFor(p.company) +
              '<div><a href="#/firma/' + esc(p.company.id) + '" style="font-weight:750">' + esc(p.company.name) + '</a>' +
              '<div style="font-size:12px;color:var(--muted)">' + esc(p.company.city) + ' · ' + esc(p.company.since || '') + 'den beri üye</div></div></div>' +
              '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' + badgeFor(p.company) + '</div>' +
              (p.company.about ? '<p style="font-size:13px;color:var(--muted);margin:10px 0 0">' + esc(p.company.about) + '</p>' : '') +
              '<a class="btn btn-light btn-sm" style="margin-top:12px;width:100%" href="#/firma/' + esc(p.company.id) + '">Firma profilini aç</a>' +
            '</div>' +
          '</aside>' +
        '</div>' +
        (r.related && r.related.length ? '<div style="margin-top:20px"><div class="card-title"><span><span class="dot"></span> Benzer ilanlar</span></div>' +
          r.related.map(x => postCard(x)).join('') + '</div>' : '') +
      '</div>', {});
  }

  function threadHTML(thread) {
    if (!thread || !thread.length) return '<div style="color:var(--muted);font-size:13px">Henüz mesaj yok. İlk mesajı siz yazın.</div>';
    return thread.map(m => '<div class="bubble ' + (m.fromViewer ? 'me' : '') + '">' + esc(m.text) + '<small>' + esc(m.ago) + '</small></div>').join('');
  }

  async function reveal(id, btn) {
    try {
      const r = await api('/api/post/reveal', { id });
      if (r.error) { toast('Numara açılamadı', r.error + (r.needUpgrade ? ' Üyeliğinizi yükseltin.' : ''), 'warn'); return; }
      S.revealed.set(id, r.phone);
      toast('Numara açıldı', 'Tamamen ücretsiz — sınırsız hak.', 'ok');
      const hash = location.hash;
      if (hash.startsWith('#/ilan/')) openPost(id); else refreshFeedItems();
    } catch (e) { toast('Hata', e.message, 'err'); }
  }

  function refreshFeedItems() {
    const feed = $('#feed'); if (!feed) return;
    feed.innerHTML = S.posts.map(p => postCard(p)).join('');
  }

  /* ------------------------------------------------------ kaydetme */
  async function toggleSave(id) {
    try {
      const r = await api('/api/post/save', { id });
      const p = S.posts.find(x => x.id === id);
      if (p) { p.saved = r.saved; p.saves = r.count; }
      const vp = S.data.viewer;
      vp.saved = r.saved ? vp.saved.concat([id]) : vp.saved.filter(x => x !== id);
      $('#savedCount').textContent = vp.saved.length;
      refreshFeedItems();
      if (location.hash.startsWith('#/kayitli')) renderSavedView();
    } catch (e) { toast('Hata', e.message, 'err'); }
  }

  /* -------------------------------------------------------- arama */
  const onSearch = debounce(() => {
    S.q = $('#globalSearch').value.trim();
    if (location.hash !== '#/' && location.hash !== '') location.hash = '#/';
    else loadPosts(true);
  }, 300);

  /* ------------------------------------------------- rota girişleri */
  function wireRouteInputs() {
    const f = $('#fromInput'), t = $('#toInput');
    if (!f) return;
    const upd = debounce(async () => {
      S.from = titleCaseCity(f.value.trim());
      S.to = titleCaseCity(t.value.trim());
      const clear = $('[data-act="clear-route"]');
      if (clear) clear.hidden = !(S.from || S.to);
      if (S.from && S.to) {
        try {
          const r = await api('/api/route?from=' + encodeURIComponent(S.from) + '&to=' + encodeURIComponent(S.to));
          S.routeMeta = r.km ? r : null;
          const m = $('#routeMeta');
          if (m) { m.hidden = !r.km; m.textContent = r.km ? r.km + ' km · ' + r.hours + ' sa' : ''; }
        } catch (e) { /* yoksay */ }
      } else { S.routeMeta = null; const m = $('#routeMeta'); if (m) m.hidden = true; }
      loadPosts(true);
    }, 350);
    f.addEventListener('input', upd);
    t.addEventListener('input', upd);
  }
  function titleCaseCity(v) {
    if (!v) return '';
    const hit = S.data.provinces.find(p => norm(p.name) === norm(v));
    if (hit) return hit.name;
    return v.toLocaleLowerCase('tr-TR').replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('tr-TR'));
  }

  /* -------------------------------------------------- hesaplayıcı */
  const calcState = { from: 'İstanbul', to: 'Ankara', preset: '2+1', m3: 32, floor: 3, elevator: false, services: [] };

  function renderCalcView() {
    const opts = S.data.provinces.map(p => '<option value="' + esc(p.name) + '">').join('');
    view.innerHTML = '' +
      '<div class="crumbs"><a href="#/">Pano</a> › Fiyat tahmini</div>' +
      '<div class="calc">' +
        '<div class="card card-pad">' +
          '<h2 style="margin-bottom:4px">Nakliyat fiyat tahmini</h2>' +
          '<p style="color:var(--muted);margin:0 0 16px">Güzergâh mesafesi, eşya hacmi, kat durumu ve ek hizmetlere göre tahmini aralık üretir. Teklif değildir.</p>' +
          '<datalist id="calcCities">' + opts + '</datalist>' +
          '<div class="fieldrow">' +
            '<div class="field"><label>Çıkış ili</label><input id="kFrom" list="calcCities" value="' + esc(calcState.from) + '"></div>' +
            '<div class="field"><label>Varış ili</label><input id="kTo" list="calcCities" value="' + esc(calcState.to) + '"></div>' +
          '</div>' +
          '<div class="field"><label>Eşya hacmi</label>' +
            '<div class="optgrid" id="presetPick">' +
              Object.entries(S.data.pricing.volumePresets).map(([k, v]) =>
                '<button class="optchip ' + (calcState.preset === k ? 'on' : '') + '" data-preset="' + esc(k) + '" data-m3="' + v + '">' + esc(k) + ' <small>(' + v + ' m³)</small></button>').join('') +
            '</div>' +
            '<div class="fieldrow" style="margin-top:10px">' +
              '<div class="field"><label>Özel hacim (m³)</label><input id="kM3" type="number" min="1" max="200" value="' + calcState.m3 + '"></div>' +
              '<div class="field"><label>Kat sayısı</label><input id="kFloor" type="number" min="0" max="20" value="' + calcState.floor + '"></div>' +
            '</div>' +
          '</div>' +
          '<div class="field" style="margin-top:6px"><label>Bina asansörü</label>' +
            '<div class="seg" id="elevSeg">' +
              '<button data-elev="0" class="' + (!calcState.elevator ? 'on' : '') + '">Yok</button>' +
              '<button data-elev="1" class="' + (calcState.elevator ? 'on' : '') + '">Var</button>' +
            '</div>' +
          '</div>' +
          '<div class="field" style="margin-top:14px"><label>Ek hizmetler</label>' +
            '<div class="optgrid" id="svcPick">' +
              S.data.serviceOptions.map(o =>
                '<button class="optchip ' + (calcState.services.includes(o.id) ? 'on' : '') + '" data-svc="' + esc(o.id) + '">' + esc(o.label) + '</button>').join('') +
            '</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;margin-top:18px;flex-wrap:wrap">' +
            '<button class="btn btn-primary" data-act="calc">Hesapla</button>' +
            '<button class="btn btn-light" data-act="calc-to-post">Bu iş için ilan ver</button>' +
          '</div>' +
        '</div>' +
        '<div id="calcOut"></div>' +
      '</div>' + footerHTML();

    $('#presetPick').addEventListener('click', e => {
      const b = e.target.closest('[data-preset]'); if (!b) return;
      calcState.preset = b.dataset.preset; calcState.m3 = Number(b.dataset.m3);
      $$('#presetPick .optchip').forEach(x => x.classList.toggle('on', x === b));
      $('#kM3').value = calcState.m3; runCalc();
    });
    $('#svcPick').addEventListener('click', e => {
      const b = e.target.closest('[data-svc]'); if (!b) return;
      const id = b.dataset.svc;
      calcState.services = calcState.services.includes(id) ? calcState.services.filter(x => x !== id) : calcState.services.concat(id);
      b.classList.toggle('on'); runCalc();
    });
    $('#elevSeg').addEventListener('click', e => {
      const b = e.target.closest('[data-elev]'); if (!b) return;
      calcState.elevator = b.dataset.elev === '1';
      $$('#elevSeg button').forEach(x => x.classList.toggle('on', x === b)); runCalc();
    });
    ['#kFrom', '#kTo', '#kM3', '#kFloor'].forEach(sel => $(sel).addEventListener('input', debounce(runCalc, 300)));
    runCalc();
  }

  async function runCalc() {
    calcState.from = titleCaseCity($('#kFrom').value.trim());
    calcState.to = titleCaseCity($('#kTo').value.trim());
    calcState.m3 = Number($('#kM3').value) || 0;
    calcState.floor = Number($('#kFloor').value) || 0;
    const out = $('#calcOut');
    if (!calcState.from || !calcState.to) { out.innerHTML = ''; return; }
    const p = new URLSearchParams({
      from: calcState.from, to: calcState.to, m3: calcState.m3, floor: calcState.floor,
      elevator: calcState.elevator ? '1' : '0', services: calcState.services.join(',')
    });
    let r;
    try { r = await api('/api/estimate?' + p.toString()); } catch (e) { out.innerHTML = ''; return; }
    if (r.error) { out.innerHTML = '<div class="card card-pad"><b>İl bulunamadı.</b> <small>' + esc(r.error) + '</small></div>'; return; }
    out.innerHTML = '' +
      '<div class="estimate">' +
        '<div style="font-size:13px;color:#9dc3bd">' + esc(calcState.from) + ' ➜ ' + esc(calcState.to) + ' · ' + r.route.km + ' km</div>' +
        '<div class="big">' + money(r.total) + '</div>' +
        '<div class="range">Gerçekçi aralık: ' + money(r.range[0]) + ' — ' + money(r.range[1]) + '</div>' +
        '<div style="margin-top:16px">' +
          r.breakdown.map(b => '<div class="kv"><span>' + esc(b.label) + '</span><b>' + money(b.value) + '</b></div>').join('') +
          '<div class="kv"><span>Sigorta payı (%2)</span><b>' + money(r.insurance) + '</b></div>' +
          '<div class="kv"><span>KDV (%20)</span><b>' + money(r.vat) + '</b></div>' +
          '<div class="kv" style="border-top:1px solid rgba(255,255,255,.2);margin-top:6px;padding-top:10px"><span style="color:#fff"><b>Toplam</b></span><b>' + money(r.total) + '</b></div>' +
        '</div>' +
        '<div class="disclaimer">Model: sabit organizasyon payı + km başına birim fiyat + m³ başına hacim bedeli + kat/asansör farkı. Piyasa fiyatları firmaya, sezona ve eşya tipine göre değişir.</div>' +
        '<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap">' +
          '<button class="btn btn-ghost btn-sm" data-act="copy-est">Sonucu kopyala</button>' +
          '<a class="btn btn-ghost btn-sm" href="#/">Pana dön</a>' +
        '</div>' +
      '</div>';
  }

  /* -------------------------------------------------- kayıtlı ilanlar */
  async function renderSavedView() {
    view.innerHTML = '<div class="crumbs"><a href="#/">Pano</a> › Kayıtlı ilanlar</div>' +
      '<div class="card card-pad"><div class="card-title"><span><span class="dot"></span> Kaydettiğiniz ilanlar</span></div><div class="feed" id="feed"></div></div>' + footerHTML();
    const feed = $('#feed');
    feed.innerHTML = '<div class="skeleton"></div>';
    try {
      const r = await api('/api/posts?saved=1&limit=40');
      S.posts = r.items;
      if (!r.items.length) feed.innerHTML = '<div class="empty"><span class="big-ico">♡</span><b>Henüz kayıt yok.</b><p>İlanlardaki kalp simgesiyle buraya ekleyin.</p></div>';
      else feed.innerHTML = r.items.map(p => postCard(p)).join('');
    } catch (e) { feed.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; }
  }

  /* ------------------------------------------------------- pano/hesap */
  async function renderPanelView() {
    const v = await api('/api/viewer');
    S.data.viewer = v;
    const myPosts = await api('/api/posts?mine=1&limit=40');
    view.innerHTML = '' +
      '<div class="crumbs"><a href="#/">Pano</a> › Hesabım</div>' +
      '<div class="layout">' +
        '<div style="display:flex;flex-direction:column;gap:16px">' +
          '<div class="card card-pad">' +
            '<div class="card-title"><span><span class="dot"></span> Firma</span></div>' +
            (v.company
              ? '<div style="display:flex;gap:12px;align-items:center">' +
                  '<span class="avatar">' + esc(v.company.initials) + '</span>' +
                  '<div><b style="font-size:17px">' + esc(v.company.name) + '</b>' +
                  '<div style="color:var(--muted);font-size:13px">' + esc(v.company.city) + ' · ' + esc(v.company.phone) + '</div>' +
                  '<div style="color:var(--muted);font-size:13px">' + esc(v.company.about || '') + '</div></div>' +
                '</div>'
              : '<p style="color:var(--muted)">Henüz firmanız yok. İlk ilanı verdiğinizde otomatik oluşur.</p>') +
          '</div>' +

          '<div class="card card-pad">' +
            '<div class="card-title"><span><span class="dot"></span> Ücretsiz platform</span></div>' +
            '<p style="margin:0;color:var(--muted);font-size:13.5px">Yolpano’da hiçbir özellik için ödeme yoktur; ilan, numara açma, öne alma ve rota alarmlarının tümü sınırsızdır.</p>' +
          '</div>' +

          '<div class="card card-pad">' +
            '<div class="card-title"><span><span class="dot"></span> İlanlarım (' + myPosts.total + ')</span>' +
              '<button class="btn btn-sm btn-primary" data-act="open-composer">Yeni ilan</button></div>' +
            '<div class="feed" id="feed">' + (myPosts.items.length ? myPosts.items.map(p => postCard(p)).join('') : '<div class="empty"><span class="big-ico">✎</span><b>İlanınız yok.</b></div>') + '</div>' +
          '</div>' +
        '</div>' +

        '<aside class="rail">' +
          '<div class="card card-pad">' +
            '<div class="card-title"><span><span class="dot"></span> Rota alarmları</span><small>' + alarmQuotaText() + '</small></div>' +
            '<div id="alarmList">' + alarmListHTML() + '</div>' +
          '</div>' +
        '</aside>' +
      '</div>' + footerHTML();
    S.posts = myPosts.items;
  }
  /* ------------------------------------------------------- yönetim */
  async function renderAdminView() {
    const st = await api('/api/stats');
    const all = await api('/api/posts?limit=40&sort=new');
    const flagged = all.items.filter(p => p.status === 'solved');
    view.innerHTML = '' +
      '<div class="crumbs"><a href="#/">Pano</a> › Yönetim (demo)</div>' +
      '<div class="panel-grid">' +
        '<div class="metric"><b>' + st.today + '</b><small>bugün eklenen ilan</small></div>' +
        '<div class="metric"><b>' + compact(st.activeListings) + '</b><small>aktif ilan</small></div>' +
        '<div class="metric"><b>' + compact(st.published) + '</b><small>toplam paylaşım</small></div>' +
        '<div class="metric"><b>' + st.companies + '</b><small>kayıtlı taşımacı</small></div>' +
        '<div class="metric"><b>' + (sseClientsCount()) + '</b><small>canlı bağlantı (bu sekme)</small></div>' +
      '</div>' +
      '<div class="layout" style="margin-top:18px">' +
        '<div class="card card-pad">' +
          '<div class="card-title"><span><span class="dot"></span> Son ilanlar</span>' +
            '<button class="btn btn-sm btn-light" data-act="gen">Örnek ilan üret</button></div>' +
          '<table class="table"><thead><tr><th>Kategori</th><th>Güzergâh</th><th>Firma</th><th>Zaman</th><th>Durum</th><th></th></tr></thead><tbody>' +
            all.items.map(p => '<tr>' +
              '<td>' + catTag(p.category) + '</td>' +
              '<td>' + esc(p.from || '—') + ' → ' + esc(p.to || '—') + (p.route ? '<br><small>' + p.route.km + ' km</small>' : '') + '</td>' +
              '<td>' + esc(p.company.name) + '</td>' +
              '<td>' + esc(ago(p.createdAt)) + '</td>' +
              '<td>' + (p.status === 'solved' ? '<span class="status-solved">tamamlandı</span>' : 'aktif') + '</td>' +
              '<td><a class="btn btn-sm btn-light" href="#/ilan/' + esc(p.id) + '">aç</a></td></tr>').join('') +
          '</tbody></table>' +
        '</div>' +
        '<aside class="rail">' +
          '<div class="card card-pad"><div class="card-title"><span><span class="dot"></span> Kategori dağılımı</span></div>' +
            st.categories.map(c => '<div class="kv"><span>' + esc(c.label) + '</span><b>' + c.count + '</b></div>').join('') + '</div>' +
          '<div class="card card-pad"><div class="card-title"><span><span class="dot"></span> Demo araçları</span></div>' +
            '<button class="btn btn-sm btn-light" style="width:100%;margin-bottom:8px" data-act="gen">Rastgele ilan üret</button>' +
            '<button class="btn btn-sm btn-danger" style="width:100%" data-act="reset">Veriyi sıfırla</button>' +
            '<p style="font-size:12px;color:var(--muted);margin-top:10px">Sunucu her 45 saniyede bir kurgusal ilan üretir ve SSE ile panoya düşer.</p></div>' +
          (flagged.length ? '<div class="card card-pad"><div class="card-title"><span><span class="dot"></span> Tamamlananlar</span></div>' +
            flagged.map(p => '<div class="alarm-row"><div><b>' + esc(p.from || p.company.name) + '</b><small>' + esc(p.text.slice(0, 60)) + '…</small></div>' +
            '<a class="btn btn-sm btn-light" href="#/ilan/' + esc(p.id) + '">aç</a></div>').join('') + '</div>' : '') +
        '</aside>' +
      '</div>' + footerHTML();
}
  function sseClientsCount() { return es && es.readyState === 1 ? 1 : 0; }

  /* ---------------------------------------------------- firma sayfası */
  async function renderCompanyView(id) {
    let r;
    try { r = await api('/api/company/' + id); } catch (e) { view.innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; return; }
    const c = r.company;
    view.innerHTML = '' +
      '<div class="crumbs"><a href="#/">Pano</a> › ' + esc(c.name) + '</div>' +
      '<div class="card card-pad" style="margin-bottom:16px">' +
        '<div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">' +
          '<span class="avatar" style="width:56px;height:56px;font-size:18px">' + esc(c.initials) + '</span>' +
          '<div style="flex:1;min-width:220px"><h2>' + esc(c.name) + '</h2>' +
            '<div style="color:var(--muted);font-size:13px;margin-top:2px">' + esc(c.city) + ' · ' + esc(c.since) + 'den beri üye</div>' +
            '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">' + badgeFor(c) + '</div></div>' +
          '<div style="text-align:right"><b style="font-size:22px">' + (c.rating ? c.rating.toFixed(1) : '—') + '</b>' +
            '<div style="font-size:12px;color:var(--muted)">★ puan · ' + c.jobs + ' iş</div></div>' +
        '</div>' +
        (c.about ? '<p style="color:var(--muted);margin:12px 0 0">' + esc(c.about) + '</p>' : '') +
      '</div>' +
      '<div class="card card-pad"><div class="card-title"><span><span class="dot"></span> İlanları (' + r.posts.length + ')</span></div>' +
      '<div class="feed">' + (r.posts.length ? r.posts.map(p => postCard(p)).join('') : '<div class="empty">Aktif ilan yok.</div>') + '</div></div>' + footerHTML();
    S.posts = r.posts;
  }

  /* -------------------------------------------------- hesaplayıcı */
  /* -------------------------------------------------------- canlı akış */
  let es = null;
  function connectSSE() {
    if (typeof EventSource === 'undefined') return;
    es = new EventSource('/api/stream');
    es.addEventListener('hello', () => setLive(true));
    es.addEventListener('post', e => {
      setLive(true);
      let p; try { p = JSON.parse(e.data); } catch (_) { return; }
      handleIncoming(p);
    });
    es.addEventListener('alarm', e => {
      let d; try { d = JSON.parse(e.data); } catch (_) { return; }
      if (d.deviceId !== S.deviceId) return;
      toast('Rota alarmı çaldı', (d.post.from || '') + (d.post.to ? ' → ' + d.post.to : '') + ' · ' + d.post.company.name, 'ok');
      notifySound();
      if (location.hash.startsWith('#/ilan/')) return;
      handleIncoming(d.post);
    });
    es.addEventListener('message', e => {
      let d; try { d = JSON.parse(e.data); } catch (_) { return; }
      if (!d.message.fromViewer && location.hash === '#/ilan/' + d.postId) {
        const chat = $('#chat');
        if (chat) { chat.insertAdjacentHTML('beforeend', '<div class="bubble">' + esc(d.message.text) + '<small>az önce</small></div>'); chat.scrollTop = chat.scrollHeight; }
      } else if (!d.message.fromViewer) {
        toast('Yeni mesaj', d.message.text.slice(0, 70), 'ok');
      }
    });
    es.addEventListener('post:deleted', e => {
      let d; try { d = JSON.parse(e.data); } catch (_) { return; }
      S.posts = S.posts.filter(x => x.id !== d.id);
      refreshFeedItems();
    });
    es.onerror = () => setLive(false);
  }
  function setLive(on) {
    const el = $('#liveDot');
    if (!el) return;
    el.classList.toggle('off', !on);
    el.innerHTML = '<i></i>' + (on ? 'Canlı' : 'Bağlantı yok');
  }
  function notifySound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 720; o.type = 'sine';
      g.gain.setValueAtTime(.08, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .35);
      o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + .35);
    } catch (e) { /* ses yoksa sorun değil */ }
  }
  function handleIncoming(p) {
    if (S.posts.some(x => x.id === p.id)) return;
    S.liveCount += 1;
    const wrap = $('#liveNew');
    if (wrap && location.hash !== '#/ilan/' + p.id) {
      wrap.innerHTML = '<button class="newpill" data-act="pull">▲ ' + S.liveCount + ' yeni ilan — göster</button>';
    }
    // Sayaçları tazele
    const t = $('#todayCount'); if (t) t.textContent = Number(t.textContent) + 1;
  }

  /* ------------------------------------------------------- eylemler */
  document.addEventListener('click', async e => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const act = t.dataset.act;
    const id = t.dataset.id;

    if (act === 'close') return closeModal();
    if (act === 'cat') {
      S.cat = t.dataset.cat; S.page = 1;
      $$('#catTabs .tab').forEach(b => b.classList.toggle('active', b.dataset.cat === S.cat));
      loadPosts(true);
    }
    if (act === 'city') {
      S.city = t.dataset.city;
      renderFeedView();
    }
    if (act === 'route') { S.from = t.dataset.from; S.to = t.dataset.to; renderFeedView(); }
    if (act === 'clear-route') { S.from = ''; S.to = ''; S.routeMeta = null; renderFeedView(); }
    if (act === 'more') { S.page += 1; loadPosts(false); }
    if (act === 'pull') { S.liveCount = 0; loadPosts(true); }
    if (act === 'open-composer') {
      if (location.hash !== '#/' && location.hash !== '') { location.hash = '#/'; await new Promise(r => setTimeout(r, 60)); }
      const c = $('#composer');
      if (c) { c.classList.remove('collapsed'); localStorage.setItem('yp.composer', '1'); c.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }
    if (act === 'toggle-composer') {
      const c = $('#composer');
      c.classList.toggle('collapsed');
      localStorage.setItem('yp.composer', c.classList.contains('collapsed') ? '0' : '1');
    }
    if (act === 'publish') return publish();
    if (act === 'save') return toggleSave(id);
    if (act === 'reveal') return reveal(id, t);
    if (act === 'msg') { closeModal(); openPost(id); setTimeout(() => { const m = $('#msgText'); if (m) m.focus(); }, 220); }
    if (act === 'send') {
      const ta = $('#msgText');
      const text = ta.value.trim();
      if (text.length < 2) return toast('Mesaj çok kısa', 'En az 2 karakter yazın.', 'warn');
      ta.value = '';
      const r = await api('/api/message', { postId: id, text });
      if (r.error) return toast('Gönderilemedi', r.error, 'err');
      const chat = $('#chat');
      chat.insertAdjacentHTML('beforeend', '<div class="bubble me">' + esc(text) + '<small>az önce</small></div>');
      chat.scrollTop = chat.scrollHeight;
    }
    if (act === 'report') {
      const reason = prompt('Şikâyet nedeni (örn. geçersiz ilan, sahte numara):');
      if (!reason) return;
      const r = await api('/api/post/report', { id, reason });
      toast('Şikâyet alındı', r.error || 'Ekip inceleyecek. Teşekkürler.', r.error ? 'err' : 'ok');
    }
    if (act === 'refresh') {
      const post = S.posts.find(p => p.id === id);
      const r = await api('/api/post/refresh', { id, token: post ? post.token : undefined });
      if (r.error) return toast('Öne alınamadı', r.error, 'warn');
      toast('İlan öne alındı', '1 saat boyunca akışın üstünde kalır.', 'ok');
      closeModal(); loadPosts(true);
    }
    if (act === 'solve') {
      const post = S.posts.find(p => p.id === id);
      const r = await api('/api/post/update', { id, token: post ? post.token : undefined, status: 'solved' });
      if (r.error) return toast('Güncellenemedi', r.error, 'err');
      toast('İş tamamlandı olarak işaretlendi', '', 'ok');
      closeModal(); loadPosts(true);
    }
    if (act === 'del') {
      if (!confirm('İlanı silmek istiyor musunuz?')) return;
      const post = S.posts.find(p => p.id === id);
      const r = await api('/api/post/delete', { id, token: post ? post.token : undefined });
      if (r.error) return toast('Silinemedi', r.error, 'err');
      toast('İlan silindi', '', 'ok');
      closeModal(); location.hash = '#/'; loadPosts(true);
    }
    if (act === 'add-alarm') {
      const from = titleCaseCity(($('#alarmFrom') || {}).value || '');
      const to = titleCaseCity(($('#alarmTo') || {}).value || '');
      const r = await api('/api/alarm', { from, to, cat: S.cat === 'all' ? null : S.cat });
      if (r.error) return toast('Alarm kurulamadı', r.error, 'warn');
      S.data.viewer.alarms = r.alarms;
      toast(r.on ? 'Rota alarmı kuruldu' : 'Alarm kaldırıldı', r.on ? 'Yeni ilan düşünce bildireceğiz.' : '', 'ok');
      const list = $('#alarmList'); if (list) list.innerHTML = alarmListHTML();
    }
    if (act === 'del-alarm') {
      const [from, to, cat] = t.dataset.key.split('|');
      const r = await api('/api/alarm', { from, to, cat });
      if (r.alarms) { S.data.viewer.alarms = r.alarms; const list = $('#alarmList'); if (list) list.innerHTML = alarmListHTML(); }
    }
    if (act === 'calc') return runCalc();
    if (act === 'calc-to-post') {
      localStorage.setItem('yp.composer', '1');
      location.hash = '#/';
      setTimeout(() => {
        const c = $('#composer'); if (c) c.classList.remove('collapsed');
        const f = $('#cFrom'), tt = $('#cTo');
        if (f) f.value = calcState.from; if (tt) tt.value = calcState.to;
        const ta = $('#cText');
        if (ta) { ta.value = calcState.from + "'dan " + calcState.to + "'ya " + calcState.preset + ' ev eşyası taşınacak. Yaklaşık ' + calcState.m3 + ' m³ hacim, ' + calcState.floor + '. kat.'; ta.dispatchEvent(new Event('input')); }
        c && c.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
    }
    if (act === 'copy-est') {
      const el = $('#calcOut .estimate');
      const txt = el ? el.innerText : '';
      navigator.clipboard?.writeText(txt).then(() => toast('Kopyalandı', 'Fiyat tahmini panoda.', 'ok'));
    }
    if (act === 'gen') {
      const r = await api('/api/demo/gen', {});
      if (r.error) return toast('Üretilemedi', r.error, 'err');
      toast('Örnek ilan üretildi', (r.post.from || '') + (r.post.to ? ' → ' + r.post.to : '') + ' · ' + r.post.company.name, 'ok');
    }
    if (act === 'reset') {
      if (!confirm('Tüm demo verisi sıfırlansın mı?')) return;
      await api('/api/reset', {});
      toast('Veri sıfırlandı', 'Sayfa yenileniyor…', 'ok');
      setTimeout(() => location.reload(), 700);
    }
  });

  /* ------------------------------------------------------- yönlendirici */
  async function route() {
    const h = location.hash || '#/';
    $$('.topnav a, .mobilenav a').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === h || (h === '#/' && a.dataset.nav === 'feed'));
    });
    closeModal();
    window.scrollTo({ top: 0 });
    if (h.startsWith('#/ilan/')) { renderFeedViewIfNeeded(); openPost(h.slice(7)); return; }
    if (h.startsWith('#/firma/')) return renderCompanyView(h.slice(8));
    if (h === '#/hesapla') return renderCalcView();
    if (h === '#/kayitli') return renderSavedView();
    if (h === '#/pano') return renderPanelView();
    if (h === '#/yonetim') return renderAdminView();
    return renderFeedView();
  }
  function renderFeedViewIfNeeded() {
    if (!view.innerHTML.includes('id="feed"')) renderFeedView();
  }

  async function refreshViewer() {
    const v = await api('/api/viewer');
    S.data.viewer = v;
    $('#savedCount').textContent = v.saved.length;
  }

  /* ----------------------------------------------------------- açılış */
  async function boot() {
    try {
      S.data = await api('/api/bootstrap');
    } catch (e) {
      view.innerHTML = '<div class="empty card"><b>Sunucuya ulaşılamadı.</b><p>' + esc(e.message) + '</p></div>';
      return;
    }
    S.data.categories.forEach(c => CATS[c.id] = c);
    $('#savedCount').textContent = S.data.viewer.saved.length;

    $('#globalSearch').addEventListener('input', onSearch);
    $('#topPostBtn').addEventListener('click', () => {
      if (location.hash !== '#/' && location.hash !== '') location.hash = '#/';
      setTimeout(() => { const c = $('#composer'); if (c) { c.classList.remove('collapsed'); c.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, 80);
    });
    $('#mobilePost').addEventListener('click', () => {
      if (location.hash !== '#/' && location.hash !== '') location.hash = '#/';
      setTimeout(() => { const c = $('#composer'); if (c) { c.classList.remove('collapsed'); c.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, 80);
    });
    $('#fab').addEventListener('click', () => $('#mobilePost').click());

    // Delegasyon: sıralama seçici
    document.addEventListener('change', e => {
      if (e.target.id === 'sortSel') { S.sort = e.target.value; loadPosts(true); }
    });

    window.addEventListener('hashchange', route);
    connectSSE();
    await route();
  }

  boot();
})();

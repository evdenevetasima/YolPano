# Yolpano — Nakliyecilerin Güzergâh Panosu

Nakliyecilerin **boş araç**, iş sahiplerinin **yük/iş** ilanı paylaştığı; parça eşya,
asansör, depolama ve ekip ilanlarını tek akışta buluşturan canlı bir pano.
Bir seri ilan defterinin mantığından ilhamla, **tamamen özgün tasarım, veri modeli ve
özellik setiyle** sıfırdan yazıldı. Bağımlılık gerektirmez: sunucu Node'un kendi
`http` modülüyla, arayüz saf JS + SSE ile çalışır.

## Çalıştırma

```bash
npm start            # http://localhost:3000  (PORT=... ile değiştirilebilir)
```

İlk açılışta `data/db.json`, `data/seed.json` içindeki kurgusal firmalar ve
ilanlardan otomatik üretilir. Sunucu her 45 saniyede bir kurgusal ilan üretip
SSE ile tüm açık sekmelere düşürür (`YOLPANO_QUIET=1` ile kapatılır).

## Testler

```bash
npm test             # API: 77 uçtan uca doğrulama (kota, sahiplik, SSE, güvenlik…)
npm run test:ui      # Arayüz: gerçek Chromium ile 43 adım (ilk kurulumda
                     # `npx playwright install chromium` gerekebilir)
```

## Özellikler

### Orijinal mantık (yeniden yorumlanmış)
- **Canlı ilan akışı** — boş araç / yük-iş / asansör / depolama / parça eşya / ekip.
- **Kategori sekmeleri, il ızgarası (81 il), metin arama** (vurgulu sonuçlar).
- **Tamamen ücretsiz:** hiçbir özellik için ödeme yok; numara gösterme, ilan, öne alma
  ve rota alarmlarının tümü sınırsız.
- **Mesajlaşma** — ilan bazlı konu dizisi, canlı (SSE) iletilen yanıtlar.
- **Üyelik kademeleri** — ücretsiz; yalnızca rozet ve akış önceliği farkı yaratır.
- **İlan sahibi araçları** — düzenle, "işi tamamlandı" işaretle, sil, **öne al**.

### Yolpano'ya özel ek özellikler
- **Güzergâh filtresi + rota eşleştirme:** çıkış→varış yazınca hem filtreler hem
  kart üzerinde km/saat hesabı (81 ilin koordinatıyla haversine + karayolu katsayısı).
- **Rota alarmı:** "Gaziantep→İstanbul boş araç düşünce haber ver" — eşleşen yeni
  ilan SSE + sesli uyarı ile anlık bildirilir (kademeye göre alarm limiti).
- **Fiyat tahmini aracı:** mesafe + hacim (hazır presetler) + kat/asansör + ek
  hizmetler → kalem kalem kırılım ve gerçekçi fiyat aralığı; tek tıkla ilana dönüşür.
- **Akıllı akış kuralları:** en yeni üstte; ücretli "öne al" hakkı kullanılan ilan
  1 saat boyunca akışın tepesinde (boost rozetiyle).
- **Hesap sayfası:** firma kartı, kota çubukları, ilanlarım, alarm yönetimi.
- **Yönetim paneli (demo):** istatistikler, kategori dağılımı, son ilanlar,
  örnek üretim ve veri sıfırlama (`#/yonetim`).
- **PWA bildirimi** (manifest + tema rengi), mobil alt menü, klavye kısayolu `/` arama.

## Güvenlik / sağlamlık
- İlan metninden HTML temizlenir, telefon numarası yazımı reddedilir (iletişim
  butonları üzerinden kurulur), Türkçe büyük/küçük harf duyarlı doğrulama.
- Sahiplik token'la: başkasının ilanı düzenlenemez/silinemez/öne alınamaz.
- Path traversal ve dizin dışı erişim engelli; gövde boyutu sınırlı.
- Veri `data/db.json`'a debounce'lu yazılır; `POST /api/reset` ile sıfırlanır.

## Yapı

```
server.js            HTTP + JSON API + SSE + kurgusal ilan üretici
data/taxonomy.js     kategoriler, kademeler, fiyat modeli
data/seed.json       kurgusal firma/ilan tohumu (tümü örnek veridir)
public/              arayüz (index.html, css/app.css, js/app.js, js/provinces.js)
test/api.test.js     API uçtan uca testleri (bağımlılıksız)
test/ui.test.js      Chromium UI testleri (playwright-core)
```

> Not: Tüm firmalar, kişiler, telefonlar ve ilanlar kurgusaldır; fiyat tahmini
> bilgilendirme amaçlıdır, teklif değildir.

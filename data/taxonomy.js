/* Yolpano — kategori, üyelik kademeleri ve ücret modeli parametreleri */

// Kategoriler: defter akışındaki paylaşım tipleri
const CATEGORIES = [
  {
    id: 'bos_arac', label: 'Boş Araç', short: 'Boş', icon: 'truck',
    desc: 'Aracın boş, yük/iş arıyorsun. Güzergâh belirt.',
    needsRoute: true, color: 'teal'
  },
  {
    id: 'yuk_is', label: 'Yük / İş', short: 'Yük', icon: 'box',
    desc: 'Taşınacak işin var, araç arıyorsun.',
    needsRoute: true, color: 'amber'
  },
  {
    id: 'asansor', label: 'Asansör', short: 'Asansör', icon: 'crane',
    desc: 'Modüler asansör kiralama / operatörlü asansör ilanı.',
    needsRoute: false, color: 'sky'
  },
  {
    id: 'depo', label: 'Depolama', short: 'Depo', icon: 'warehouse',
    desc: 'Eşya depolama alanı, m² ve süre bilgisiyle.',
    needsRoute: false, color: 'violet'
  },
  {
    id: 'parca', label: 'Parça Eşya', short: 'Parça', icon: 'package',
    desc: 'Az parça / koli taşımacılığı, aynı güzergâhta birleştirme.',
    needsRoute: true, color: 'rose'
  },
  {
    id: 'ekip', label: 'Ekip / Usta', short: 'Ekip', icon: 'users',
    desc: 'Yükleme-boşaltma ekibi, montaj ustası, hamal desteği.',
    needsRoute: false, color: 'slate'
  }
];

// Üyelik kademeleri: günlük limit, yenileme hakkı ve arama sıralaması ağırlığı
const TIERS = {
  standart: {
    id: 'standart', label: 'Standart', badge: null, color: 'slate',
    dailyPostLimit: 9999, dailyRefresh: 9999, dailyReveal: 9999, rank: 0,
    perks: ['Sınırsız ilan paylaşımı', 'Sınırsız numara açma', 'Sınırsız öne alma', '20 rota alarmı']
  },
  gumus: {
    id: 'gumus', label: 'Gümüş', badge: 'Gümüş Üye', color: 'sky',
    dailyPostLimit: 9999, dailyRefresh: 9999, dailyReveal: 9999, rank: 2,
    perks: ['Ücretsiz üyenin tümü', 'Gümüş rozeti', 'Aramada üstte çıkma', '20 rota alarmı']
  },
  altin: {
    id: 'altin', label: 'Altın Pro', badge: 'Altın Pro Üye', color: 'amber',
    dailyPostLimit: 9999, dailyRefresh: 9999, dailyReveal: 9999, rank: 4,
    perks: ['Ücretsiz üyenin tümü', 'Altın rozeti', 'Aramada en üstte', '20 rota alarmı']
  }
};

// Fiyat tahmin modeli (bilgilendirme amaçlı, bağlayıcı değildir)
const PRICING = {
  base: 3200,          // sabit yükleme/organizasyon payı (₺)
  perKm: 26,           // km başına ₺
  perM3: 950,          // m³ başına ek ₺
  perFloorNoElevator: 450, // asansörsüz her kat için ₺
  longHaulDiscount: 0.82,  // 400 km üzeri km birim fiyatına indirim
  longHaulKm: 400,
  insurance: 0.02,     // sigorta payı (toplamın %)
  vat: 0.20,           // KDV
  volumePresets: {
    '1+1': 22, '2+1': 32, '3+1': 45, '4+1': 58, 'Ofis': 50, 'Parça': 8
  }
};

// Nakliye fiyatını etkileyen hizmet seçenekleri
const SERVICE_OPTIONS = [
  { id: 'paketleme', label: 'Paketleme / ambalaj dahil', mult: 1.12 },
  { id: 'sigorta', label: 'Genişletilmiş sigorta', mult: 1.06 },
  { id: 'montaj', label: 'Mobilya sökme-takma', mult: 1.08 },
  { id: 'gece', label: 'Gece / hafta sonu taşıma', mult: 1.10 },
  { id: 'asansor', label: 'Dış cephe asansörü', mult: 1.05 }
];

// Rota uyarısı (alarm) için hazır güzergâh önerileri
const HOT_ROUTES = [
  ['İstanbul', 'Ankara'], ['İstanbul', 'İzmir'], ['Ankara', 'Antalya'],
  ['İzmir', 'Gaziantep'], ['Bursa', 'Diyarbakır'], ['İstanbul', 'Trabzon']
];

module.exports = { CATEGORIES, TIERS, PRICING, SERVICE_OPTIONS, HOT_ROUTES };

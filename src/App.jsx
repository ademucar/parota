import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import {
  Home, CreditCard, PieChart, Zap, Settings, Plus, AlertTriangle,
  Mail, Lock, LogOut, Loader2, Check, Trash2, X, CheckCircle, Wallet,
  ChevronLeft, ChevronRight, RotateCcw, Filter, Menu, Pencil, Star, StickyNote,
  Calendar as CalendarIcon, FileDown, TrendingUp, PiggyBank, Target, ArrowDownLeft, ArrowUpRight, Sparkles,
  Eye, EyeOff, ShieldCheck, BarChart3, ChevronDown, Landmark, User
} from 'lucide-react';

import { supabase } from './lib/supabase';

/* Grafik (recharts) ağır; ayrı parçada tembel yüklenir. */
const CategoryPie = lazy(() => import('./Chart'));


/* Kayıt sırasında Supabase (e-posta doğrulaması kapalıysa) anında oturum açar.
   Bu bayrak açıkken oturum değişimini yok sayıyoruz ki dashboard bir an bile görünmesin. */
let kayitSurecinde = false;
/* E-posta doğrulama linkinden gelindiğinde Supabase kendiliğinden oturum açıyor.
   Kullanıcıyı doğrudan içeri almak yerine onay ekranı gösterip girişe yolluyoruz. */
let dogrulamaSurecinde = false;
/* Supabase istemcisi adresteki token'ı işleyip hash'i temizlediği için
   ilk adresi modül yüklenirken saklıyoruz. */
const ILK_URL = typeof window !== 'undefined' ? window.location.href : '';
const adresTipi = () => {
  try {
    const u = new URL(ILK_URL);
    const h = new URLSearchParams(u.hash.replace(/^#/, ''));
    return h.get('type') || u.searchParams.get('type') || '';
  } catch { return ''; }
};

/* ============================ YARDIMCILAR ============================ */
const TR = 'tr-TR';
const money = (n) => `₺${Number(n || 0).toLocaleString(TR, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (d) => new Date(d).toLocaleDateString(TR, { day: 'numeric', month: 'long', year: 'numeric' });
const startOfToday = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
const dayDiff = (dateString) => {
  const d = new Date(dateString); d.setHours(0, 0, 0, 0);
  const diff = Math.round((d - startOfToday()) / 86400000);
  return { days: Math.abs(diff), isOverdue: diff < 0, raw: diff };
};
const iso = (d) => {
  const t = new Date(d);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};
const addMonths = (date, n) => { const d = new Date(date); d.setMonth(d.getMonth() + n); return d; };
const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d; };

/* Kategori renkleri — markanın gece haritası paletiyle uyumlu,
   birbirinden ayırt edilebilir ama hiçbiri neon değil. */
const HEX_COLORS = {
  'bg-blue-500': '#4e8b92', 'bg-green-500': '#5f9179', 'bg-purple-500': '#8b7bb0',
  'bg-orange-500': '#cc7a45', 'bg-red-500': '#c96a52', 'bg-indigo-500': '#c06b3d',
  'bg-yellow-500': '#c9a227', 'bg-pink-500': '#b8768f', 'bg-teal-500': '#4a9b96'
};
const TYPE_LABEL = { tek_seferlik: 'Tek Sefer', taksitli: 'Taksitli', abonelik: 'Abonelik', kredi_karti: 'Ekstre' };
const PERIODS = [
  { id: 'haftalik', label: 'Haftalık', days: 7 },
  { id: 'aylik', label: 'Aylık', months: 1 },
  { id: 'uc_aylik', label: '3 Aylık', months: 3 },
  { id: 'alti_aylik', label: '6 Aylık', months: 6 },
  { id: 'yillik', label: 'Yıllık', months: 12 }
];
const nextDate = (from, periodId) => {
  const p = PERIODS.find(x => x.id === periodId) || PERIODS[1];
  return p.days ? addDays(from, p.days) : addMonths(from, p.months);
};

const FILTER_LABEL = { hepsi: 'Tüm kayıtlar', bekliyor: 'Bekleyenler', geciken: 'Gecikenler', odendi: 'Ödenenler', onemli: 'Önemli işaretliler' };

/* Parota işareti — pusula iğnesi. Hazır ikon setinden değil, markaya ait. */
const ParotaMark = ({ size = 24, className = "" }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.1" opacity=".38" />
    <path d="M12 2.6 15.3 12H8.7Z" fill="currentColor" />
    <path d="M12 21.4 8.7 12h6.6Z" fill="currentColor" opacity=".38" />
    <circle cx="12" cy="12" r="1.35" fill="currentColor" />
  </svg>
);

/* Avatar için baş harfler. Türkçe büyütme kuralı (i → İ) için locale veriyoruz. */
const basHarfler = (ad = '') => ad.trim().split(/[\s._-]+/).filter(Boolean).slice(0, 2)
  .map(p => p[0]).join('').toLocaleUpperCase(TR) || '?';

/* Supabase hataları İngilizce gelir; kullanıcıya Türkçe göstermek için çeviriyoruz.
   Eşleşme bulunmazsa genel bir mesaj veririz, teknik metni konsola bırakırız. */
const hataMesaji = (err) => {
  if (!err) return '';
  const ham = (err.message || String(err));
  const m = ham.toLowerCase();
  const kod = err.code || '';
  console.error('[Supabase]', ham);

  const eslesmeler = [
    ['invalid login credentials', 'E-posta veya şifre hatalı.'],
    ['email not confirmed', 'E-posta adresin henüz doğrulanmamış. Gelen kutunu kontrol et.'],
    ['user already registered', 'Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene.'],
    ['already been registered', 'Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene.'],
    ['password should be at least', 'Şifre en az 6 karakter olmalı.'],
    ['unable to validate email', 'Geçerli bir e-posta adresi gir.'],
    ['invalid email', 'Geçerli bir e-posta adresi gir.'],
    ['email rate limit', 'E-posta gönderim sınırına takıldın. Bir süre bekleyip tekrar dene.'],
    ['over_request_rate_limit', 'Çok fazla istek gönderildi. Biraz bekleyip tekrar dene.'],
    ['for security purposes', 'Çok sık denedin. Birkaç saniye bekleyip tekrar dene.'],
    ['user not found', 'Böyle bir kullanıcı bulunamadı.'],
    ['session', 'Oturumun sona ermiş. Lütfen tekrar giriş yap.'],
    ['jwt', 'Oturumun sona ermiş. Lütfen tekrar giriş yap.'],
    ['duplicate key', 'Bu kayıt zaten var.'],
    ['violates foreign key', 'Bu kayıt başka bir kayda bağlı, önce onu düzenlemelisin.'],
    ['violates check constraint', 'Girilen değer geçerli değil.'],
    ['violates not-null', 'Zorunlu bir alan boş bırakılmış.'],
    ['row-level security', 'Bu işlem için yetkin yok. (Veritabanı güvenlik kuralı engelledi.)'],
    ['permission denied', 'Bu işlem için yetkin yok.'],
    ['could not find', 'Veritabanı yapısı güncel değil. Eksik tablo veya sütun var.'],
    ['column', 'Veritabanı yapısı güncel değil. Eksik sütun var.'],
    ['failed to fetch', 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.'],
    ['networkerror', 'Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.'],
    ['invalid path', 'Supabase adresi hatalı. .env dosyasındaki VITE_SUPABASE_URL değerini kontrol et.'],
    ['invalid api key', 'Supabase anahtarı hatalı. .env dosyasını kontrol et.']
  ];

  for (const [ara, cevap] of eslesmeler) if (m.includes(ara)) return cevap;
  if (kod === '23505') return 'Bu kayıt zaten var.';
  if (kod === '42501') return 'Bu işlem için yetkin yok.';
  return 'Bir şeyler ters gitti. Lütfen tekrar dene.';
};

/* ============================ ŞİFRE KURALLARI ============================
   Sadece kayıt ve şifre yenilemede uygulanır; girişte uygulanmaz ki
   eski (kısa) şifreye sahip mevcut kullanıcılar kilitlenmesin. */
const SIFRE_KURALLARI = [
  { id: 'uzunluk', etiket: 'En az 8 karakter', test: (s) => s.length >= 8 },
  { id: 'buyuk', etiket: 'Bir büyük harf', test: (s) => /[A-ZÇĞİÖŞÜ]/.test(s) },
  { id: 'kucuk', etiket: 'Bir küçük harf', test: (s) => /[a-zçğıöşü]/.test(s) },
  { id: 'rakam', etiket: 'Bir rakam', test: (s) => /[0-9]/.test(s) }
];

const sifreDurumu = (s = '') => {
  const kurallar = SIFRE_KURALLARI.map(k => ({ ...k, tamam: k.test(s) }));
  const gecen = kurallar.filter(k => k.tamam).length;
  // Özel karakter ve ekstra uzunluk zorunlu değil ama gücü artırır
  const bonus = (/[^A-Za-z0-9ÇĞİÖŞÜçğıöşü]/.test(s) ? 1 : 0) + (s.length >= 12 ? 1 : 0);
  return { kurallar, gecerli: gecen === SIFRE_KURALLARI.length, puan: gecen === 4 ? 4 + bonus : gecen };
};

const SifreGucu = ({ sifre }) => {
  const { kurallar, puan } = sifreDurumu(sifre);
  if (!sifre) return null;
  const seviye = puan >= 6 ? 3 : puan >= 5 ? 2 : puan >= 4 ? 1 : 0;
  const renk = ['bg-red-500', 'bg-yellow-500', 'bg-emerald-500', 'bg-emerald-400'][seviye];
  const yazi = ['Zayıf', 'İyi', 'Güçlü', 'Çok güçlü'][seviye];
  const yaziRenk = ['text-red-400', 'text-yellow-400', 'text-emerald-400', 'text-emerald-300'][seviye];
  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full ${renk} transition-all duration-300`} style={{ width: `${Math.min(100, (puan / 6) * 100)}%` }} />
        </div>
        <span className={`text-[11px] font-medium ${yaziRenk}`}>{yazi}</span>
      </div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
        {kurallar.map(k => (
          <li key={k.id} className={`text-[11px] flex items-center gap-1.5 ${k.tamam ? 'text-emerald-400' : 'text-slate-500'}`}>
            {k.tamam ? <Check size={11} className="shrink-0" /> : <X size={11} className="shrink-0 opacity-50" />}
            {k.etiket}
          </li>
        ))}
      </ul>
    </div>
  );
};

const INPUT = "w-full bg-[#091316] border border-slate-700 text-white rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none";
const CARD = "bg-[#10222A] border border-slate-800/80 rounded-2xl";

/* ============================ KÜÇÜK BİLEŞENLER ============================ */
const SidebarItem = ({ icon: Icon, label, isActive, onClick, badge }) => (
  <button onClick={onClick}
    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${isActive ? 'bg-indigo-600/20 text-indigo-400 font-medium' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}>
    <Icon size={20} className={isActive ? 'text-indigo-500' : ''} />
    <span className="flex-1 text-left">{label}</span>
    {badge > 0 && <span className="text-[10px] bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-bold">{badge}</span>}
  </button>
);

/* Küçük trend grafiği (harici kütüphane yok, saf SVG). type: 'area' | 'bar' */
const Sparkline = ({ data = [], color = '#818cf8', type = 'area', height = 38 }) => {
  const n = data.length;
  if (!n) return null;
  const w = 120, h = height, pad = 3;
  const max = Math.max(1, ...data);
  const gid = `sg-${color.replace('#', '')}-${type}`;
  if (type === 'bar') {
    const gap = (w - pad * 2) / n;
    const bw = gap * 0.58;
    return (
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
        {data.map((v, i) => {
          const bh = Math.max(2, (v / max) * (h - 4));
          return <rect key={i} x={pad + i * gap + (gap - bw) / 2} y={h - bh} width={bw} height={bh} rx={1.5} fill={color} opacity={0.85} />;
        })}
      </svg>
    );
  }
  const pts = data.map((v, i) => [pad + (i * (w - pad * 2)) / Math.max(1, n - 1), h - pad - (v / max) * (h - pad * 2)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${pts[n - 1][0].toFixed(1)} ${h} L${pts[0][0].toFixed(1)} ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const SummaryCard = ({ title, amount, subtitle, badgeText, badgeType, icon: Icon, type, onClick, spark }) => {
  const styles = { primary: 'bg-blue-500/20 text-blue-400', success: 'bg-emerald-500/20 text-emerald-400', danger: 'bg-red-500/20 text-red-400', purple: 'bg-purple-500/20 text-purple-400' };
  const badges = { positive: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20', warning: 'bg-red-500/10 text-red-400 border border-red-500/20', neutral: 'bg-slate-800 text-slate-300 border border-slate-700' };
  return (
    <button type="button" onClick={onClick}
      className="text-left bg-[#10222A] border border-slate-800/80 rounded-2xl p-4 sm:p-6 flex flex-col justify-between hover:border-indigo-500/60 transition-colors group relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 opacity-[0.055] pointer-events-none"
        style={{ backgroundImage: "linear-gradient(#c7dade 1px, transparent 1px), linear-gradient(90deg, #c7dade 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
      <div aria-hidden className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-indigo-500/60 via-indigo-500/10 to-transparent" />
      <div className="flex justify-between items-start mb-4 relative z-10"><div className={`p-3 rounded-2xl ${styles[type]}`}><Icon size={24} /></div></div>
      <div className="space-y-1 relative z-10">
        <h3 className="text-slate-400 text-sm font-medium">{title}</h3>
        <p className="text-lg sm:text-2xl font-bold text-white tracking-tight break-all">{typeof amount === 'number' ? money(amount) : amount}</p>
      </div>
      <div className="flex items-center justify-between mt-4 relative z-10">
        <span className="text-slate-400 text-xs">{subtitle}</span>
        {badgeText && <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badges[badgeType]}`}>{badgeText}</span>}
      </div>
      {spark && <div className="mt-3 -mb-1 -mx-1 relative z-0 opacity-90">{spark}</div>}
    </button>
  );
};

const EmptyState = ({ icon: Icon, title, desc, action }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-16 h-16 bg-[#091316] border border-slate-800 rounded-full flex items-center justify-center mb-4"><Icon size={26} className="text-slate-600" /></div>
    <h4 className="text-slate-300 font-medium">{title}</h4>
    <p className="text-slate-500 text-sm mt-1 max-w-sm">{desc}</p>
    {action}
  </div>
);

const Toast = ({ toast }) => {
  if (!toast) return null;
  const ok = toast.type !== 'error';
  return (
    <div className={`fixed z-[70] left-4 right-4 bottom-4 text-center sm:left-auto sm:right-6 sm:bottom-6 sm:text-left px-5 py-3.5 rounded-xl border shadow-2xl text-sm font-medium ${ok ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300' : 'bg-red-500/10 border-red-500/40 text-red-300'}`}>
      {toast.msg}
    </div>
  );
};

const Modal = ({ title, icon: Icon, onClose, children }) => (
  <div className="fixed inset-0 bg-[#091316]/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-[60] sm:p-4"
    onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="bg-[#10222A] border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full max-w-lg p-5 sm:p-6 relative shadow-2xl max-h-[92vh] overflow-y-auto pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 p-1.5 rounded-lg"><X size={20} /></button>
      <div className="flex items-center gap-3 mb-6"><div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg"><Icon size={24} /></div><h2 className="text-xl font-bold text-white">{title}</h2></div>
      {children}
    </div>
  </div>
);

/* ============================ TAKSİT SATIRI ============================ */
const PaymentRow = ({ item, onToggle, onDelete, onEdit, adet = 0, acik, onAcKapa }) => {
  const paid = item.status === 'odendi';
  // Vadesi sonraki aylara ait olanlar ödendi işaretlenemez
  const bugun = startOfToday();
  const kilitli = !paid && new Date(item.due_date) > new Date(bugun.getFullYear(), bugun.getMonth() + 1, 0);
  const { days, isOverdue } = dayDiff(item.due_date);
  const color = item.payments?.categories?.color || 'bg-slate-500';
  const total = item.payments?.total_installments;
  return (
    <div className="p-3 sm:p-4 rounded-xl hover:bg-slate-800/50 transition-colors group">
      {/* Mobilde iki satır, sm ve üstünde tek satır */}
      <div className="flex items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
          <div className={`w-10 h-10 sm:w-12 sm:h-12 shrink-0 rounded-2xl flex items-center justify-center ${color} bg-opacity-20`}>
            <Wallet className="text-slate-200" size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className={`font-medium text-sm sm:text-base truncate flex items-center gap-2 ${paid ? 'text-slate-500 line-through' : 'text-white'}`}>
              {item.payments?.is_pinned && <Star size={13} className="text-yellow-500 fill-yellow-500 shrink-0" />}
              <span className="truncate">{item.payments?.title}</span>
              {adet > 1 && (
                <button type="button" onClick={(e) => { e.stopPropagation(); onAcKapa?.(); }}
                  className="shrink-0 text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                  {adet} taksit <ChevronRight size={11} className={`transition-transform ${acik ? 'rotate-90' : ''}`} />
                </button>
              )}
            </h4>
            <p className="text-slate-400 text-[11px] sm:text-xs mt-0.5 truncate">
              {item.payments?.categories?.name || 'Kategorisiz'}
              {item.installment_number && total ? ` · ${item.installment_number}/${total}. taksit` : ''}
              {item.payments?.is_auto_pay ? ' · Otomatik' : ''}
            </p>
            {/* Tarih mobilde buraya iner */}
            <p className="text-slate-500 text-[11px] mt-0.5 sm:hidden">{formatDate(item.due_date)}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 lg:gap-6 shrink-0">
          <span className="text-slate-400 text-sm hidden lg:block w-32">{formatDate(item.due_date)}</span>
          <div className="text-right flex flex-col items-end sm:w-28">
            <span className="text-white font-bold text-sm sm:text-base whitespace-nowrap">{money(item.amount)}</span>
            {paid
              ? <span className="text-emerald-400 text-[10px] sm:text-[11px] font-medium mt-1 bg-emerald-500/10 px-2 py-0.5 rounded-md whitespace-nowrap">Ödendi</span>
              : isOverdue
                ? <span className="text-red-400 text-[10px] sm:text-[11px] font-medium mt-1 bg-red-500/10 px-2 py-0.5 rounded-md border border-red-500/20 whitespace-nowrap">{days} gün gecikti</span>
                : <span className="text-yellow-500 text-[10px] sm:text-[11px] font-medium mt-1 bg-yellow-500/10 px-2 py-0.5 rounded-md whitespace-nowrap">{days === 0 ? 'Bugün' : `${days} gün kaldı`}</span>}
          </div>
          {/* Butonlar sm ve üstünde satır içinde */}
          <div className="hidden sm:flex items-center gap-1.5">
            <button onClick={() => onToggle(item)} disabled={kilitli}
              title={kilitli ? 'Vadesi gelmedi' : paid ? 'Geri al' : 'Ödendi işaretle'}
              className={`p-2 rounded-lg border border-slate-700 transition-all ${kilitli ? 'bg-slate-900 text-slate-700 cursor-not-allowed' : paid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400 hover:bg-emerald-500/20 hover:text-emerald-400'}`}>
              {paid ? <RotateCcw size={18} /> : <CheckCircle size={20} />}
            </button>
            <button onClick={() => onEdit(item)} title="Düzenle"
              className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-indigo-400 border border-slate-700"><Pencil size={16} /></button>
            <button onClick={() => onDelete(item)} title="Sil"
              className="p-2 rounded-lg bg-slate-800 text-slate-500 hover:bg-red-500/20 hover:text-red-400 border border-slate-700"><Trash2 size={16} /></button>
          </div>
        </div>
      </div>

      {/* Mobilde butonlar alt satırda, geniş dokunma alanıyla */}
      <div className="flex sm:hidden items-center gap-2 mt-3">
        <button onClick={() => onToggle(item)} disabled={kilitli}
          className={`flex-1 py-2.5 rounded-lg border border-slate-700 flex items-center justify-center gap-2 text-xs font-medium active:scale-95 transition-transform ${kilitli ? 'bg-slate-900 text-slate-700' : paid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-300'}`}>
          {kilitli ? <>Vadesi gelmedi</> : paid ? <><RotateCcw size={15} /> Geri al</> : <><CheckCircle size={15} /> Ödendi</>}
        </button>
        <button onClick={() => onEdit(item)} aria-label="Düzenle"
          className="w-11 h-10 rounded-lg bg-slate-800 text-slate-400 border border-slate-700 flex items-center justify-center active:scale-95 transition-transform"><Pencil size={16} /></button>
        <button onClick={() => onDelete(item)} aria-label="Sil"
          className="w-11 h-10 rounded-lg bg-slate-800 text-slate-500 border border-slate-700 flex items-center justify-center active:scale-95 transition-transform"><Trash2 size={16} /></button>
      </div>

      {total > 1 && item.installment_number && (
        <div className="mt-3 sm:ml-16 mr-2">
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(item.installment_number / total) * 100}%` }} />
          </div>
        </div>
      )}

      {item.payments?.notes && (
        <p className="mt-2 sm:ml-16 text-xs text-slate-500 flex items-start gap-1.5">
          <StickyNote size={12} className="mt-0.5 shrink-0" />{item.payments.notes}
        </p>
      )}
    </div>
  );
};

/* ============================ GİRİŞ: ROTA HARİTASI ============================
   Parota = para + rota. Hazır "fintech kartı" görseli yerine markaya ait bir
   motif: eş yükselti eğrileri üzerinde işaretlenmiş bir güzergâh. Her durak
   bir ödeme, varış noktası hedefin. */
const AuthIllustration = () => (
  <svg viewBox="0 0 340 260" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-xs">
    <defs>
      <linearGradient id="rota" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#8a422a" /><stop offset="0.55" stopColor="#c06b3d" /><stop offset="1" stopColor="#d9b467" />
      </linearGradient>
      <radialGradient id="isik" cx="0.78" cy="0.22" r="0.6">
        <stop offset="0" stopColor="#d9b467" stopOpacity="0.16" /><stop offset="1" stopColor="#d9b467" stopOpacity="0" />
      </radialGradient>
    </defs>

    <rect width="340" height="260" fill="url(#isik)" />

    {/* Eş yükselti eğrileri — harita dokusu */}
    <g stroke="#2d454f" fill="none" strokeLinecap="round">
      <path d="M-10 196C46 178 74 208 118 190S196 140 250 152s76-6 110-26" strokeWidth="1" opacity=".85" />
      <path d="M-10 172C44 152 78 184 124 164S200 112 252 124s78-8 108-30" strokeWidth="1" opacity=".6" />
      <path d="M-10 220C50 204 72 232 120 216S200 168 254 180s72-4 106-22" strokeWidth="1" opacity=".6" />
      <path d="M-10 148C42 126 82 160 130 138S204 84 254 96s76-10 106-32" strokeWidth="1" opacity=".35" />
      <path d="M-10 244C54 230 70 254 122 240S204 196 256 208s70-2 104-18" strokeWidth="1" opacity=".3" />
    </g>

    {/* Güzergâh */}
    <path d="M40 214C78 214 84 168 116 158s52 18 82-2 44-62 78-74"
      stroke="url(#rota)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 9" opacity=".95" />

    {/* Duraklar */}
    {[[116, 158], [198, 156], [232, 128]].map(([x, y], i) => (
      <g key={i}>
        <circle cx={x} cy={y} r="8" fill="#091316" />
        <circle cx={x} cy={y} r="4.5" fill="none" stroke="#c06b3d" strokeWidth="1.6" />
      </g>
    ))}

    {/* Başlangıç */}
    <circle cx="40" cy="214" r="9" fill="#091316" />
    <circle cx="40" cy="214" r="4" fill="#7f9ba4" />

    {/* Varış — hedef bayrağı */}
    <g transform="translate(276 84)">
      <circle r="15" fill="#d9b467" opacity=".12" />
      <circle r="15" fill="none" stroke="#d9b467" strokeWidth="1" opacity=".55" />
      <path d="M-1 8V-9" stroke="#e7cd94" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M-1-9l11 3.6-11 3.6z" fill="#d9b467" />
    </g>

    {/* Pusula gülü */}
    <g transform="translate(60 66)" opacity=".9">
      <circle r="21" fill="none" stroke="#2d454f" strokeWidth="1" />
      <circle r="14" fill="none" stroke="#2d454f" strokeWidth="1" opacity=".6" />
      <path d="M0-21L4.5-4 0 0-4.5-4z" fill="#c06b3d" />
      <path d="M0 21L-4.5 4 0 0 4.5 4z" fill="#41565e" />
      <path d="M21 0L4 4.5 0 0 4-4.5z" fill="#2d454f" opacity=".8" />
      <path d="M-21 0L-4-4.5 0 0-4 4.5z" fill="#2d454f" opacity=".8" />
      <text x="0" y="-26" textAnchor="middle" fill="#7f9ba4" fontSize="8" fontFamily="Manrope, sans-serif" letterSpacing=".14em">K</text>
    </g>
  </svg>
);

/* ============================ GİRİŞ ============================ */
const Login = () => {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [basarili, setBasarili] = useState('');
  const [loading, setLoading] = useState(false);
  const [mod, setMod] = useState('giris');      // giris | kayit | sifre
  const [sifreGoster, setSifreGoster] = useState(false);
  const [remember, setRemember] = useState(true);
  const [google, setGoogle] = useState(false);
  const [dogrulamaBekliyor, setDogrulamaBekliyor] = useState(''); // kayıt sonrası: onay bekleyen e-posta
  const [tekrarGonderildi, setTekrarGonderildi] = useState(false);

  const isRegister = mod === 'kayit';
  const isReset = mod === 'sifre';

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setBasarili('');
    const temiz = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(temiz)) return setError('Geçerli bir e-posta adresi gir.');

    // Şifre sıfırlama: sadece e-posta ister
    if (isReset) {
      setLoading(true);
      const { error } = await supabase.auth.resetPasswordForEmail(temiz, { redirectTo: window.location.origin });
      setLoading(false);
      if (error) return setError(hataMesaji(error));
      return setBasarili('Şifre sıfırlama bağlantısı e-postana gönderildi. Gelen kutunu kontrol et.');
    }

    // Kurallar yalnızca yeni şifre belirlerken; girişte eski şifreler kabul edilmeli
    if (isRegister) {
      const d = sifreDurumu(password);
      if (!d.gecerli) return setError('Şifren kurallara uymuyor: ' + d.kurallar.filter(k => !k.tamam).map(k => k.etiket.toLowerCase()).join(', ') + '.');
    } else if (!password) return setError('Şifreni gir.');
    // Beni hatırla tercihi: işaretsizse tarayıcı kapanınca oturum düşer (App boot'ta uygulanır)
    try { localStorage.setItem('beniHatirla', remember ? '1' : '0'); } catch { /* gizli mod */ }
    setLoading(true);

    if (isRegister) {
      kayitSurecinde = true;
      const { data, error } = await supabase.auth.signUp({
        email: temiz, password, options: { emailRedirectTo: window.location.origin }
      });
      if (error) { kayitSurecinde = false; setError(hataMesaji(error)); setLoading(false); return; }
      // Doğrulama açıkken Supabase oturum döndürmez. Kapalıysa döner; onu sessizce kapatıyoruz.
      const dogrulamaGerekli = !data.session;
      if (data.session) await supabase.auth.signOut();
      kayitSurecinde = false;
      setPassword(''); setLoading(false);
      if (dogrulamaGerekli) return setDogrulamaBekliyor(temiz);
      setMod('giris');
      setBasarili('Kayıt başarılı! Şimdi e-posta ve şifrenle giriş yapabilirsin.');
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email: temiz, password });
    if (error) setError(hataMesaji(error));
    setLoading(false);
  };

  const googleGiris = async () => {
    setError(''); setGoogle(true);
    try { localStorage.setItem('beniHatirla', remember ? '1' : '0'); } catch { /* gizli mod */ }
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) { setError(hataMesaji(error)); setGoogle(false); }
  };

  const modDegis = (m) => { setMod(m); setError(''); setBasarili(''); };

  const tekrarGonder = async () => {
    setError(''); setLoading(true);
    const { error } = await supabase.auth.resend({
      type: 'signup', email: dogrulamaBekliyor, options: { emailRedirectTo: window.location.origin }
    });
    setLoading(false);
    if (error) return setError(hataMesaji(error));
    setTekrarGonderildi(true);
  };

  /* Kayıt sonrası: e-posta doğrulaması bekleniyor */
  if (dogrulamaBekliyor) {
    return (
      <div className="min-h-[100dvh] bg-[#091316] text-slate-200 font-sans flex flex-col justify-center px-5 py-12">
        <div className="w-full max-w-sm mx-auto text-center">
          <div className="flex justify-center mb-5">
            <div className="p-4 bg-emerald-500/15 text-emerald-400 rounded-2xl shadow-lg shadow-emerald-500/10"><Mail size={40} /></div>
          </div>
          <h2 className="text-2xl font-bold text-white">E-postanı Doğrula</h2>
          <p className="mt-3 text-sm text-slate-400 leading-relaxed">
            <span className="text-slate-200 font-medium break-all">{dogrulamaBekliyor}</span> adresine bir doğrulama bağlantısı gönderdik.
            Hesabını kullanabilmek için önce o bağlantıya tıkla.
          </p>
          <div className="mt-6 bg-[#10222A] border border-slate-800 rounded-xl p-4 text-left space-y-2">
            <p className="text-xs text-slate-400 flex gap-2"><span className="text-indigo-400 font-bold">1.</span> Gelen kutunu aç</p>
            <p className="text-xs text-slate-400 flex gap-2"><span className="text-indigo-400 font-bold">2.</span> Mail yoksa <span className="text-slate-300">spam / gereksiz</span> klasörüne bak</p>
            <p className="text-xs text-slate-400 flex gap-2"><span className="text-indigo-400 font-bold">3.</span> Bağlantıya tıkla, sonra buradan giriş yap</p>
          </div>

          {error && <div className="mt-4 text-sm p-3 rounded-xl border bg-red-500/10 border-red-500/50 text-red-400">{error}</div>}
          {tekrarGonderildi && <div className="mt-4 text-sm p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/50 text-emerald-400">Doğrulama bağlantısı yeniden gönderildi.</div>}

          <button type="button" onClick={tekrarGonder} disabled={loading || tekrarGonderildi}
            className="mt-5 w-full py-3 rounded-xl text-sm font-medium text-slate-200 bg-[#10222A] border border-slate-700 hover:border-slate-600 disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="animate-spin" size={18} /> : <RotateCcw size={16} />} Bağlantıyı tekrar gönder
          </button>
          <button type="button" onClick={() => { setDogrulamaBekliyor(''); setTekrarGonderildi(false); setMod('giris'); setError(''); }}
            className="mt-3 w-full py-3 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700">
            Girişe Dön
          </button>
        </div>
      </div>
    );
  }

  const baslik = isReset ? 'Şifreni Sıfırla' : isRegister ? 'Yeni Hesap Oluştur' : 'Hesabınıza Giriş Yapın';

  return (
    <div className="min-h-[100dvh] bg-[#091316] text-slate-200 font-sans lg:grid lg:grid-cols-2">
      {/* SOL: Marka paneli (yalnız geniş ekran) */}
      <div className="hidden lg:flex flex-col justify-between p-10 relative overflow-hidden border-r border-slate-800/60">
        <div aria-hidden className="absolute inset-0 opacity-[0.5] pointer-events-none"
          style={{ backgroundImage: "radial-gradient(circle at 78% 18%, rgba(217,180,103,.10), transparent 55%)" }} />
        <div aria-hidden className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{ backgroundImage: "repeating-linear-gradient(115deg, #c7dade 0 1px, transparent 1px 46px)" }} />
        <div className="relative z-10">
          <div className="flex items-center gap-2.5 mb-12">
            <span className="text-indigo-400"><ParotaMark size={26} /></span>
            <span className="text-base font-bold text-white tracking-tight">Parota</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white leading-tight">Finansını Planla,<br /><span className="text-indigo-400">Rahatla.</span></h1>
          <p className="mt-3 text-sm text-slate-400 max-w-xs leading-relaxed">Gelir ve giderlerini takip et, geleceğini güvenle yönet.</p>
          <div className="mt-8 flex justify-center"><AuthIllustration /></div>
        </div>
        <div className="relative z-10 grid grid-cols-3 gap-3 mt-8">
          {[[ShieldCheck, 'Güvenli', 'Verileriniz güvende'], [BarChart3, 'Kolay Takip', 'Tüm finansın tek yerde'], [Zap, 'Hızlı & Pratik', 'Zaman kazandırır']].map(([Ikon, b, alt]) => (
            <div key={b} className="bg-[#10222A]/70 border border-slate-800 rounded-xl p-3.5">
              <Ikon size={18} className="text-indigo-400 mb-2" />
              <p className="text-white text-sm font-semibold">{b}</p>
              <p className="text-slate-500 text-[11px] mt-0.5 leading-snug">{alt}</p>
            </div>
          ))}
        </div>
      </div>

      {/* SAĞ: Form paneli */}
      <div className="flex flex-col justify-center px-5 py-12 sm:px-10 relative">
        <div className="w-full max-w-sm mx-auto">
          <div className="flex justify-center mb-4"><span className="text-indigo-400"><ParotaMark size={44} /></span></div>
          <h2 className="text-center text-xl sm:text-2xl font-bold text-white">{baslik}</h2>
          <p className="mt-2 text-center text-sm text-slate-400">
            {isReset ? 'E-posta adresini gir, sıfırlama bağlantısı gönderelim.' : 'Finansını Planla, Rahatla.'}
          </p>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            {basarili && <div className="text-sm p-3 rounded-xl border bg-emerald-500/10 border-emerald-500/50 text-emerald-400">{basarili}</div>}
            {error && <div className="text-sm p-3 rounded-xl border bg-red-500/10 border-red-500/50 text-red-400">{error}</div>}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">E-posta adresi</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className={`${INPUT} pl-10`} placeholder="ornek@mail.com" />
              </div>
            </div>

            {!isReset && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Şifre</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                  <input type={sifreGoster ? 'text' : 'password'} required minLength={isRegister ? 8 : undefined}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                    value={password} onChange={e => setPassword(e.target.value)} className={`${INPUT} pl-10 pr-10`} placeholder="••••••••" />
                  <button type="button" onClick={() => setSifreGoster(v => !v)} aria-label={sifreGoster ? 'Şifreyi gizle' : 'Şifreyi göster'}
                    className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 text-slate-500 hover:text-slate-300">
                    {sifreGoster ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {isRegister && <SifreGucu sifre={password} />}
              </div>
            )}

            {!isReset && !isRegister && (
              <div className="flex items-center justify-between text-sm -my-1">
                <label className="flex items-center gap-2 py-2 pr-2 text-slate-400 cursor-pointer select-none">
                  <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} className="accent-indigo-600 w-4 h-4 rounded" />
                  Beni hatırla
                </label>
                <button type="button" onClick={() => modDegis('sifre')} className="py-2 pl-2 font-medium text-indigo-400 hover:text-indigo-300">Şifremi Unuttum?</button>
              </div>
            )}

            <button type="submit" disabled={loading} className="w-full flex justify-center items-center py-3 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 shadow-lg shadow-indigo-500/20 transition-colors">
              {loading ? <Loader2 className="animate-spin" size={20} /> : (isReset ? 'Sıfırlama Bağlantısı Gönder' : isRegister ? 'Kayıt Ol' : 'Giriş Yap')}
            </button>
          </form>

          {!isReset && (
            <>
              <div className="flex items-center gap-4 my-6">
                <div className="flex-1 h-px bg-slate-800" /><span className="text-xs text-slate-500">veya</span><div className="flex-1 h-px bg-slate-800" />
              </div>
              <button type="button" onClick={googleGiris} disabled={google}
                className="w-full flex items-center justify-center gap-3 py-3 rounded-xl text-sm font-medium text-slate-200 bg-[#10222A] border border-slate-700 hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50 transition-colors">
                {google ? <Loader2 className="animate-spin" size={18} /> : (
                  <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C39.9 36.9 44 31 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>
                )}
                Google ile {isRegister ? 'Kayıt Ol' : 'Giriş Yap'}
              </button>
            </>
          )}

          <p className="mt-6 text-center text-sm text-slate-400">
            {isReset ? (
              <button type="button" onClick={() => modDegis('giris')} className="font-medium text-indigo-400 hover:text-indigo-300">← Girişe dön</button>
            ) : (<>
              {isRegister ? 'Zaten hesabınız var mı?' : 'Hesabınız yok mu?'}
              <button type="button" onClick={() => modDegis(isRegister ? 'giris' : 'kayit')}
                className="ml-1 px-1.5 py-2 font-semibold text-indigo-400 hover:text-indigo-300">{isRegister ? 'Giriş Yap' : 'Kayıt Ol'}</button>
            </>)}
          </p>

          <p className="mt-10 text-center text-xs text-slate-600">
            Developed by <a href="https://ademucar.com.tr/" target="_blank" rel="noopener noreferrer" className="text-slate-400 font-medium hover:text-white transition-colors">Adem Uçar</a>
          </p>
        </div>
      </div>
    </div>
  );
};

/* ============================ ŞİFRE YENİLE (e-posta linkinden gelince) ============================ */
const SifreYenile = ({ onDone, showToast }) => {
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [goster, setGoster] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const kaydet = async (e) => {
    e.preventDefault(); setError('');
    const d = sifreDurumu(password);
    if (!d.gecerli) return setError('Şifren kurallara uymuyor: ' + d.kurallar.filter(k => !k.tamam).map(k => k.etiket.toLowerCase()).join(', ') + '.');
    if (password !== password2) return setError('Şifreler eşleşmiyor.');
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return setError(hataMesaji(error));
    showToast('Şifren güncellendi. Artık yeni şifrenle girebilirsin.');
    onDone();
  };

  return (
    <div className="min-h-[100dvh] bg-[#091316] text-slate-200 font-sans flex flex-col justify-center px-5 py-12">
      <div className="w-full max-w-sm mx-auto">
        <div className="flex justify-center mb-4"><div className="p-3 bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 rounded-xl"><Lock size={28} /></div></div>
        <h2 className="text-center text-xl sm:text-2xl font-bold text-white">Yeni Şifreni Belirle</h2>
        <p className="mt-2 text-center text-sm text-slate-400">Hesabın için yeni bir şifre gir.</p>
        <form className="mt-8 space-y-5" onSubmit={kaydet}>
          {error && <div className="text-sm p-3 rounded-xl border bg-red-500/10 border-red-500/50 text-red-400">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Yeni şifre</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
              <input type={goster ? 'text' : 'password'} required minLength={8} autoComplete="new-password"
                value={password} onChange={e => setPassword(e.target.value)} className={`${INPUT} pl-10 pr-10`} placeholder="••••••••" />
              <button type="button" onClick={() => setGoster(v => !v)} aria-label={goster ? 'Şifreyi gizle' : 'Şifreyi göster'}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-2.5 text-slate-500 hover:text-slate-300">
                {goster ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <SifreGucu sifre={password} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Yeni şifre (tekrar)</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
              <input type={goster ? 'text' : 'password'} required minLength={8} autoComplete="new-password"
                value={password2} onChange={e => setPassword2(e.target.value)} className={`${INPUT} pl-10`} placeholder="••••••••" />
            </div>
            {password2 && password !== password2 && <p className="text-[11px] text-red-400 mt-1.5">Şifreler eşleşmiyor.</p>}
          </div>
          <button type="submit" disabled={loading} className="w-full flex justify-center items-center py-3 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 shadow-lg shadow-indigo-500/20">
            {loading ? <Loader2 className="animate-spin" size={20} /> : <><Check size={18} className="mr-2" /> Şifreyi Güncelle</>}
          </button>
        </form>
      </div>
    </div>
  );
};

/* ============================ ÖDEME EKLE / DÜZENLE ============================ */
const PaymentModal = ({ onClose, user, categories, onSuccess, editing, occurrences = [] }) => {
  const isEdit = !!editing;
  /* Düzenleme modunda bu ödemenin taksitleri tek tek değiştirilebilir. */
  const [taksitler, setTaksitler] = useState(() => !isEdit ? [] :
    occurrences.filter(o => o.payment_id === editing.id)
      .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
      .map(o => ({ id: o.id, due_date: o.due_date, amount: String(o.amount), status: o.status, no: o.installment_number })));
  const ilkTaksitler = useRef(taksitler.map(t => ({ ...t })));
  const [taksitAcik, setTaksitAcik] = useState(false);
  const setTaksit = (id, alan, deger) => setTaksitler(prev => prev.map(t => t.id === id ? { ...t, [alan]: deger } : t));
  const [f, setF] = useState(() => isEdit ? {
    title: editing.title, amount: String(editing.amount), categoryId: editing.category_id || '',
    type: editing.type, installments: editing.total_installments || 2,
    period: editing.repeat_period || 'aylik',
    startDate: editing.start_date, isAutoPay: !!editing.is_auto_pay, isPinned: !!editing.is_pinned,
    notes: editing.notes || '', applyToFuture: true
  } : {
    title: '', amount: '', categoryId: '', type: 'tek_seferlik', installments: 2,
    period: 'aylik', startDate: iso(new Date()),
    isAutoPay: false, isPinned: false, notes: ''
  });
  const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));

  /* Formda seçilen ayarlarla son taksitin ne zaman düşeceğini önceden göster. */
  const sonTaksit = (() => {
    if (!f.startDate) return null;
    if (f.type === 'taksitli') {
      const n = parseInt(f.installments) || 0;
      return n > 1 ? { tarih: addMonths(f.startDate, n - 1), adet: n } : null;
    }
    return null;
  })();

  const buildOccurrences = (paymentId) => {
    const base = parseFloat(f.amount); const out = [];
    if (f.type === 'taksitli') {
      const n = parseInt(f.installments);
      const each = Math.round((base / n) * 100) / 100;
      for (let i = 0; i < n; i++) out.push({
        payment_id: paymentId, user_id: user.id, due_date: iso(addMonths(f.startDate, i)),
        amount: i === n - 1 ? Math.round((base - each * (n - 1)) * 100) / 100 : each,
        installment_number: i + 1, status: 'bekliyor'
      });
    } else if (f.type === 'abonelik' || f.type === 'kredi_karti') {
      // Süresiz: kullanıcıya sayı sorulmaz, 12 dönem açılır; bittikçe otomatik uzar.
      const n = 12;
      let d = new Date(f.startDate);
      for (let i = 0; i < n; i++) {
        out.push({ payment_id: paymentId, user_id: user.id, due_date: iso(d), amount: base, installment_number: i + 1, status: 'bekliyor' });
        d = nextDate(d, f.period);
      }
    } else {
      out.push({ payment_id: paymentId, user_id: user.id, due_date: f.startDate, amount: base, installment_number: 1, status: 'bekliyor' });
    }
    return out;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!f.categoryId) return setError('Lütfen bir kategori seçin.');
    if (!(parseFloat(f.amount) > 0)) return setError('Tutar sıfırdan büyük olmalı.');
    setLoading(true); setError('');
    try {
      const payload = {
        title: f.title.trim(), amount: parseFloat(f.amount), category_id: f.categoryId,
        is_auto_pay: f.isAutoPay, is_pinned: f.isPinned, notes: f.notes.trim() || null,
        repeat_period: (f.type === 'abonelik' || f.type === 'kredi_karti') ? f.period : null
      };

      if (isEdit) {
        const { error } = await supabase.from('payments').update(payload).eq('id', editing.id);
        if (error) throw error;
        if (f.applyToFuture && editing.type !== 'taksitli') {
          await supabase.from('payment_occurrences')
            .update({ amount: parseFloat(f.amount) })
            .eq('payment_id', editing.id).eq('status', 'bekliyor').gte('due_date', iso(new Date()));
        }
        // Tek tek değiştirilen taksitleri yaz (toplu güncellemeden sonra, onu ezer)
        for (const t of taksitler) {
          const ilk = ilkTaksitler.current.find(x => x.id === t.id);
          if (!ilk) continue;
          const tutarDegisti = parseFloat(t.amount) !== parseFloat(ilk.amount);
          const tarihDegisti = t.due_date !== ilk.due_date;
          if (!tutarDegisti && !tarihDegisti) continue;
          if (!(parseFloat(t.amount) >= 0)) throw new Error('Taksit tutarı geçersiz.');
          const { error: tErr } = await supabase.from('payment_occurrences')
            .update({ amount: parseFloat(t.amount), due_date: t.due_date }).eq('id', t.id);
          if (tErr) throw tErr;
        }
      } else {
        const { data: payment, error: pErr } = await supabase.from('payments').insert([{
          ...payload, user_id: user.id, type: f.type, start_date: f.startDate,
          total_installments: f.type === 'taksitli' ? parseInt(f.installments) : null
        }]).select().single();
        if (pErr) throw pErr;
        const { error: oErr } = await supabase.from('payment_occurrences').insert(buildOccurrences(payment.id));
        if (oErr) throw oErr;
      }
      onSuccess();
    } catch (err) { setError(hataMesaji(err)); }
    finally { setLoading(false); }
  };

  return (
    <Modal title={isEdit ? 'Ödemeyi Düzenle' : 'Yeni Ödeme Ekle'} icon={isEdit ? Pencil : Plus} onClose={onClose}>
      {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm p-3 rounded-xl mb-6">{error}</div>}
      {categories.length === 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/40 text-yellow-300 text-sm p-3 rounded-xl mb-6">
          Ödeme ekleyebilmek için önce Kategoriler sekmesinden bir kategori oluştur.
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-2 gap-5">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-300 mb-1.5">İşlem Adı</label>
            <input type="text" required value={f.title} onChange={e => set('title', e.target.value)} className={INPUT} placeholder="Örn: Kira" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Tutar (₺)</label>
            <input type="number" step="0.01" min="0" required value={f.amount} onChange={e => set('amount', e.target.value)} className={INPUT} placeholder="0.00" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Kategori</label>
            <select required value={f.categoryId} onChange={e => set('categoryId', e.target.value)} className={INPUT}>
              <option value="" disabled>Seçiniz...</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {!isEdit && (
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-2">Ödeme Türü</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {Object.entries(TYPE_LABEL).map(([id, label]) => (
                  <button type="button" key={id} onClick={() => set('type', id)}
                    className={`py-2 text-sm rounded-xl border font-medium transition-all ${f.type === id ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400' : 'bg-[#091316] border-slate-700 text-slate-400 hover:border-slate-600'}`}>{label}</button>
                ))}
              </div>
            </div>
          )}

          {!isEdit && f.type === 'taksitli' && (
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Toplam Taksit</label>
              <input type="number" min="2" max="36" required value={f.installments} onChange={e => set('installments', e.target.value)} className={INPUT} />
              {sonTaksit && (
                <p className="text-xs text-slate-500 mt-2">
                  {sonTaksit.adet} taksit · aylık {money(parseFloat(f.amount || 0) / sonTaksit.adet)} · son taksit <span className="text-slate-300">{formatDate(sonTaksit.tarih)}</span>
                </p>
              )}
            </div>
          )}

          {(f.type === 'abonelik' || f.type === 'kredi_karti') && (
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Tekrar Aralığı</label>
              <select value={f.period} onChange={e => set('period', e.target.value)} className={INPUT}>
                {PERIODS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              <p className="text-xs text-slate-500 mt-2">Süresiz devam eder — ödedikçe sonraki dönem kendiliğinden oluşur.</p>
            </div>
          )}

          {!isEdit && (
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1.5">İlk Ödeme Tarihi</label>
              <input type="date" required value={f.startDate} onChange={e => set('startDate', e.target.value)} className={`${INPUT} [color-scheme:dark]`} />
              {(f.type === 'abonelik' || f.type === 'kredi_karti') && (
                <p className="text-xs mt-2 text-slate-500">İlk ödeme bu tarihte, sonrakiler seçtiğin aralıkta tekrarlar.</p>
              )}
            </div>
          )}

          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Not (opsiyonel)</label>
            <textarea rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} className={INPUT} placeholder="Kısa bir not..." />
          </div>

          <div className="col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[['isAutoPay', 'Otomatik ödeme talimatı var'], ['isPinned', 'Önemli olarak işaretle']].map(([key, label]) => (
              <button type="button" key={key} onClick={() => set(key, !f[key])}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all ${f[key] ? 'bg-indigo-600/10 border-indigo-500 text-indigo-300' : 'bg-[#091316] border-slate-700 text-slate-400'}`}>
                <span className="text-sm font-medium">{label}</span>
                <span className={`w-10 h-6 rounded-full flex items-center px-1 transition-colors ${f[key] ? 'bg-indigo-600 justify-end' : 'bg-slate-700 justify-start'}`}>
                  <span className="w-4 h-4 bg-white rounded-full block" />
                </span>
              </button>
            ))}
          </div>

          {isEdit && editing.type !== 'taksitli' && (
            <label className="col-span-2 flex items-center gap-3 text-sm text-slate-300 bg-[#091316] border border-slate-800 rounded-xl p-3">
              <input type="checkbox" checked={!!f.applyToFuture} onChange={e => set('applyToFuture', e.target.checked)} className="accent-indigo-600 w-4 h-4" />
              Yeni tutar, ödenmemiş taksitlere de işlensin
            </label>
          )}

          {/* Düzenlemede: ödemenin künyesi + taksitlerin tek tek düzenlenmesi */}
          {isEdit && (
            <div className="col-span-2 space-y-3">
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="px-2.5 py-1 rounded-lg bg-[#091316] border border-slate-800 text-slate-400">Tür: <span className="text-slate-200">{TYPE_LABEL[editing.type]}</span></span>
                {editing.start_date && <span className="px-2.5 py-1 rounded-lg bg-[#091316] border border-slate-800 text-slate-400">Başlangıç: <span className="text-slate-200">{formatDate(editing.start_date)}</span></span>}
                {editing.total_installments && <span className="px-2.5 py-1 rounded-lg bg-[#091316] border border-slate-800 text-slate-400">Taksit: <span className="text-slate-200">{editing.total_installments}</span></span>}
                <span className="px-2.5 py-1 rounded-lg bg-[#091316] border border-slate-800 text-slate-400">Kayıt: <span className="text-slate-200">{taksitler.length}</span></span>
              </div>

              {taksitler.length > 0 && (
                <div className="border border-slate-800 rounded-xl overflow-hidden">
                  <button type="button" onClick={() => setTaksitAcik(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-[#091316] text-sm font-medium text-slate-200">
                    <span className="flex items-center gap-2"><CalendarIcon size={15} className="text-indigo-400" /> Taksitleri düzenle</span>
                    <ChevronRight size={16} className={`text-slate-500 transition-transform ${taksitAcik ? 'rotate-90' : ''}`} />
                  </button>
                  {taksitAcik && (
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-800/70">
                      {taksitler.map((t, i) => (
                        <div key={t.id} className="flex items-center gap-2 p-2.5 bg-[#10222A]">
                          <span className={`w-7 shrink-0 text-center text-[11px] font-semibold ${t.status === 'odendi' ? 'text-emerald-400' : 'text-slate-500'}`}>{t.no || i + 1}</span>
                          <input type="date" value={t.due_date} onChange={e => setTaksit(t.id, 'due_date', e.target.value)}
                            className="flex-1 min-w-0 bg-[#091316] border border-slate-700 text-slate-200 rounded-lg px-2 py-2 text-xs [color-scheme:dark] outline-none focus:ring-1 focus:ring-indigo-500" />
                          <input type="number" step="0.01" min="0" value={t.amount} onChange={e => setTaksit(t.id, 'amount', e.target.value)}
                            className="w-24 shrink-0 bg-[#091316] border border-slate-700 text-slate-200 rounded-lg px-2 py-2 text-xs text-right outline-none focus:ring-1 focus:ring-indigo-500" />
                          {t.status === 'odendi' && <Check size={14} className="text-emerald-400 shrink-0" />}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <button type="submit" disabled={loading || categories.length === 0}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-3.5 rounded-xl flex justify-center items-center gap-2">
          {loading ? <Loader2 className="animate-spin" size={20} /> : <><Check size={18} /> {isEdit ? 'Güncelle' : 'Kaydet'}</>}
        </button>
      </form>
    </Modal>
  );
};

/* ============================ TAKSİT DÜZENLE ============================ */
const OccurrenceModal = ({ item, onClose, onSaved, showToast }) => {
  const [amount, setAmount] = useState(String(item.amount));
  const [date, setDate] = useState(item.due_date);
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    const { error } = await supabase.from('payment_occurrences')
      .update({ amount: parseFloat(amount), due_date: date }).eq('id', item.id);
    setSaving(false);
    if (error) return showToast(hataMesaji(error), 'error');
    showToast('Taksit güncellendi.'); onSaved();
  };

  return (
    <Modal title="Taksiti Düzenle" icon={CalendarIcon} onClose={onClose}>
      <p className="text-sm text-slate-400 mb-5">{item.payments?.title}</p>
      <form onSubmit={save} className="space-y-4">
        <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Tutar (₺)</label>
          <input type="number" step="0.01" min="0" required value={amount} onChange={e => setAmount(e.target.value)} className={INPUT} /></div>
        <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Ödeme Tarihi</label>
          <input type="date" required value={date} onChange={e => setDate(e.target.value)} className={`${INPUT} [color-scheme:dark]`} /></div>
        <button type="submit" disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl flex justify-center items-center gap-2">
          {saving ? <Loader2 className="animate-spin" size={18} /> : <><Check size={18} /> Kaydet</>}
        </button>
      </form>
    </Modal>
  );
};

/* ============================ KATEGORİ DÜZENLE ============================ */
const CategoryModal = ({ cat, onClose, onSaved, showToast }) => {
  const [name, setName] = useState(cat.name);
  const [color, setColor] = useState(cat.color);
  const [saving, setSaving] = useState(false);

  const save = async (e) => {
    e.preventDefault(); setSaving(true);
    const { error } = await supabase.from('categories').update({ name: name.trim(), color }).eq('id', cat.id);
    setSaving(false);
    if (error) return showToast(hataMesaji(error), 'error');
    showToast('Kategori güncellendi.'); onSaved();
  };

  return (
    <Modal title="Kategoriyi Düzenle" icon={Pencil} onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div><label className="block text-sm font-medium text-slate-300 mb-1.5">Ad</label>
          <input required value={name} onChange={e => setName(e.target.value)} className={INPUT} /></div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Renk</label>
          <div className="flex flex-wrap gap-2">
            {Object.keys(HEX_COLORS).map(c => (
              <button key={c} type="button" onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full ${c} ${color === c ? 'ring-2 ring-white scale-110' : 'opacity-50 hover:opacity-100'} transition-all`} />
            ))}
          </div>
        </div>
        <button type="submit" disabled={saving || !name.trim()} className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium py-3 rounded-xl flex justify-center items-center gap-2">
          {saving ? <Loader2 className="animate-spin" size={18} /> : <><Check size={18} /> Kaydet</>}
        </button>
      </form>
    </Modal>
  );
};

/* ============================ GELİR / PARA EKLE ============================ */
const IncomeModal = ({ onClose, user, onSaved, showToast, tekSeferlik = false }) => {
  const [title, setTitle] = useState(tekSeferlik ? '' : 'Maaş');
  const [amount, setAmount] = useState('');
  const [startDate, setStartDate] = useState(iso(new Date()));
  const [recurring, setRecurring] = useState(!tekSeferlik);
  const [saving, setSaving] = useState(false); const [err, setErr] = useState('');

  const save = async (e) => {
    e.preventDefault();
    if (!(parseFloat(amount) > 0)) return setErr('Tutar sıfırdan büyük olmalı.');
    setSaving(true); setErr('');
    const { error } = await supabase.from('incomes').insert([{
      user_id: user.id, title: title.trim(), amount: parseFloat(amount),
      start_date: startDate, is_recurring: recurring
    }]);
    setSaving(false);
    if (error) return setErr(hataMesaji(error));
    showToast(tekSeferlik ? 'Para hesabına eklendi.' : 'Gelir eklendi.'); onSaved();
  };

  return (
    <Modal title={tekSeferlik ? 'Hesaba Para Ekle' : 'Gelir Ekle'} icon={tekSeferlik ? Landmark : TrendingUp} onClose={onClose}>
      {err && <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm p-3 rounded-xl mb-5">{err}</div>}
      <form onSubmit={save} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">{tekSeferlik ? 'Nereden geldi?' : 'Gelir Adı'}</label>
          <input required value={title} onChange={e => setTitle(e.target.value)} className={INPUT} placeholder={tekSeferlik ? 'Prim, hediye, satış...' : 'Maaş, burs, ek iş...'} />
          <div className="flex flex-wrap gap-2 mt-2">
            {(tekSeferlik ? ['Prim', 'Hediye', 'Satış', 'Borç Tahsilatı', 'Diğer'] : ['Maaş', 'Burs', 'Ek İş', 'Harçlık']).map(h => (
              <button key={h} type="button" onClick={() => setTitle(h)}
                className={`text-xs px-3 py-1.5 rounded-lg border ${title === h ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-[#091316] border-slate-700 text-slate-400'}`}>{h}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Tutar (₺)</label>
          <input type="number" step="0.01" min="0" required value={amount} onChange={e => setAmount(e.target.value)} className={INPUT} placeholder="0.00" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">{tekSeferlik ? 'Tarih' : 'İlk Alındığı Tarih'}</label>
          <input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} className={`${INPUT} [color-scheme:dark]`} />
        </div>
        {!tekSeferlik && (
          <button type="button" onClick={() => setRecurring(!recurring)}
            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${recurring ? 'bg-emerald-600/10 border-emerald-500 text-emerald-300' : 'bg-[#091316] border-slate-700 text-slate-400'}`}>
            <span className="text-sm font-medium text-left">Her ay tekrar eder<br /><span className="text-[11px] opacity-70">Maaş gibi düzenli gelirlerde açık kalsın</span></span>
            <span className={`w-10 h-6 rounded-full flex items-center px-1 shrink-0 transition-colors ${recurring ? 'bg-emerald-600 justify-end' : 'bg-slate-700 justify-start'}`}>
              <span className="w-4 h-4 bg-white rounded-full block" />
            </span>
          </button>
        )}
        <button type="submit" disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl flex justify-center items-center gap-2">
          {saving ? <Loader2 className="animate-spin" size={18} /> : <><Check size={18} /> Kaydet</>}
        </button>
      </form>
    </Modal>
  );
};

/* ============================ AYLIK BÜTÇE PANELİ ============================ */
const BudgetPanel = ({ gelir, odenen, bekleyen, birikim = 0, ayAdi, onGelirEkle, onBirikimeAktar }) => {
  const toplamGider = odenen + bekleyen;
  const kalanBakiye = gelir - odenen - birikim;          // cebinde şu an ne var
  const aySonu = gelir - toplamGider - birikim; // her şey ödenip biriktirilince ne kalır
  const yuzde = gelir > 0 ? Math.min(100, (toplamGider / gelir) * 100) : 0;
  const odenenYuzde = gelir > 0 ? Math.min(100, (odenen / gelir) * 100) : 0;

  if (gelir === 0) {
    return (
      <div className={`${CARD} p-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between relative overflow-hidden`}>
        <div aria-hidden className="absolute inset-0 pointer-events-none opacity-[0.06]"
          style={{ backgroundImage: "repeating-linear-gradient(115deg, #c7dade 0 1px, transparent 1px 40px)" }} />
        <div className="flex items-center gap-4 relative z-10">
          <div className="p-3 rounded-2xl bg-emerald-500/20 text-emerald-400 shrink-0"><PiggyBank size={24} /></div>
          <div>
            <h3 className="text-white font-bold">Gelirini ekle, bütçeni gör</h3>
            <p className="text-slate-400 text-sm mt-0.5">Maaşını gir, her ödeme yaptığında kalan paran kendiliğinden düşsün.</p>
          </div>
        </div>
        <div className="flex items-center gap-4 relative z-10">
          <svg viewBox="0 0 150 90" className="hidden lg:block h-16 shrink-0" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs><linearGradient id="bnk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6366f1" /><stop offset="1" stopColor="#4c1d95" /></linearGradient></defs>
            <rect x="14" y="20" width="82" height="50" rx="9" fill="#312e81" transform="rotate(-9 55 45)" opacity="0.8" />
            <rect x="26" y="26" width="82" height="50" rx="9" fill="url(#bnk)" />
            <rect x="34" y="38" width="30" height="5" rx="2.5" fill="#c7d2fe" opacity="0.9" />
            <rect x="34" y="52" width="46" height="4" rx="2" fill="#c7d2fe" opacity="0.5" />
            {[0, 1, 2].map(i => (
              <g key={i} transform={`translate(104 ${64 - i * 9})`}>
                <ellipse cx="18" cy="8" rx="17" ry="7" fill="#fde68a" />
                <ellipse cx="18" cy="6" rx="17" ry="7" fill="#facc15" />
                <text x="18" y="10" textAnchor="middle" fill="#a16207" fontSize="8" fontWeight="700" fontFamily="sans-serif">₺</text>
              </g>
            ))}
          </svg>
          <button onClick={onGelirEkle} className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 shrink-0">
            <Plus size={16} /> Gelir Ekle
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${CARD} p-6`}>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-bold text-white flex items-center gap-2"><PiggyBank size={20} className="text-emerald-400" /> Aylık Bütçe</h3>
        <span className="text-xs text-slate-500 capitalize">{ayAdi}</span>
      </div>

      <div className="flex items-end justify-between mb-3 gap-3">
        <div className="min-w-0">
          <p className="text-slate-400 text-xs mb-1">Elinde kalan</p>
          <p className={`text-3xl font-bold tracking-tight ${kalanBakiye < 0 ? 'text-red-400' : 'text-white'}`}>{money(kalanBakiye)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-slate-400 text-xs mb-1">Gelir</p>
          <p className="text-lg font-semibold text-emerald-400">{money(gelir)}</p>
          <button onClick={onBirikimeAktar}
            className="mt-2 text-xs bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 px-3 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap">
            <PiggyBank size={13} /> Birikime aktar
          </button>
        </div>
      </div>

      {/* Çift katmanlı çubuk: koyu = ödenen, açık = henüz ödenmemiş */}
      <div className="h-3 bg-slate-800 rounded-full overflow-hidden flex mb-3">
        <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${odenenYuzde}%` }} />
        <div className="h-full bg-indigo-500/50 transition-all duration-500" style={{ width: `${Math.max(0, yuzde - odenenYuzde)}%` }} />
      </div>

      <div className="grid grid-cols-4 gap-2 text-center pt-3 border-t border-slate-800">
        <div>
          <p className="text-[11px] text-slate-500 mb-1">Ödenen</p>
          <p className="text-sm font-semibold text-emerald-400">{money(odenen)}</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-500 mb-1">Bekleyen</p>
          <p className="text-sm font-semibold text-indigo-300">{money(bekleyen)}</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-500 mb-1">Birikime</p>
          <p className="text-sm font-semibold text-purple-300">{money(birikim)}</p>
        </div>
        <div>
          <p className="text-[11px] text-slate-500 mb-1">Ay sonunda</p>
          <p className={`text-sm font-semibold ${aySonu < 0 ? 'text-red-400' : 'text-white'}`}>{money(aySonu)}</p>
        </div>
      </div>

      {aySonu < 0 && (
        <p className="mt-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Bu ayki giderlerin gelirini {money(Math.abs(aySonu))} aşıyor.
        </p>
      )}
    </div>
  );
};

/* ============================ E-POSTA DOĞRULANDI ============================ */
const EpostaDogrulandi = ({ onDevam }) => (
  <div className="min-h-[100dvh] bg-[#091316] text-slate-200 font-sans flex flex-col justify-center px-5 py-12">
    <div className="w-full max-w-sm mx-auto text-center">
      <div className="flex justify-center mb-5">
        <div className="p-4 bg-emerald-500/15 text-emerald-400 rounded-2xl shadow-lg shadow-emerald-500/10"><CheckCircle size={44} /></div>
      </div>
      <h2 className="text-2xl font-bold text-white">E-postan Doğrulandı</h2>
      <p className="mt-3 text-sm text-slate-400 leading-relaxed">
        Hesabın kullanıma hazır. Şimdi giriş yapabilirsin.
      </p>
      <button type="button" onClick={onDevam}
        className="mt-7 w-full py-3 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/20">
        Giriş Yap
      </button>
    </div>
  </div>
);

/* ============================ PROFİL: GÖRÜNEN AD ============================ */
const ProfilKarti = ({ user, onSaved, showToast }) => {
  const [ad, setAd] = useState(user.user_metadata?.ad || user.user_metadata?.full_name || '');
  const [saving, setSaving] = useState(false);
  const mevcut = user.user_metadata?.ad || user.user_metadata?.full_name || '';

  const kaydet = async (e) => {
    e.preventDefault(); setSaving(true);
    const { error } = await supabase.auth.updateUser({ data: { ad: ad.trim() } });
    setSaving(false);
    if (error) return showToast(hataMesaji(error), 'error');
    showToast('Adın güncellendi.'); onSaved();
  };

  return (
    <div className={`${CARD} p-6`}>
      <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2"><User size={18} className="text-indigo-400" /> Profil</h3>
      <p className="text-slate-500 text-xs mb-4">Uygulamada sana nasıl hitap edelim?</p>
      <form onSubmit={kaydet} className="flex flex-col sm:flex-row gap-3">
        <input value={ad} onChange={e => setAd(e.target.value)} maxLength={40} className={`${INPUT} flex-1`} placeholder="Adın (örn. Adem)" />
        <button type="submit" disabled={saving || ad.trim() === mevcut.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-5 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 shrink-0">
          {saving ? <Loader2 className="animate-spin" size={18} /> : <><Check size={16} /> Kaydet</>}
        </button>
      </form>
    </div>
  );
};

/* ============================ HESAP (o anki paran) ============================ */
const HesapPanel = ({ bakiye, gelir, odenen, birikim, onParaEkle, onBirikimeAktar }) => (
  <div className={`${CARD} p-6 relative overflow-hidden`}>
    <div aria-hidden className="absolute inset-0 pointer-events-none opacity-[0.06]"
      style={{ backgroundImage: "repeating-linear-gradient(115deg, #c7dade 0 1px, transparent 1px 40px)" }} />
    <div aria-hidden className="absolute left-0 top-0 h-px w-full bg-gradient-to-r from-purple-400/70 via-purple-400/10 to-transparent" />
    <div className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-5">
      <div className="min-w-0">
        <p className="text-slate-400 text-sm mb-1 flex items-center gap-2"><Landmark size={16} className="text-indigo-400" /> Hesabındaki para</p>
        <p className={`text-4xl font-bold tracking-tight ${bakiye < 0 ? 'text-red-400' : 'text-white'}`}>{money(bakiye)}</p>
        <p className="text-slate-500 text-xs mt-2">Gelirlerin eklenir, ödediklerin ve birikime ayırdıkların düşülür.</p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button onClick={onParaEkle} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2">
          <Plus size={16} /> Para Ekle
        </button>
        <button onClick={onBirikimeAktar} className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2">
          <PiggyBank size={16} /> Birikime Aktar
        </button>
      </div>
    </div>
    <div className="relative z-10 grid grid-cols-3 gap-2 text-center mt-5 pt-4 border-t border-slate-800">
      <div><p className="text-[11px] text-slate-500 mb-1">Toplam gelen</p><p className="text-sm font-semibold text-emerald-400">{money(gelir)}</p></div>
      <div><p className="text-[11px] text-slate-500 mb-1">Toplam ödenen</p><p className="text-sm font-semibold text-slate-300">{money(odenen)}</p></div>
      <div><p className="text-[11px] text-slate-500 mb-1">Birikimde</p><p className="text-sm font-semibold text-purple-300">{money(birikim)}</p></div>
    </div>
  </div>
);

/* ============================ BİRİKİM: HALKA GRAFİK ============================ */
const Halka = ({ yuzde, renk, boyut = 96 }) => {
  const r = (boyut - 12) / 2, cevre = 2 * Math.PI * r;
  const dolu = Math.min(100, Math.max(0, yuzde));
  return (
    <svg width={boyut} height={boyut} className="shrink-0 -rotate-90">
      <circle cx={boyut / 2} cy={boyut / 2} r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
      <circle cx={boyut / 2} cy={boyut / 2} r={r} fill="none" stroke={renk} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={cevre} strokeDashoffset={cevre - (cevre * dolu) / 100}
        style={{ transition: 'stroke-dashoffset .6s ease' }} />
    </svg>
  );
};

/* ============================ BİRİKİM: HEDEF EKLE / DÜZENLE ============================ */
const GoalModal = ({ onClose, user, onSaved, showToast, editing }) => {
  const isEdit = !!editing;
  const [title, setTitle] = useState(editing?.title || '');
  const [hedef, setHedef] = useState(editing?.target_amount ? String(editing.target_amount) : '');
  const [tarih, setTarih] = useState(editing?.target_date || '');
  const [renk, setRenk] = useState(editing?.color || 'bg-indigo-500');
  const [saving, setSaving] = useState(false); const [err, setErr] = useState('');

  const save = async (e) => {
    e.preventDefault();
    if (!title.trim()) return setErr('Bir isim yaz.');
    setSaving(true); setErr('');
    const veri = {
      title: title.trim(),
      target_amount: hedef ? parseFloat(hedef) : null,
      target_date: tarih || null,
      color: renk
    };
    const { error } = isEdit
      ? await supabase.from('savings_goals').update(veri).eq('id', editing.id)
      : await supabase.from('savings_goals').insert([{ ...veri, user_id: user.id }]);
    setSaving(false);
    if (error) return setErr(hataMesaji(error));
    showToast(isEdit ? 'Hedef güncellendi.' : 'Hedef oluşturuldu.'); onSaved();
  };

  return (
    <Modal title={isEdit ? 'Hedefi Düzenle' : 'Yeni Birikim Hedefi'} icon={Target} onClose={onClose}>
      {err && <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm p-3 rounded-xl mb-5">{err}</div>}
      <form onSubmit={save} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Ne için biriktiriyorsun?</label>
          <input required value={title} onChange={e => setTitle(e.target.value)} className={INPUT} placeholder="Laptop, tatil, acil durum..." />
          <div className="flex flex-wrap gap-2 mt-2">
            {['Acil Durum', 'Laptop', 'Tatil', 'Araba', 'Telefon'].map(h => (
              <button key={h} type="button" onClick={() => setTitle(h)}
                className={`text-xs px-3 py-1.5 rounded-lg border ${title === h ? 'bg-indigo-600/20 border-indigo-500 text-indigo-300' : 'bg-[#091316] border-slate-700 text-slate-400'}`}>{h}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Hedef tutar</label>
            <input type="number" step="0.01" min="0" value={hedef} onChange={e => setHedef(e.target.value)} className={INPUT} placeholder="Boş = kumbara" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Son tarih</label>
            <input type="date" value={tarih} onChange={e => setTarih(e.target.value)} className={`${INPUT} [color-scheme:dark]`} />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Renk</label>
          <div className="flex flex-wrap gap-2">
            {Object.keys(HEX_COLORS).map(c => (
              <button key={c} type="button" onClick={() => setRenk(c)}
                className={`w-8 h-8 rounded-full ${c} ${renk === c ? 'ring-2 ring-white scale-110' : 'opacity-50 hover:opacity-100'} transition-all`} />
            ))}
          </div>
        </div>
        <button type="submit" disabled={saving} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 rounded-xl flex justify-center items-center gap-2">
          {saving ? <Loader2 className="animate-spin" size={18} /> : <><Check size={18} /> Kaydet</>}
        </button>
      </form>
    </Modal>
  );
};

/* ============================ BİRİKİM: PARA AKTAR / ÇEK ============================ */
const TransferModal = ({ goal, hedefler, onClose, user, onSaved, showToast, kalanBakiye }) => {
  const [goalId, setGoalId] = useState(goal?.id || hedefler[0]?.id || '');
  const [tutar, setTutar] = useState('');
  const [yon, setYon] = useState('ekle');   // ekle | cek
  const [not, setNot] = useState('');
  const [saving, setSaving] = useState(false); const [err, setErr] = useState('');

  const secili = hedefler.find(h => h.id === goalId);
  const miktar = parseFloat(tutar) || 0;

  const save = async (e) => {
    e.preventDefault();
    if (!goalId) return setErr('Bir hedef seç.');
    if (miktar <= 0) return setErr('Tutar sıfırdan büyük olmalı.');
    if (yon === 'cek' && secili && miktar > secili.biriken) return setErr(`Bu hedefte ${money(secili.biriken)} var, daha fazlasını çekemezsin.`);
    setSaving(true); setErr('');
    const { error } = await supabase.from('savings_transactions').insert([{
      goal_id: goalId, user_id: user.id,
      amount: yon === 'ekle' ? miktar : -miktar,
      note: not.trim() || null, moved_at: iso(new Date())
    }]);
    setSaving(false);
    if (error) return setErr(hataMesaji(error));
    showToast(yon === 'ekle' ? `${money(miktar)} birikime aktarıldı.` : `${money(miktar)} birikimden çekildi.`);
    onSaved();
  };

  return (
    <Modal title={yon === 'ekle' ? 'Birikime Aktar' : 'Birikimden Çek'} icon={PiggyBank} onClose={onClose}>
      {err && <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm p-3 rounded-xl mb-5">{err}</div>}
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {[['ekle', 'Para Aktar', ArrowDownLeft], ['cek', 'Geri Çek', ArrowUpRight]].map(([id, etiket, Ikon]) => (
            <button key={id} type="button" onClick={() => setYon(id)}
              className={`py-2.5 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition-all ${yon === id ? (id === 'ekle' ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300' : 'bg-orange-600/20 border-orange-500 text-orange-300') : 'bg-[#091316] border-slate-700 text-slate-400'}`}>
              <Ikon size={16} /> {etiket}
            </button>
          ))}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Hedef</label>
          <select value={goalId} onChange={e => setGoalId(e.target.value)} className={INPUT}>
            {hedefler.map(h => <option key={h.id} value={h.id}>{h.title} — {money(h.biriken)}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Tutar (₺)</label>
          <input type="number" step="0.01" min="0" required autoFocus value={tutar} onChange={e => setTutar(e.target.value)} className={INPUT} placeholder="0.00" />
          {yon === 'ekle' && kalanBakiye > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {[0.1, 0.25, 0.5].map(o => (
                <button key={o} type="button" onClick={() => setTutar(String(Math.round(kalanBakiye * o)))}
                  className="text-xs px-3 py-1.5 rounded-lg border bg-[#091316] border-slate-700 text-slate-400 hover:text-white">
                  Bakiyenin %{o * 100}'i
                </button>
              ))}
            </div>
          )}
          {yon === 'ekle' && miktar > 0 && (
            <p className={`text-xs mt-2 ${miktar > kalanBakiye ? 'text-yellow-500' : 'text-slate-500'}`}>
              Aktarınca elinde {money(kalanBakiye - miktar)} kalır
              {miktar > kalanBakiye && ' — bu ayki bakiyenden fazla aktarıyorsun.'}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Not (opsiyonel)</label>
          <input value={not} onChange={e => setNot(e.target.value)} className={INPUT} placeholder="Örn: maaş günü aktarımı" />
        </div>

        <button type="submit" disabled={saving} className={`w-full text-white font-medium py-3 rounded-xl flex justify-center items-center gap-2 ${yon === 'ekle' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-600 hover:bg-orange-700'}`}>
          {saving ? <Loader2 className="animate-spin" size={18} /> : <><Check size={18} /> {yon === 'ekle' ? 'Aktar' : 'Çek'}</>}
        </button>
      </form>
    </Modal>
  );
};

/* ============================ TAKVİM (ana sayfada) ============================ */
const CalendarPanel = ({ cursor, setCursor, occurrences, onPickDay, selectedDay }) => {
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const byDay = useMemo(() => {
    const m = {};
    occurrences.forEach(o => {
      const d = new Date(o.due_date);
      if (d.getFullYear() === year && d.getMonth() === month) (m[d.getDate()] ||= []).push(o);
    });
    return m;
  }, [occurrences, year, month]);

  return (
    <div className={`${CARD} p-6`}>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-white capitalize">{cursor.toLocaleDateString(TR, { month: 'long', year: 'numeric' })}</h3>
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(addMonths(cursor, -1))} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"><ChevronLeft size={18} /></button>
          <button onClick={() => setCursor(addMonths(cursor, 1))} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"><ChevronRight size={18} /></button>
          <button onClick={() => { setCursor(new Date()); onPickDay(null); }} className="ml-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg">Bugün</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-3 text-center">
        {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(d => <div key={d} className="text-xs font-medium text-slate-500">{d}</div>)}
        {Array.from({ length: startOffset }).map((_, i) => <div key={`e${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
          const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
          const items = byDay[d] || [];
          return (
            <button key={d} onClick={() => onPickDay(items.length ? d : null)} className="flex flex-col items-center group">
              <div className={`w-8 h-8 flex items-center justify-center rounded-full text-sm transition-colors
                ${isToday ? 'bg-indigo-600 text-white font-bold shadow-lg shadow-indigo-500/40'
                  : selectedDay === d ? 'bg-slate-700 text-white' : 'text-slate-300 group-hover:bg-slate-800'}`}>{d}</div>
              <div className="flex gap-0.5 mt-1 h-1.5">
                {items.slice(0, 3).map((p, i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: p.status === 'odendi' ? '#475569' : (HEX_COLORS[p.payments?.categories?.color] || '#64748b') }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="mt-5 pt-5 border-t border-slate-800 space-y-2">
          <p className="text-xs font-medium text-slate-400 mb-2">{selectedDay} {cursor.toLocaleDateString(TR, { month: 'long' })}</p>
          {(byDay[selectedDay] || []).map(i => (
            <div key={i.id} className="flex justify-between text-sm bg-[#091316] border border-slate-800 rounded-lg px-3 py-2">
              <span className="text-slate-300 truncate">{i.payments?.title}</span>
              <span className="text-white font-medium shrink-0 ml-3">{money(i.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ============================ ANA UYGULAMA ============================ */
const PAGE_SIZE = 20;

export default function App() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [kurtarma, setKurtarma] = useState(false);   // şifre sıfırlama linkinden gelindiğinde
  const [dogrulandi, setDogrulandi] = useState(false); // e-posta doğrulama linkinden gelindiğinde
  const [activeTab, setActiveTab] = useState(() => {
    try { return localStorage.getItem('aktifSekme') || 'Ana Sayfa'; } catch { return 'Ana Sayfa'; }
  });
  const [categories, setCategories] = useState([]);
  const [payments, setPayments] = useState([]);
  const [incomes, setIncomes] = useState([]);
  const [incomeModal, setIncomeModal] = useState(false);
  const [paraModal, setParaModal] = useState(false); // hesaba tek seferlik para ekleme
  const [goals, setGoals] = useState([]);
  const [savingsTx, setSavingsTx] = useState([]);
  const [goalModal, setGoalModal] = useState(null);      // {} | {editing}
  const [transferModal, setTransferModal] = useState(null); // {} | {goal}
  const [occurrences, setOccurrences] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [statusFilter, setStatusFilter] = useState('hepsi');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [acikGruplar, setAcikGruplar] = useState(new Set());
  const elleSilinenler = useRef(new Set()); // otomatik yenilemenin geri getirmemesi için
  const otoUretimAktif = useRef(false); // aynı taksitin iki kez üretilmesini engeller
  const [grupluGorunum, setGrupluGorunum] = useState(true);
  const [calCursor, setCalCursor] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('bg-blue-500');

  const [paymentModal, setPaymentModal] = useState(null);
  const [occModal, setOccModal] = useState(null);
  const [catModal, setCatModal] = useState(null);

  const showToast = (msg, type = 'ok') => { setToast({ msg, type }); setTimeout(() => setToast(null), 2600); };

  useEffect(() => {
    // "Beni hatırla" işaretsizse (=='0') ve bu yeni bir tarayıcı oturumuysa, kalıcı oturumu düşür.
    const hatirlamaKapali = (() => { try { return localStorage.getItem('beniHatirla') === '0'; } catch { return false; } })();
    const yeniSekme = (() => { try { return !sessionStorage.getItem('oturumCanli'); } catch { return false; } })();
    try { sessionStorage.setItem('oturumCanli', '1'); } catch { /* gizli mod */ }

    const baslat = async () => {
      // E-posta doğrulama linkinden gelindiyse: oturumu açma, onay ekranını göster
      const tur = adresTipi();
      if (tur === 'signup' || tur === 'email_change') {
        dogrulamaSurecinde = true;
        await new Promise(r => setTimeout(r, 400));      // Supabase adresteki token'ı işlesin
        try { await supabase.auth.signOut(); } catch { /* yoksay */ }
        try { window.history.replaceState(null, '', window.location.pathname); } catch { /* yoksay */ }
        setSession(null); setDogrulandi(true); setBooting(false);
        return;
      }
      if (hatirlamaKapali && yeniSekme) { try { await supabase.auth.signOut(); } catch { /* yoksay */ } }
      const { data } = await supabase.auth.getSession();
      setSession(data.session); setBooting(false);
    };
    baslat();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setKurtarma(true); // e-posta linkinden gelindi
      if (kayitSurecinde || dogrulamaSurecinde) return;     // geçici oturumları yok say
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchAll = async () => {
    if (!session?.user) return;
    setLoadingData(true);
    const uid = session.user.id;
    const [cats, pays, occs, gels, hedefler, hareketler] = await Promise.all([
      supabase.from('categories').select('*').eq('user_id', uid).order('name'),
      supabase.from('payments').select('*, categories(name,color)').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('payment_occurrences')
        .select('id, payment_id, due_date, amount, status, installment_number, paid_date, payments(id, title, type, total_installments, is_auto_pay, is_pinned, notes, repeat_period, categories(name,color))')
        .eq('user_id', uid).order('due_date', { ascending: true }),
      supabase.from('incomes').select('*').eq('user_id', uid).order('start_date', { ascending: false }),
      supabase.from('savings_goals').select('*').eq('user_id', uid).eq('is_archived', false).order('created_at'),
      supabase.from('savings_transactions').select('*').eq('user_id', uid).order('moved_at', { ascending: false })
    ]);
    if (cats.data) setCategories(cats.data);
    if (pays.data) setPayments(pays.data);
    if (occs.data) setOccurrences(occs.data);
    if (gels.data) setIncomes(gels.data);
    // incomes tablosu henüz oluşturulmadıysa sessiz geç, uygulama çalışmaya devam etsin
    if (gels.error) console.warn('[gelir]', gels.error.message);
    if (hedefler.data) setGoals(hedefler.data);
    if (savingsTx && hareketler.data) setSavingsTx(hareketler.data);
    if (hedefler.error) console.warn('[birikim]', hedefler.error.message);
    const ilkHata = cats.error || pays.error || occs.error;
    if (ilkHata) showToast(hataMesaji(ilkHata), 'error');
    setLoadingData(false);
  };

  useEffect(() => { if (session) fetchAll(); }, [session]);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [statusFilter, activeTab]);

  /* Aboneliklerde liste boşalmasın diye SADECE tek bir yaklaşan taksit garanti edilir.
     Kullanıcı sildiğinde geri gelmesin diye o ödeme bu oturumda atlanır. */
  useEffect(() => {
    if (!session || !payments.length || !occurrences.length) return;

    const ustSinir = addMonths(startOfToday(), 12);
    const eksikler = [];

    payments.filter(p => p.type === 'abonelik' || p.type === 'kredi_karti').forEach(p => {
      if (elleSilinenler.current.has(p.id)) return;          // kullanıcı bilerek sildi
      const mine = occurrences.filter(o => o.payment_id === p.id);
      if (!mine.length) return;

      const gelecek = mine.filter(o => o.status === 'bekliyor' && new Date(o.due_date) >= startOfToday());
      if (gelecek.length > 0) return;                        // zaten bekleyen var, karışma

      const son = mine.reduce((a, b) => new Date(a.due_date) > new Date(b.due_date) ? a : b);
      let d = nextDate(son.due_date, p.repeat_period || 'aylik');
      // Vade geçmişte kaldıysa bugüne yetişene kadar ilerlet
      let guvenlik = 0;
      while (d < startOfToday() && guvenlik++ < 60) d = nextDate(d, p.repeat_period || 'aylik');
      if (d >= ustSinir) return;

      eksikler.push({
        payment_id: p.id, user_id: session.user.id, due_date: iso(d),
        amount: p.amount, installment_number: (son.installment_number || mine.length) + 1, status: 'bekliyor'
      });
    });

    if (eksikler.length && !otoUretimAktif.current) {
      otoUretimAktif.current = true;
      supabase.from('payment_occurrences').insert(eksikler)
        .then(({ error }) => { if (!error) fetchAll(); })
        .finally(() => { otoUretimAktif.current = false; });
    }
  }, [payments, occurrences.length]);

  /* Esc ile açık pencereyi kapat */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { setPaymentModal(null); setOccModal(null); setCatModal(null); setIncomeModal(false); setGoalModal(null); setTransferModal(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const today = startOfToday();
  const simdi = useMemo(() => new Date(), []); // bütçe hep içinde bulunulan aya sabit; takvim ayrı gezer
  const gunBasi = useMemo(() => startOfToday(), []); // memo bağımlılığı için sabit "bugün"
  const searched = occurrences;

  const pending = useMemo(() => searched.filter(o => o.status === 'bekliyor'), [searched]);
  const overdue = useMemo(() => pending.filter(o => new Date(o.due_date) < today), [pending]);
  const upcoming = useMemo(() => pending.filter(o => new Date(o.due_date) >= today), [pending]);
  const paidList = useMemo(() => searched.filter(o => o.status === 'odendi'), [searched]);
  const pinned = useMemo(() => pending.filter(o => o.payments?.is_pinned), [pending]);

  const summary = useMemo(() => {
    const inMonth = (d) => { const x = new Date(d); return x.getMonth() === today.getMonth() && x.getFullYear() === today.getFullYear(); };
    const sum = (a) => a.reduce((x, y) => x + Number(y.amount), 0);
    const soon = upcoming.filter(o => dayDiff(o.due_date).raw <= 7);
    return {
      thisMonth: sum(pending.filter(o => inMonth(o.due_date))),
      upcomingTotal: sum(soon), upcomingCount: soon.length,
      overdueTotal: sum(overdue), overdueCount: overdue.length
    };
  }, [pending, upcoming, overdue]);

  /* Özet kartlarındaki mini grafikler: son 6 ay + önümüzdeki 7 gün (hepsi gerçek veri). */
  const kartTrend = useMemo(() => {
    const aylar = [];
    for (let i = 5; i >= 0; i--) { const d = addMonths(simdi, -i); aylar.push([d.getFullYear(), d.getMonth()]); }
    const ayToplam = (pred) => aylar.map(([y, m]) => occurrences
      .filter(o => { const d = new Date(o.due_date); return d.getFullYear() === y && d.getMonth() === m && pred(o, d); })
      .reduce((a, b) => a + Number(b.amount), 0));
    const ayGider = ayToplam(() => true);
    const ayGeciken = ayToplam((o, d) => o.status === 'bekliyor' && d < gunBasi);
    const ayGelir = aylar.map(([y, m]) => {
      const son = new Date(y, m + 1, 0);
      return incomes.reduce((t, g) => {
        const bas = new Date(g.start_date);
        if (g.is_recurring) return bas <= son ? t + Number(g.amount) : t;
        return (bas.getMonth() === m && bas.getFullYear() === y) ? t + Number(g.amount) : t;
      }, 0);
    });
    const ayKalan = ayGelir.map((g, i) => Math.max(0, g - ayGider[i]));
    const gunler = Array.from({ length: 7 }, (_, i) => {
      const k = iso(addDays(gunBasi, i));
      return occurrences.filter(o => o.status === 'bekliyor' && iso(new Date(o.due_date)) === k).reduce((a, b) => a + Number(b.amount), 0);
    });
    return { ayGider, ayGeciken, ayKalan, gunler };
  }, [occurrences, incomes, simdi, gunBasi]);

  /* Her hedefin biriken tutarı ve ilerleme yüzdesi */
  const hedeflerDolu = useMemo(() => goals.map(h => {
    const biriken = savingsTx.filter(t => t.goal_id === h.id).reduce((a, b) => a + Number(b.amount), 0);
    const yuzde = h.target_amount ? (biriken / Number(h.target_amount)) * 100 : 0;
    return { ...h, biriken, yuzde, tamam: h.target_amount ? biriken >= Number(h.target_amount) : false };
  }), [goals, savingsTx]);

  const toplamBirikim = useMemo(() => savingsTx.reduce((a, b) => a + Number(b.amount), 0), [savingsTx]);

  /* HESAP: o an cebindeki para. Bugüne kadar tahakkuk eden tüm gelirler
     eksi ödenen taksitler eksi birikime ayrılan net tutar. */
  const hesap = useMemo(() => {
    const toplamGelir = incomes.reduce((t, g) => {
      const bas = new Date(g.start_date); bas.setHours(0, 0, 0, 0);
      if (bas > gunBasi) return t;                         // ileri tarihli, henüz gelmedi
      if (!g.is_recurring) return t + Number(g.amount);
      const ayAdedi = (gunBasi.getFullYear() - bas.getFullYear()) * 12 + (gunBasi.getMonth() - bas.getMonth()) + 1;
      return t + Number(g.amount) * Math.max(1, ayAdedi);  // her ay bir kez yatmış say
    }, 0);
    const toplamOdenen = occurrences.filter(o => o.status === 'odendi').reduce((a, b) => a + Number(b.amount), 0);
    return { toplamGelir, toplamOdenen, birikim: toplamBirikim, bakiye: toplamGelir - toplamOdenen - toplamBirikim };
  }, [incomes, occurrences, toplamBirikim, gunBasi]);

  /* Seçili ayın geliri: tekrar edenler (başlangıcı geçmişse) + o aya ait tek seferlikler */
  const butce = useMemo(() => {
    const ay = simdi.getMonth(), yil = simdi.getFullYear();
    const ayinSonu = new Date(yil, ay + 1, 0);
    const gelir = incomes.reduce((t, g) => {
      const bas = new Date(g.start_date);
      if (g.is_recurring) return bas <= ayinSonu ? t + Number(g.amount) : t;
      return (bas.getMonth() === ay && bas.getFullYear() === yil) ? t + Number(g.amount) : t;
    }, 0);
    const buAy = occurrences.filter(o => {
      const d = new Date(o.due_date);
      return d.getMonth() === ay && d.getFullYear() === yil;
    });
    const odenen = buAy.filter(o => o.status === 'odendi').reduce((a, b) => a + Number(b.amount), 0);
    const bekleyen = buAy.filter(o => o.status === 'bekliyor').reduce((a, b) => a + Number(b.amount), 0);
    // O ay birikime aktarılan net tutar da cepten çıkmış sayılır
    const birikim = savingsTx.filter(t => {
      const d = new Date(t.moved_at);
      return d.getMonth() === ay && d.getFullYear() === yil;
    }).reduce((a, b) => a + Number(b.amount), 0);
    return { gelir, odenen, bekleyen, birikim };
  }, [incomes, occurrences, savingsTx, simdi]);

  /* Dağılım: takvimde hangi aydaysan o ayın giderleri (ödenmiş + bekleyen). */
  const chartData = useMemo(() => {
    const t = {};
    searched
      .filter(o => {
        const d = new Date(o.due_date);
        return d.getMonth() === calCursor.getMonth() && d.getFullYear() === calCursor.getFullYear();
      })
      .forEach(o => {
        const name = o.payments?.categories?.name || 'Diğer';
        if (!t[name]) t[name] = { name, value: 0, color: HEX_COLORS[o.payments?.categories?.color] || '#64748b' };
        t[name].value += Number(o.amount);
      });
    return Object.values(t).sort((a, b) => b.value - a.value);
  }, [searched, calCursor]);

  const filteredList = useMemo(() => {
    if (statusFilter === 'bekliyor') return pending;
    if (statusFilter === 'geciken') return overdue;
    if (statusFilter === 'odendi') return paidList;
    if (statusFilter === 'onemli') return pinned;
    return searched;
  }, [statusFilter, pending, overdue, paidList, pinned, searched]);

  /* --- Aksiyonlar --- */
  const togglePaid = async (item) => {
    const next = item.status === 'odendi' ? 'bekliyor' : 'odendi';

    /* Vadesi gelmemiş taksitin yanlışlıkla ödenmiş işaretlenmesini engelle.
       Bu ay içindeyse erken ödeme olabilir, sadece onay isteriz;
       sonraki aylara aitse doğrudan reddederiz. */
    if (next === 'odendi') {
      const vade = new Date(item.due_date); vade.setHours(0, 0, 0, 0);
      const bugun = startOfToday();
      const ayinSonu = new Date(bugun.getFullYear(), bugun.getMonth() + 1, 0);

      if (vade > ayinSonu) {
        return showToast(`Bu taksitin vadesi ${formatDate(item.due_date)}. Gelecek aylara ait taksitler ödendi işaretlenemez.`, 'error');
      }
      if (vade > bugun) {
        const gun = dayDiff(item.due_date).days;
        if (!window.confirm(`Bu taksitin vadesine ${gun} gün var (${formatDate(item.due_date)}).\nErken ödeme yaptıysan onayla.`)) return;
      }
    }

    setOccurrences(prev => prev.map(o => o.id === item.id ? { ...o, status: next } : o));
    const { error } = await supabase.from('payment_occurrences')
      .update({ status: next, paid_date: next === 'odendi' ? new Date().toISOString() : null }).eq('id', item.id);
    if (error) { showToast(hataMesaji(error), 'error'); return fetchAll(); }

    // Abonelik / ekstre: bekleyen son taksit ödendiyse sonrakini üret
    const p = item.payments;
    if (next === 'odendi' && p && (p.type === 'abonelik' || p.type === 'kredi_karti')) {
      const remaining = occurrences.filter(o => o.payment_id === item.payment_id && o.status === 'bekliyor' && o.id !== item.id);
      if (remaining.length === 0) {
        await supabase.from('payment_occurrences').insert([{
          payment_id: item.payment_id, user_id: session.user.id,
          due_date: iso(nextDate(item.due_date, p.repeat_period || 'aylik')),
          amount: item.amount, installment_number: (item.installment_number || 0) + 1, status: 'bekliyor'
        }]);
        showToast('Ödendi. Sonraki taksit otomatik oluşturuldu.');
        return fetchAll();
      }
    }
    showToast(next === 'odendi' ? 'Ödendi olarak işaretlendi.' : 'Geri alındı.');
  };

  const deleteOccurrence = async (item) => {
    if (!window.confirm(`"${item.payments?.title}" için bu taksiti silmek istiyor musun?`)) return;
    const { error } = await supabase.from('payment_occurrences').delete().eq('id', item.id);
    if (error) return showToast(hataMesaji(error), 'error');
    elleSilinenler.current.add(item.payment_id);   // otomatik yenileme bu ödemeye dokunmasın
    setOccurrences(prev => prev.filter(o => o.id !== item.id));
    showToast('Taksit silindi.');
  };

  const deletePayment = async (p) => {
    if (!window.confirm(`"${p.title}" ve tüm taksitleri silinecek. Emin misin?`)) return;
    // Önce bağlı taksitleri sil; cascade'in RLS altında çalışmadığı durumlar için güvenli yol.
    const { error: tErr } = await supabase.from('payment_occurrences').delete().eq('payment_id', p.id);
    if (tErr) return showToast(hataMesaji(tErr), 'error');
    const { error } = await supabase.from('payments').delete().eq('id', p.id);
    if (error) return showToast(hataMesaji(error), 'error');
    showToast('Ödeme silindi.'); fetchAll();
  };

  const togglePin = async (p) => {
    const { error } = await supabase.from('payments').update({ is_pinned: !p.is_pinned }).eq('id', p.id);
    if (error) return showToast(hataMesaji(error), 'error');
    fetchAll();
  };

  const handleAddCategory = async (e) => {
    e.preventDefault();
    const name = newCatName.trim(); if (!name) return;
    const { data, error } = await supabase.from('categories')
      .insert([{ user_id: session.user.id, name, color: newCatColor }]).select().single();
    if (error) return showToast(hataMesaji(error), 'error');
    setCategories([...categories, data].sort((a, b) => a.name.localeCompare(b.name, TR)));
    setNewCatName(''); showToast('Kategori eklendi.');
  };

  const STARTER = [
    { name: 'Ev', color: 'bg-blue-500' }, { name: 'Faturalar', color: 'bg-green-500' },
    { name: 'Abonelikler', color: 'bg-purple-500' }, { name: 'Ulaşım', color: 'bg-orange-500' },
    { name: 'Yeme & İçme', color: 'bg-red-500' }, { name: 'Sağlık', color: 'bg-teal-500' }
  ];

  const createStarterCategories = async () => {
    const { error } = await supabase.from('categories')
      .insert(STARTER.map(c => ({ ...c, user_id: session.user.id })));
    if (error) return showToast(hataMesaji(error), 'error');
    showToast('Başlangıç kategorileri hazır.'); fetchAll();
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm('Kategori silinsin mi? Bağlı ödemeler "Kategorisiz" olur.')) return;
    const { error } = await supabase.from('categories').delete().eq('id', id);
    if (error) return showToast(hataMesaji(error), 'error');
    setCategories(categories.filter(c => c.id !== id)); fetchAll();
  };

  /* --- PDF dışa aktarma ---
     Ayrı bir kütüphane yerine tarayıcının yazdırma motorunu kullanıyoruz:
     Türkçe karakterler sorunsuz çıkıyor ve ek bağımlılık gerekmiyor.
     Açılan pencerede "Hedef: PDF olarak kaydet" seçilir. */
  const exportPdf = (list, baslik) => {
    if (!list.length) return showToast('Dışa aktarılacak kayıt yok.', 'error');
    const esc = (t) => String(t ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const durum = (o) => o.status === 'odendi' ? 'Ödendi' : (new Date(o.due_date) < startOfToday() ? 'Gecikti' : 'Bekliyor');
    const toplam = list.reduce((a, b) => a + Number(b.amount), 0);
    const odenen = list.filter(o => o.status === 'odendi').reduce((a, b) => a + Number(b.amount), 0);

    const rows = list.map(o => `<tr>
      <td>${esc(o.payments?.title)}</td>
      <td>${esc(o.payments?.categories?.name || 'Kategorisiz')}</td>
      <td>${esc(TYPE_LABEL[o.payments?.type] || '-')}</td>
      <td>${esc(formatDate(o.due_date))}</td>
      <td class="r">${esc(money(o.amount))}</td>
      <td class="${o.status === 'odendi' ? 'ok' : (new Date(o.due_date) < startOfToday() ? 'bad' : '')}">${durum(o)}</td>
    </tr>`).join('');

    const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
      <title>Parota-${iso(new Date())}</title>
      <style>
        *{box-sizing:border-box}
        body{font-family:"Segoe UI",Arial,sans-serif;color:#111;margin:32px;font-size:12px}
        h1{font-size:20px;margin:0 0 4px}
        .sub{color:#666;font-size:11px;margin-bottom:20px}
        .kutular{display:flex;gap:12px;margin-bottom:20px}
        .kutu{flex:1;border:1px solid #ddd;border-radius:8px;padding:10px 12px}
        .kutu span{display:block;color:#666;font-size:10px;margin-bottom:3px}
        .kutu b{font-size:14px}
        table{width:100%;border-collapse:collapse}
        th,td{border-bottom:1px solid #e5e5e5;padding:7px 6px;text-align:left}
        th{background:#f4f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.03em}
        td.r,th.r{text-align:right}
        .ok{color:#15803d}.bad{color:#b91c1c}
        tfoot td{font-weight:bold;border-top:2px solid #333;border-bottom:none}
        footer{margin-top:24px;color:#888;font-size:10px;text-align:center}
        @media print{body{margin:12mm} .yazdir{display:none!important}}
        .yazdir{position:sticky;top:0;display:flex;gap:8px;justify-content:flex-end;padding:10px 0 14px;background:#fff}
        .yazdir button{font:600 13px/1 "Segoe UI",Arial,sans-serif;padding:11px 18px;border-radius:9px;border:0;background:#4f46e5;color:#fff}
      </style></head><body>
      <div class="yazdir"><button onclick="window.print()">Yazdır / PDF olarak kaydet</button></div>
      <h1>Parota Raporu</h1>
      <div class="sub">${esc(baslik)} · ${esc(session.user.email)} · ${esc(formatDate(new Date()))}</div>
      <div class="kutular">
        <div class="kutu"><span>Kayıt sayısı</span><b>${list.length}</b></div>
        <div class="kutu"><span>Toplam tutar</span><b>${esc(money(toplam))}</b></div>
        <div class="kutu"><span>Ödenen</span><b>${esc(money(odenen))}</b></div>
        <div class="kutu"><span>Kalan</span><b>${esc(money(toplam - odenen))}</b></div>
      </div>
      <table>
        <thead><tr><th>İşlem</th><th>Kategori</th><th>Tür</th><th>Tarih</th><th class="r">Tutar</th><th>Durum</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="4">TOPLAM</td><td class="r">${esc(money(toplam))}</td><td></td></tr></tfoot>
      </table>
      <footer>Parota · Finansını Planla, Rahatla</footer>
      <script>
        // Mobilde otomatik yazdırma çoğu tarayıcıda engelleniyor; orada butonla açtırıyoruz.
        if (!matchMedia('(max-width: 820px)').matches) window.addEventListener('load', () => setTimeout(() => window.print(), 250));
      <${'/'}script>
      </body></html>`;

    /* document.write mobil tarayıcılarda güvenilir değil; Blob URL ile gerçek bir sayfa açıyoruz. */
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) {
      // Sekme engellendiyse (mobilde sık) dosya olarak indirilsin
      const a = document.createElement('a');
      a.href = url; a.download = `Parota-${iso(new Date())}.html`;
      document.body.appendChild(a); a.click(); a.remove();
      showToast('Rapor indirildi. Açıp "Yazdır → PDF" diyebilirsin.');
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  /* Aynı ödemenin taksitlerini tek satırda topla; en yakın tarihli olanı göster. */
  const grupla = (liste) => {
    const harita = new Map();
    liste.forEach(o => {
      const k = o.payment_id;
      if (!harita.has(k)) harita.set(k, []);
      harita.get(k).push(o);
    });
    return [...harita.values()]
      .map(hepsi => ({ ana: hepsi[0], hepsi }))
      .sort((a, b) => new Date(a.ana.due_date) - new Date(b.ana.due_date));
  };

  const acKapa = (id) => setAcikGruplar(prev => {
    const y = new Set(prev); y.has(id) ? y.delete(id) : y.add(id); return y;
  });

  /* Yanlışlıkla ödendi işaretlenmiş, vadesi henüz gelmemiş taksitleri toplu geri al. */
  const deleteGoal = async (h) => {
    if (!window.confirm(`"${h.title}" hedefi ve tüm hareketleri silinecek. Emin misin?`)) return;
    await supabase.from('savings_transactions').delete().eq('goal_id', h.id);
    const { error } = await supabase.from('savings_goals').delete().eq('id', h.id);
    if (error) return showToast(hataMesaji(error), 'error');
    showToast('Hedef silindi.'); fetchAll();
  };

  const deleteIncome = async (g) => {
    if (!window.confirm(`"${g.title}" geliri silinsin mi?`)) return;
    const { error } = await supabase.from('incomes').delete().eq('id', g.id);
    if (error) return showToast(hataMesaji(error), 'error');
    setIncomes(incomes.filter(x => x.id !== g.id)); showToast('Gelir silindi.');
  };

  const goTab = (t) => {
    setActiveTab(t); setSidebarOpen(false);
    try { localStorage.setItem('aktifSekme', t); } catch { /* gizli mod */ }
  };
  const openEditFromRow = (occ) => {
    const p = payments.find(x => x.id === occ.payment_id);
    if (p) setPaymentModal({ editing: p }); else setOccModal(occ);
  };

  if (booting) return <div className="h-screen flex justify-center items-center bg-[#091316]"><Loader2 className="animate-spin text-indigo-500" size={40} /></div>;
  if (kurtarma) return <SifreYenile showToast={showToast} onDone={async () => {
    try { await supabase.auth.signOut(); } catch { /* yoksay */ } // yeni şifreyle bilinçli giriş için oturumu kapat
    setSession(null); setKurtarma(false);
    try { window.history.replaceState(null, '', window.location.pathname); } catch { /* yoksay */ }
  }} />;
  if (dogrulandi) return <EpostaDogrulandi onDevam={() => { dogrulamaSurecinde = false; setDogrulandi(false); }} />;
  if (!session) return <Login />;

  const userName = (session.user.user_metadata?.ad || '').trim()
    || session.user.user_metadata?.full_name
    || session.user.email.split('@')[0];
  const rowProps = { onToggle: togglePaid, onDelete: deleteOccurrence, onEdit: openEditFromRow };
  const navItems = [['Ana Sayfa', Home], ['Ödemeler', CreditCard], ['Kategoriler', PieChart], ['Abonelikler', Zap], ['Birikim', PiggyBank], null, ['Ayarlar', Settings]];

  return (
    <div className="flex min-h-[100dvh] bg-[#091316] text-slate-200 font-sans selection:bg-indigo-500/30">
      {/* Mobil perde */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/60 z-30 md:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={`w-64 bg-[#091316] border-r border-slate-800 flex flex-col shrink-0 z-40 fixed md:sticky inset-y-0 left-0 h-[100dvh] md:top-0 transition-transform duration-300 ease-out md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 flex items-center space-x-3 mb-2 shrink-0">
          <span className="text-indigo-400 shrink-0"><ParotaMark size={30} /></span>
          <div className="flex-1"><h2 className="text-xl font-bold text-white tracking-tight">Parota</h2><p className="text-xs text-slate-400 font-medium">Finansını Planla, Rahatla</p></div>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden p-1.5 text-slate-400 hover:text-white bg-slate-900 rounded-lg"><X size={18} /></button>
        </div>
        <nav className="flex-1 min-h-0 px-4 space-y-1 overflow-y-auto">
          {navItems.map((it, i) => it === null
            ? <div key={i} className="my-4 border-t border-slate-800/50 mx-4" />
            : <SidebarItem key={it[0]} icon={it[1]} label={it[0]} isActive={activeTab === it[0]}
                onClick={() => goTab(it[0])} badge={it[0] === 'Ödemeler' ? overdue.length : 0} />)}

          {/* Dönem seçici: ana sayfadaki dağılım grafiği ve takvim bu ayı gösterir */}
          <div className="pt-3">
            <p className="px-4 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Dönem</p>
            <div className="relative">
              <CalendarIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <select value={`${calCursor.getFullYear()}-${calCursor.getMonth()}`}
                onChange={e => { const [y, m] = e.target.value.split('-').map(Number); setCalCursor(new Date(y, m, 1)); setSelectedDay(null); }}
                className="w-full appearance-none bg-transparent hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl pl-11 pr-9 py-3 text-sm capitalize outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer transition-colors">
                {Array.from({ length: 13 }, (_, i) => addMonths(simdi, i - 6)).map(d => (
                  <option key={`${d.getFullYear()}-${d.getMonth()}`} value={`${d.getFullYear()}-${d.getMonth()}`} className="bg-[#10222A]">
                    {d.toLocaleDateString(TR, { month: 'long', year: 'numeric' })}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
          </div>
        </nav>
        <div className="shrink-0 p-4 border-t border-slate-800/60">
          <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-900 cursor-pointer border border-transparent hover:border-slate-800"
            onClick={() => supabase.auth.signOut()}>
            <div aria-hidden="true" className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shrink-0 select-none">
              {basHarfler(userName)}
            </div>
            <div className="flex-1 overflow-hidden">
              <h4 className="text-sm font-bold text-white truncate">{userName}</h4>
              <p className="text-[10px] text-red-400 uppercase font-bold mt-0.5 tracking-wider">Çıkış Yap</p>
            </div>
            <LogOut size={16} className="text-slate-500" />
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col pb-[env(safe-area-inset-bottom)]">
        <header className="flex justify-between items-center gap-4 py-4 px-4 sm:px-8 border-b border-slate-800/50 bg-[#091316]/80 backdrop-blur-md sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button className="md:hidden p-2 bg-slate-900 rounded-lg border border-slate-800" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={18} /></button>
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-white truncate">Merhaba, {userName}! 👋</h1>
              <p className="text-slate-400 text-sm mt-1 hidden sm:block">Finansal durumunuzu buradan yönetebilirsiniz.</p>
            </div>
          </div>

        </header>

        <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full">
          {loadingData && <div className="flex items-center gap-2 text-slate-500 text-sm mb-4"><Loader2 size={14} className="animate-spin" /> Yükleniyor...</div>}

          {activeTab === 'Ana Sayfa' && (
            <div className="pb-20">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
                <SummaryCard title="Bu Ay Bekleyen" amount={summary.thisMonth} type="primary" icon={Wallet} subtitle="Bu ay ödenecek" badgeText="Aylık" badgeType="neutral" onClick={() => { setStatusFilter('bekliyor'); goTab('Ödemeler'); }}
                  spark={<Sparkline data={kartTrend.ayGider} color="#818cf8" type="area" />} />
                <SummaryCard title="Yaklaşan Ödemeler" amount={summary.upcomingTotal} type="success" icon={CalendarIcon} subtitle="Önümüzdeki 7 gün" badgeText={`${summary.upcomingCount} ödeme`} badgeType="positive" onClick={() => { setStatusFilter('bekliyor'); goTab('Ödemeler'); }}
                  spark={<Sparkline data={kartTrend.gunler} color="#34d399" type="bar" />} />
                <SummaryCard title="Geciken Ödemeler" amount={summary.overdueTotal} type="danger" icon={AlertTriangle} subtitle={summary.overdueCount > 0 ? `${summary.overdueCount} ödeme gecikti` : 'Gecikme yok'} badgeText={summary.overdueCount > 0 ? 'Dikkat' : 'Temiz'} badgeType={summary.overdueCount > 0 ? 'warning' : 'positive'} onClick={() => { setStatusFilter('geciken'); goTab('Ödemeler'); }}
                  spark={<Sparkline data={kartTrend.ayGeciken} color="#f87171" type="bar" />} />
                <SummaryCard title="Hesap Bakiyesi" amount={hesap.bakiye} type="purple" icon={Landmark}
                  subtitle={hesap.toplamGelir > 0 ? 'Şu an hesabındaki para' : 'Maaşını ekle, takip başlasın'}
                  badgeText={hesap.toplamGelir > 0 ? 'Hesap' : 'Gelir ekle'} badgeType="neutral"
                  onClick={() => hesap.toplamGelir > 0 ? setParaModal(true) : setIncomeModal(true)}
                  spark={<Sparkline data={kartTrend.ayKalan} color="#c084fc" type="area" />} />
              </div>

              {hesap.toplamGelir > 0 && (
                <div className="mt-6">
                  <HesapPanel bakiye={hesap.bakiye} gelir={hesap.toplamGelir} odenen={hesap.toplamOdenen} birikim={hesap.birikim}
                    onParaEkle={() => setParaModal(true)}
                    onBirikimeAktar={() => hedeflerDolu.length ? setTransferModal({}) : goTab('Birikim')} />
                </div>
              )}

              <div className="mt-6">
                <BudgetPanel gelir={butce.gelir} odenen={butce.odenen} bekleyen={butce.bekleyen} birikim={butce.birikim}
                  ayAdi={simdi.toLocaleDateString(TR, { month: 'long', year: 'numeric' })}
                  onGelirEkle={() => setIncomeModal(true)}
                  onBirikimeAktar={() => hedeflerDolu.length ? setTransferModal({}) : goTab('Birikim')} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                <div className="lg:col-span-2 space-y-6">
                  {pinned.length > 0 && (
                    <div className={`${CARD} overflow-hidden`}>
                      <div className="p-6 border-b border-slate-800/50"><h3 className="text-lg font-bold text-white flex items-center gap-2"><Star size={18} className="text-yellow-500 fill-yellow-500" /> Sabitlenenler</h3></div>
                      <div className="p-2">{pinned.slice(0, 3).map(p => <PaymentRow key={p.id} item={p} {...rowProps} />)}</div>
                    </div>
                  )}

                  <div className={`${CARD} overflow-hidden`}>
                    <div className="flex justify-between items-center p-6 border-b border-slate-800/50">
                      <h3 className="text-lg font-bold text-white">Yaklaşan Ödemeler</h3>
                      <button onClick={() => { setStatusFilter('bekliyor'); goTab('Ödemeler'); }} className="text-xs text-indigo-400 hover:underline">Tümünü gör</button>
                    </div>
                    <div className="p-2">
                      {upcoming.length === 0
                        ? <EmptyState icon={CheckCircle} title="Yaklaşan ödemen yok" desc="Şu an bekleyen bir ödemen görünmüyor."
                            action={<button onClick={() => setPaymentModal({})} className="mt-5 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2"><Plus size={16} /> Ödeme Ekle</button>} />
                        : grupla(upcoming).slice(0, 5).map(({ ana, hepsi }) => (
                            <React.Fragment key={ana.payment_id}>
                              <PaymentRow item={ana} {...rowProps} adet={hepsi.length}
                                acik={acikGruplar.has(ana.payment_id)} onAcKapa={() => acKapa(ana.payment_id)} />
                              {acikGruplar.has(ana.payment_id) && hepsi.slice(1).map(o => (
                                <div key={o.id} className="sm:pl-10 border-l-2 border-slate-800 ml-4">
                                  <PaymentRow item={o} {...rowProps} />
                                </div>
                              ))}
                            </React.Fragment>
                          ))}
                    </div>
                  </div>

                  {overdue.length > 0 && (
                    <div className="bg-[#10222A] border border-red-900/30 rounded-2xl overflow-hidden">
                      <div className="p-6 border-b border-slate-800/50"><h3 className="text-lg font-bold text-white flex items-center gap-2"><AlertTriangle className="text-red-400" size={20} /> Geciken Ödemeler</h3></div>
                      <div className="p-2">{overdue.map(p => <PaymentRow key={p.id} item={p} {...rowProps} />)}</div>
                    </div>
                  )}
                </div>

                <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
                  <div className={`${CARD} p-6`}>
                    <div className="flex justify-between items-baseline mb-6">
                      <h3 className="text-lg font-bold text-white">Aylık Dağılım</h3>
                      <span className="text-xs text-slate-500 capitalize">{calCursor.toLocaleDateString(TR, { month: 'long', year: 'numeric' })}</span>
                    </div>
                    {chartData.length > 0 ? (
                      <div className="flex flex-col gap-6">
                        <div className="h-40 w-full">
                          <Suspense fallback={<div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-slate-600" size={20} /></div>}>
                            <CategoryPie data={chartData} format={money} />
                          </Suspense>
                        </div>
                        <div className="space-y-3">
                          {chartData.map(c => {
                            const total = chartData.reduce((a, b) => a + b.value, 0);
                            return (
                              <div key={c.name} className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-3"><span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} /><span className="text-slate-300">{c.name}</span></div>
                                <div className="flex items-center gap-4">
                                  <span className="text-slate-500 text-xs w-9 text-right">{total ? Math.round((c.value / total) * 100) : 0}%</span>
                                  <span className="text-slate-300 font-medium w-20 text-right">{money(c.value)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex justify-between items-center pt-4 border-t border-slate-800 text-sm">
                          <span className="text-slate-400 font-medium">Ay toplamı</span>
                          <span className="text-white font-bold">{money(chartData.reduce((a, b) => a + b.value, 0))}</span>
                        </div>
                      </div>
                    ) : <p className="text-slate-500 text-sm text-center py-8">Bu ay için kayıt yok.</p>}
                  </div>
                  <CalendarPanel cursor={calCursor} setCursor={setCalCursor} occurrences={occurrences} onPickDay={setSelectedDay} selectedDay={selectedDay} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Ödemeler' && (
            <div className="space-y-6 pb-20">
              <div className={`${CARD} p-3 sm:p-4 flex flex-wrap items-center gap-2`}>
                <Filter size={16} className="text-slate-500 mx-2 hidden sm:block" />
                {[['hepsi', 'Hepsi'], ['bekliyor', 'Bekleyen'], ['geciken', 'Geciken'], ['odendi', 'Ödenen'], ['onemli', 'Önemli']].map(([id, label]) => (
                  <button key={id} onClick={() => setStatusFilter(id)}
                    className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium border transition-all ${statusFilter === id ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400' : 'bg-[#091316] border-slate-800 text-slate-400 hover:border-slate-700'}`}>{label}</button>
                ))}
                <div className="w-full sm:w-auto sm:ml-auto flex items-center gap-2 mt-1 sm:mt-0">
                  <button onClick={() => exportPdf(filteredList, FILTER_LABEL[statusFilter])}
                    className="flex-1 sm:flex-none justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium border border-slate-700">
                    <FileDown size={16} /> PDF
                  </button>
                  <button onClick={() => setPaymentModal({})} className="flex-1 sm:flex-none justify-center bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium shadow-lg shadow-indigo-500/20">
                    <Plus size={16} /> Ödeme Ekle
                  </button>
                </div>
              </div>

              <div className={`${CARD} overflow-hidden`}>
                <div className="flex justify-between items-center p-6 border-b border-slate-800/50">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-bold text-white">
                      {grupluGorunum ? `Ödemeler (${grupla(filteredList).length})` : `Taksitler (${filteredList.length})`}
                    </h3>
                    <button onClick={() => setGrupluGorunum(v => !v)}
                      className="text-[11px] px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white">
                      {grupluGorunum ? 'Taksitleri ayrı göster' : 'Grupla'}
                    </button>
                  </div>
                  <span className="text-sm text-slate-400">Toplam: {money(filteredList.reduce((a, b) => a + Number(b.amount), 0))}</span>
                </div>
                <div className="p-2">
                  {filteredList.length === 0
                    ? <EmptyState icon={CreditCard} title="Sonuç yok" desc="Seçtiğin filtreye uyan bir ödeme bulunamadı." />
                    : grupluGorunum
                      ? grupla(filteredList).slice(0, visibleCount).map(({ ana, hepsi }) => (
                          <React.Fragment key={ana.payment_id}>
                            <PaymentRow item={ana} {...rowProps} adet={hepsi.length}
                              acik={acikGruplar.has(ana.payment_id)} onAcKapa={() => acKapa(ana.payment_id)} />
                            {acikGruplar.has(ana.payment_id) && hepsi.slice(1).map(o => (
                              <div key={o.id} className="sm:pl-10 border-l-2 border-slate-800 ml-4">
                                <PaymentRow item={o} {...rowProps} />
                              </div>
                            ))}
                          </React.Fragment>
                        ))
                      : filteredList.slice(0, visibleCount).map(p => <PaymentRow key={p.id} item={p} {...rowProps} />)}
                </div>
                {(grupluGorunum ? grupla(filteredList).length : filteredList.length) > visibleCount && (
                  <button onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                    className="w-full py-4 text-sm text-indigo-400 hover:bg-slate-800/40 border-t border-slate-800">
                    Daha fazla göster ({(grupluGorunum ? grupla(filteredList).length : filteredList.length) - visibleCount} kayıt)
                  </button>
                )}
              </div>

              <div className={`${CARD} overflow-hidden`}>
                <div className="p-6 border-b border-slate-800/50"><h3 className="text-lg font-bold text-white">Ödeme Tanımları</h3></div>
                <div className="divide-y divide-slate-800/60">
                  {payments.length === 0 && <EmptyState icon={Wallet} title="Henüz ödeme eklemedin" desc="Yukarıdaki Ödeme Ekle düğmesiyle başlayabilirsin." />}
                  {payments.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-4 gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-3 h-3 rounded-full shrink-0 ${p.categories?.color || 'bg-slate-500'}`} />
                        <div className="min-w-0">
                          <p className="text-white font-medium truncate flex items-center gap-2">
                            {p.is_pinned && <Star size={12} className="text-yellow-500 fill-yellow-500" />}{p.title}
                          </p>
                          <p className="text-xs text-slate-500 truncate">
                            {TYPE_LABEL[p.type]} · {p.categories?.name || 'Kategorisiz'}
                            {p.repeat_period ? ` · ${PERIODS.find(x => x.id === p.repeat_period)?.label}` : ''}
                            {p.is_auto_pay ? ' · Otomatik' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-slate-300 font-medium mr-1 text-sm whitespace-nowrap">{money(p.amount)}</span>
                        <button onClick={() => togglePin(p)} title="Sabitle"
                          className={`p-2 rounded-lg border border-slate-700 ${p.is_pinned ? 'bg-yellow-500/10 text-yellow-500' : 'bg-slate-800 text-slate-500 hover:text-yellow-500'}`}><Star size={16} /></button>
                        <button onClick={() => setPaymentModal({ editing: p })} title="Düzenle"
                          className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-indigo-400 border border-slate-700"><Pencil size={16} /></button>
                        <button onClick={() => deletePayment(p)} title="Sil"
                          className="p-2 rounded-lg bg-slate-800 text-slate-500 hover:bg-red-500/20 hover:text-red-400 border border-slate-700"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Kategoriler' && (
            <div className={`${CARD} p-6 mb-20`}>
              <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><PieChart className="text-indigo-500" /> Kategori Yönetimi</h2>
              <form onSubmit={handleAddCategory} className="flex flex-wrap gap-4 mb-8 p-5 bg-[#091316] rounded-xl border border-slate-800">
                <input placeholder="Kategori Adı" value={newCatName} onChange={e => setNewCatName(e.target.value)}
                  className="flex-1 min-w-[180px] bg-[#10222A] border border-slate-700 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500" />
                <div className="flex items-center gap-2 bg-[#10222A] border border-slate-700 rounded-xl px-4 py-3 overflow-x-auto max-w-full">
                  {Object.keys(HEX_COLORS).map(c => (
                    <button key={c} type="button" onClick={() => setNewCatColor(c)}
                      className={`w-6 h-6 rounded-full ${c} ${newCatColor === c ? 'ring-2 ring-white scale-110' : 'opacity-50 hover:opacity-100'} transition-all`} />
                  ))}
                </div>
                <button type="submit" disabled={!newCatName.trim()} className="w-full sm:w-auto justify-center bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2"><Plus size={18} /> Ekle</button>
              </form>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {categories.length === 0 && (
                  <div className="sm:col-span-2 lg:col-span-4">
                    <EmptyState icon={PieChart} title="Henüz kategori yok"
                      desc="Sık kullanılan altı kategoriyi tek tıkla oluştur, sonra dilediğini değiştir."
                      action={<button onClick={createStarterCategories} className="mt-5 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2"><Plus size={16} /> Başlangıç Kategorilerini Oluştur</button>} />
                  </div>
                )}
                {categories.map(c => {
                  const count = occurrences.filter(o => o.payments?.categories?.name === c.name).length;
                  return (
                    <div key={c.id} className="bg-[#091316] border border-slate-800 rounded-xl p-4 flex justify-between items-center group hover:border-slate-700">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-4 h-4 rounded-full shrink-0 ${c.color}`} />
                        <div className="min-w-0"><span className="text-white font-medium block truncate">{c.name}</span><span className="text-[11px] text-slate-500">{count} taksit</span></div>
                      </div>
                      <div className="flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => setCatModal(c)} className="text-slate-500 hover:text-indigo-400 bg-slate-900 p-1.5 rounded-lg"><Pencil size={14} /></button>
                        <button onClick={() => handleDeleteCategory(c.id)} className="text-slate-500 hover:text-red-400 bg-slate-900 p-1.5 rounded-lg"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'Abonelikler' && (() => {
            const subs = payments.filter(p => p.type === 'abonelik' || p.type === 'kredi_karti');
            const monthlyEq = subs.reduce((a, p) => {
              const per = PERIODS.find(x => x.id === (p.repeat_period || 'aylik')) || PERIODS[1];
              const perMonth = per.days ? (30 / per.days) : (1 / per.months);
              return a + Number(p.amount) * perMonth;
            }, 0);
            return (
              <div className="space-y-6 pb-20">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className={`${CARD} p-6`}><p className="text-slate-400 text-sm">Aktif Abonelik</p><p className="text-2xl font-bold text-white mt-1">{subs.length}</p></div>
                  <div className={`${CARD} p-6`}><p className="text-slate-400 text-sm">Aylık Karşılığı</p><p className="text-2xl font-bold text-white mt-1">{money(monthlyEq)}</p></div>
                  <div className={`${CARD} p-6`}><p className="text-slate-400 text-sm">Yıllık Tahmini</p><p className="text-2xl font-bold text-white mt-1">{money(monthlyEq * 12)}</p></div>
                </div>
                <div className={`${CARD} overflow-hidden`}>
                  <div className="p-6 border-b border-slate-800/50"><h3 className="text-lg font-bold text-white">Abonelikler & Ekstreler</h3></div>
                  <div className="divide-y divide-slate-800/60">
                    {subs.length === 0
                      ? <EmptyState icon={Zap} title="Abonelik yok" desc="Ödeme eklerken türü Abonelik seçersen buraya düşer." />
                      : subs.map(p => {
                        const next = occurrences.find(o => o.payment_id === p.id && o.status === 'bekliyor');
                        return (
                          <div key={p.id} className="flex items-center justify-between p-4 gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${p.categories?.color || 'bg-slate-500'} bg-opacity-20`}><Zap size={18} className="text-slate-200" /></div>
                              <div className="min-w-0">
                                <p className="text-white font-medium truncate">{p.title}</p>
                                <p className="text-xs text-slate-500 truncate">
                                  {PERIODS.find(x => x.id === (p.repeat_period || 'aylik'))?.label}
                                  {next ? ` · Sonraki: ${formatDate(next.due_date)}` : ' · Bekleyen taksit yok'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-slate-300 font-medium mr-2 hidden sm:block">{money(p.amount)}</span>
                              <button onClick={() => setPaymentModal({ editing: p })} className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-indigo-400 border border-slate-700"><Pencil size={16} /></button>
                              <button onClick={() => deletePayment(p)} className="p-2 rounded-lg bg-slate-800 text-slate-500 hover:bg-red-500/20 hover:text-red-400 border border-slate-700"><Trash2 size={16} /></button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            );
          })()}

          {activeTab === 'Birikim' && (
            <div className="space-y-6 pb-20">
              {/* Üst özet */}
              <div className={`${CARD} p-6 relative overflow-hidden`}>
                <div aria-hidden className="absolute inset-0 pointer-events-none opacity-[0.06]"
                  style={{ backgroundImage: "repeating-linear-gradient(115deg, #c7dade 0 1px, transparent 1px 40px)" }} />
                <div className="relative z-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                  <div>
                    <p className="text-slate-400 text-sm mb-1 flex items-center gap-2"><PiggyBank size={16} className="text-purple-400" /> Toplam birikimin</p>
                    <p className="text-4xl font-bold text-white tracking-tight">{money(toplamBirikim)}</p>
                    <p className="text-slate-500 text-xs mt-2">
                      {hedeflerDolu.length} hedef · bu ay {money(butce.birikim)} aktardın
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {hedeflerDolu.length > 0 && (
                      <button onClick={() => setTransferModal({})}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2">
                        <ArrowDownLeft size={16} /> Para Aktar
                      </button>
                    )}
                    <button onClick={() => setGoalModal({})}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2">
                      <Plus size={16} /> Yeni Hedef
                    </button>
                  </div>
                </div>
              </div>

              {/* Hedef kartları */}
              {hedeflerDolu.length === 0 ? (
                <div className={`${CARD}`}>
                  <EmptyState icon={Target} title="Henüz birikim hedefin yok"
                    desc="Bir hedef oluştur, sonra her ay bütçenden buraya para aktar. Ne kadar yaklaştığını halka üzerinde görürsün."
                    action={<button onClick={() => setGoalModal({})} className="mt-5 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2"><Plus size={16} /> İlk Hedefini Oluştur</button>} />
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {hedeflerDolu.map(h => {
                    const renk = HEX_COLORS[h.color] || '#6366f1';
                    const kalan = h.target_amount ? Math.max(0, Number(h.target_amount) - h.biriken) : null;
                    const gunKaldi = h.target_date ? dayDiff(h.target_date) : null;
                    const aylikGerek = (kalan && gunKaldi && !gunKaldi.isOverdue && gunKaldi.raw > 0)
                      ? kalan / Math.max(1, gunKaldi.raw / 30) : null;
                    return (
                      <div key={h.id} className={`${CARD} p-6 group`}>
                        <div className="flex items-start gap-5">
                          <div className="relative">
                            <Halka yuzde={h.target_amount ? h.yuzde : 100} renk={h.tamam ? '#22c55e' : renk} />
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              {h.target_amount
                                ? <><span className="text-lg font-bold text-white">{Math.round(h.yuzde)}%</span>{h.tamam && <Sparkles size={12} className="text-emerald-400 mt-0.5" />}</>
                                : <PiggyBank size={26} style={{ color: renk }} />}
                            </div>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h3 className="text-white font-bold truncate">{h.title}</h3>
                                <p className="text-2xl font-bold text-white mt-1">{money(h.biriken)}</p>
                                {h.target_amount
                                  ? <p className="text-xs text-slate-400 mt-0.5">hedef {money(h.target_amount)}</p>
                                  : <p className="text-xs text-slate-500 mt-0.5">hedefsiz kumbara</p>}
                              </div>
                              <div className="flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-all shrink-0">
                                <button onClick={() => setGoalModal({ editing: h })} className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-indigo-400 border border-slate-700"><Pencil size={14} /></button>
                                <button onClick={() => deleteGoal(h)} className="p-1.5 rounded-lg bg-slate-800 text-slate-500 hover:text-red-400 border border-slate-700"><Trash2 size={14} /></button>
                              </div>
                            </div>

                            {h.tamam && (
                              <p className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2.5 py-1.5 mt-3 inline-flex items-center gap-1.5">
                                <Sparkles size={12} /> Hedefe ulaştın, tebrikler!
                              </p>
                            )}
                            {!h.tamam && kalan !== null && (
                              <p className="text-xs text-slate-400 mt-3">
                                {money(kalan)} kaldı
                                {aylikGerek && <span className="text-slate-500"> · ayda {money(aylikGerek)} aktarırsan yetişir</span>}
                              </p>
                            )}
                            {h.target_date && (
                              <p className="text-[11px] text-slate-500 mt-1">
                                {gunKaldi.isOverdue ? `Hedef tarihi ${gunKaldi.days} gün geçti` : `${formatDate(h.target_date)} · ${gunKaldi.days} gün var`}
                              </p>
                            )}

                            <button onClick={() => setTransferModal({ goal: h })}
                              className="mt-4 w-full sm:w-auto bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 px-4 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2">
                              <PiggyBank size={14} /> Para aktar / çek
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Son hareketler */}
              {savingsTx.length > 0 && (
                <div className={`${CARD} overflow-hidden`}>
                  <div className="p-6 border-b border-slate-800/50"><h3 className="text-lg font-bold text-white">Son Hareketler</h3></div>
                  <div className="divide-y divide-slate-800/60">
                    {savingsTx.slice(0, 10).map(t => {
                      const h = goals.find(g => g.id === t.goal_id);
                      const arti = Number(t.amount) > 0;
                      return (
                        <div key={t.id} className="flex items-center justify-between p-4 gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${arti ? 'bg-emerald-500/15 text-emerald-400' : 'bg-orange-500/15 text-orange-400'}`}>
                              {arti ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-white text-sm font-medium truncate">{h?.title || 'Silinmiş hedef'}</p>
                              <p className="text-[11px] text-slate-500 truncate">{formatDate(t.moved_at)}{t.note ? ` · ${t.note}` : ''}</p>
                            </div>
                          </div>
                          <span className={`font-semibold text-sm shrink-0 ${arti ? 'text-emerald-400' : 'text-orange-400'}`}>
                            {arti ? '+' : '−'}{money(Math.abs(Number(t.amount)))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'Ayarlar' && (
            <div className="space-y-6 pb-20 max-w-2xl mx-auto w-full">
              <ProfilKarti user={session.user} showToast={showToast}
                onSaved={async () => { const { data } = await supabase.auth.getSession(); setSession(data.session); }} />
              <div className={`${CARD} p-6`}>
                <h3 className="text-lg font-bold text-white mb-4">Hesap</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between border-b border-slate-800 pb-3"><span className="text-slate-400">E-posta</span><span className="text-white">{session.user.email}</span></div>
                  <div className="flex justify-between border-b border-slate-800 pb-3"><span className="text-slate-400">Kullanıcı ID</span><span className="text-slate-500 text-xs font-mono truncate ml-4">{session.user.id}</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">Kayıt tarihi</span><span className="text-white">{formatDate(session.user.created_at)}</span></div>
                </div>
              </div>
              <div className={`${CARD} p-6`}>
                <h3 className="text-lg font-bold text-white mb-4">Özet</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div><p className="text-2xl font-bold text-white">{payments.length}</p><p className="text-xs text-slate-500 mt-1">Ödeme</p></div>
                  <div><p className="text-2xl font-bold text-white">{occurrences.length}</p><p className="text-xs text-slate-500 mt-1">Taksit</p></div>
                  <div><p className="text-2xl font-bold text-white">{categories.length}</p><p className="text-xs text-slate-500 mt-1">Kategori</p></div>
                </div>
                <div className="mt-6 pt-6 border-t border-slate-800 space-y-3 text-sm">
                  {(() => {
                    const yil = new Date().getFullYear();
                    const buYil = occurrences.filter(o => o.status === 'odendi' && new Date(o.due_date).getFullYear() === yil);
                    const toplam = buYil.reduce((a, b) => a + Number(b.amount), 0);
                    const gecenAy = occurrences.filter(o => {
                      const d = new Date(o.due_date), g = addMonths(new Date(), -1);
                      return o.status === 'odendi' && d.getMonth() === g.getMonth() && d.getFullYear() === g.getFullYear();
                    }).reduce((a, b) => a + Number(b.amount), 0);
                    return (<>
                      <div className="flex justify-between"><span className="text-slate-400">{yil} yılında ödenen</span><span className="text-emerald-400 font-medium">{money(toplam)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Geçen ay ödenen</span><span className="text-white font-medium">{money(gecenAy)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-400">Ödenen taksit sayısı</span><span className="text-white font-medium">{buYil.length}</span></div>
                    </>);
                  })()}
                </div>
              </div>

              <div className={`${CARD} p-6`}>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2"><TrendingUp size={18} className="text-emerald-400" /> Gelirler</h3>
                  <button onClick={() => setIncomeModal(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5"><Plus size={14} /> Ekle</button>
                </div>
                {incomes.length === 0
                  ? <p className="text-slate-500 text-sm">Henüz gelir yok. Maaşını eklersen ana sayfada elinde kalan parayı görürsün.</p>
                  : <div className="space-y-2">
                      {incomes.map(g => (
                        <div key={g.id} className="flex items-center justify-between bg-[#091316] border border-slate-800 rounded-xl p-3">
                          <div className="min-w-0">
                            <p className="text-white font-medium text-sm truncate">{g.title}</p>
                            <p className="text-[11px] text-slate-500">{g.is_recurring ? 'Her ay tekrar eder' : formatDate(g.start_date)}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-emerald-400 font-semibold text-sm">{money(g.amount)}</span>
                            <button onClick={() => deleteIncome(g)} className="p-1.5 rounded-lg bg-slate-800 text-slate-500 hover:text-red-400 border border-slate-700"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between pt-3 mt-1 border-t border-slate-800 text-sm">
                        <span className="text-slate-400">Aylık toplam</span>
                        <span className="text-emerald-400 font-bold">{money(butce.gelir)}</span>
                      </div>
                    </div>}
              </div>

              <div className={`${CARD} p-6 space-y-3`}>
                <button onClick={() => exportPdf(occurrences, 'Tüm kayıtlar')} className="w-full flex items-center gap-2 justify-center py-3 rounded-xl bg-indigo-600/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-600/20 text-sm font-medium"><FileDown size={16} /> Tümünü PDF Olarak Dışa Aktar</button>
                <button onClick={() => exportPdf(occurrences.filter(o => { const d = new Date(o.due_date); const t = new Date(); return d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear(); }), 'Bu ay')} className="w-full flex items-center gap-2 justify-center py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium"><FileDown size={16} /> Bu Ayın Raporu (PDF)</button>
                <button onClick={fetchAll} className="w-full flex items-center gap-2 justify-center py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium"><RotateCcw size={16} /> Verileri Yenile</button>
                <button onClick={() => supabase.auth.signOut()} className="w-full flex items-center gap-2 justify-center py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 text-sm font-medium"><LogOut size={16} /> Çıkış Yap</button>
              </div>
            </div>
          )}
        </div>
      </main>

      {paymentModal && (
        <PaymentModal onClose={() => setPaymentModal(null)} user={session.user} categories={categories}
          editing={paymentModal.editing} occurrences={occurrences}
          onSuccess={() => { const wasEdit = !!paymentModal.editing; setPaymentModal(null); fetchAll(); showToast(wasEdit ? 'Ödeme güncellendi.' : 'Ödeme eklendi.'); }} />
      )}
      {occModal && <OccurrenceModal item={occModal} onClose={() => setOccModal(null)} onSaved={() => { setOccModal(null); fetchAll(); }} showToast={showToast} />}
      {goalModal && <GoalModal user={session.user} editing={goalModal.editing} onClose={() => setGoalModal(null)}
        onSaved={() => { setGoalModal(null); fetchAll(); }} showToast={showToast} />}
      {transferModal && hedeflerDolu.length > 0 && <TransferModal user={session.user} goal={transferModal.goal}
        hedefler={hedeflerDolu} kalanBakiye={hesap.bakiye}
        onClose={() => setTransferModal(null)} onSaved={() => { setTransferModal(null); fetchAll(); }} showToast={showToast} />}
      {incomeModal && <IncomeModal user={session.user} onClose={() => setIncomeModal(false)}
        onSaved={() => { setIncomeModal(false); fetchAll(); }} showToast={showToast} />}
      {paraModal && <IncomeModal tekSeferlik user={session.user} onClose={() => setParaModal(false)}
        onSaved={() => { setParaModal(false); fetchAll(); }} showToast={showToast} />}
      {catModal && <CategoryModal cat={catModal} onClose={() => setCatModal(null)} onSaved={() => { setCatModal(null); fetchAll(); }} showToast={showToast} />}
      <Toast toast={toast} />
    </div>
  );
}
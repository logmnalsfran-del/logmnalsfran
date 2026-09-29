// أدوات التنسيق والتواريخ (كل التواريخ نصوص ISO محلية: YYYY-MM-DD، والأشهر YYYY-MM)

export const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const int = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export const fmt = (n) => num.format(Number(n) || 0);
export const fmtInt = (n) => int.format(Math.round(Number(n) || 0));
// عزل الرقم باتجاه LTR حتى تظهر علامة السالب في مكانها داخل النص العربي
export const money = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `⁦${v < 0 ? '-' : ''}${fmt(Math.abs(v))}⁩ ر.س`;
};
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// UUID متوافق مع مفاتيح Supabase
export function uid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const pad = (n) => String(n).padStart(2, '0');
export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const today = () => toISO(new Date());
export const thisMonth = () => today().slice(0, 7);
export const monthOf = (date) => (date || '').slice(0, 7);

export function monthLabel(m) {
  if (!m) return '';
  const [y, mo] = m.split('-').map(Number);
  return `${MONTHS_AR[mo - 1]} ${y}`;
}
export function addMonths(m, n) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function daysInMonth(m) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo, 0).getDate();
}
export const monthStart = (m) => `${m}-01`;
export const monthEnd = (m) => `${m}-${pad(daysInMonth(m))}`;
export function monthDiff(a, b) {
  // عدد الأشهر من a إلى b
  const [y1, m1] = a.split('-').map(Number);
  const [y2, m2] = b.split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}
export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return toISO(new Date(y, m - 1, d + n));
}
export function daysUntil(date) {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [ty, tm, td] = today().split('-').map(Number);
  return Math.round((new Date(y, m - 1, d) - new Date(ty, tm - 1, td)) / 86400000);
}
export function fmtDate(date) {
  if (!date) return '—';
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}
export function weekdayAr(date) {
  const [y, m, d] = date.split('-').map(Number);
  return ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'][new Date(y, m - 1, d).getDay()];
}
export function monthsBack(count, from = thisMonth()) {
  return Array.from({ length: count }, (_, i) => addMonths(from, -i));
}

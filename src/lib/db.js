// طبقة البيانات: كل القراءة والكتابة تمر من هنا فقط.
// - الوضع المحلي (بدون متغيرات Supabase): localStorage + بيانات تجريبية.
// - الوضع السحابي: تُحمَّل البيانات من Supabase عند الدخول، وتُطبَّق كل كتابة فوراً على الواجهة
//   ثم تُرسل للخادم بالترتيب؛ عند فشل أي عملية تُعرض الرسالة ويُعاد تحميل البيانات من الخادم.
import { useSyncExternalStore } from 'react';
import { uid } from './format';
import { buildSeed } from './seed';
import { ROLES } from './constants';
import { isRemote, supabase } from './supabase';
import {
  loadAll, remoteInsert, remoteInsertMany, remoteUpdate, remoteDelete, remoteAudit, remoteSettings, fetchProfile, translateError,
} from './remote';

const KEY = 'logistics-app:data:v1';
const SESSION_KEY = 'logistics-app:session';

export const COLLECTIONS = [
  'employees', 'vehicles', 'custody', 'maintenance', 'schedules', 'fuel', 'incidents',
  'shipments', 'adjustments', 'payrollRuns', 'expenseCategories', 'expenses', 'recurring',
  'revenues', 'reserve', 'closedMonths', 'audit',
];
const COMP_FIELDS = ['baseSalary', 'allowances', 'iban', 'incentiveOverride'];

function emptyState() {
  const s = Object.fromEntries(COLLECTIONS.map((c) => [c, []]));
  s.settings = { companyName: 'الشركة اللوجستية', alertDays: 30, incentiveRules: [{ id: 'default', from: '2000-01', threshold: 1000, rate: 2 }], revenuePerShipment: 0, depreciation: { method: 'straight_line', fixedAmount: 0 } };
  return s;
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const data = JSON.parse(raw);
      COLLECTIONS.forEach((c) => { if (!Array.isArray(data[c])) data[c] = []; });
      return data;
    }
  } catch { /* تخزين غير متاح أو تالف: نبدأ ببيانات تجريبية */ }
  return buildSeed();
}

let state = isRemote ? emptyState() : loadLocal();
const listeners = new Set();

function persistLocal() {
  if (isRemote) return;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* تجاهل */ }
}
// حفظ البيانات التجريبية فور توليدها حتى تبقى المعرّفات ثابتة بين مرات فتح الصفحة
persistLocal();

function commit(next) {
  state = next;
  persistLocal();
  listeners.forEach((l) => l());
}
const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };

export const getState = () => state;
export function useDb() {
  return useSyncExternalStore(subscribe, getState);
}

// ---------- حالة التحميل (الوضع السحابي) ----------
let status = { phase: isRemote ? 'auth' : 'ready', error: null, syncing: 0 };
const statusListeners = new Set();
function setStatus(patch) {
  status = { ...status, ...patch };
  statusListeners.forEach((l) => l());
}
export function useStatus() {
  return useSyncExternalStore((l) => { statusListeners.add(l); return () => statusListeners.delete(l); }, () => status);
}

// ---------- الجلسة ----------
let session = isRemote ? null : (() => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch { return null; }
})();
const sessionListeners = new Set();
function setSession(s) {
  session = s;
  sessionListeners.forEach((l) => l());
}
export function useSession() {
  return useSyncExternalStore(
    (l) => { sessionListeners.add(l); return () => sessionListeners.delete(l); },
    () => session,
  );
}

// الوضع المحلي: دخول تجريبي باختيار الدور
export function signIn(role) {
  const s = { role, name: ROLES[role].label, at: new Date().toISOString() };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* تجاهل */ }
  setSession(s);
}

// الوضع السحابي: البريد وكلمة المرور
export async function signInWithPassword(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw new Error(/invalid login/i.test(error.message) ? 'البريد أو كلمة المرور غير صحيحة' : translateError(error));
}

export async function signOut() {
  if (isRemote) {
    await supabase.auth.signOut();
    return;
  }
  try { localStorage.removeItem(SESSION_KEY); } catch { /* تجاهل */ }
  setSession(null);
}

async function onAuth(authSession) {
  if (!authSession) {
    state = emptyState();
    listeners.forEach((l) => l());
    setSession(null);
    setStatus({ phase: 'login', error: null });
    return;
  }
  if (session?.userId === authSession.user.id && status.phase === 'ready') return;
  setStatus({ phase: 'loading', error: null });
  try {
    const profile = await fetchProfile(authSession.user.id);
    const role = profile?.active ? profile.role : 'pending';
    const s = {
      userId: authSession.user.id, email: authSession.user.email, role,
      name: profile?.full_name || ROLES[role]?.label || authSession.user.email,
    };
    if (role === 'pending') {
      setSession(s);
      setStatus({ phase: 'pending' });
      return;
    }
    const data = await loadAll(role);
    state = { ...emptyState(), ...data };
    listeners.forEach((l) => l());
    setSession(s);
    setStatus({ phase: 'ready' });
  } catch (e) {
    setStatus({ phase: 'error', error: e.message });
  }
}

if (isRemote) {
  supabase.auth.getSession().then(({ data }) => onAuth(data.session));
  supabase.auth.onAuthStateChange((event, s) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setTimeout(() => onAuth(s), 0);
  });
}

export async function reload() {
  if (!isRemote || !session) return;
  try {
    const data = await loadAll(session.role);
    commit({ ...emptyState(), ...data });
  } catch (e) {
    alert(`تعذّر تحديث البيانات: ${e.message}`);
  }
}

// ---------- مزامنة الكتابة مع الخادم (بالترتيب) ----------
let queue = Promise.resolve();
function sync(task) {
  if (!isRemote) return;
  setStatus({ syncing: status.syncing + 1 });
  queue = queue
    .then(task)
    .catch((e) => {
      alert(`لم تُحفظ العملية على الخادم: ${e.message}\nسيُعاد تحميل البيانات.`);
      return reload();
    })
    .finally(() => setStatus({ syncing: status.syncing - 1 }));
}
export const whenSynced = () => queue;

// الحقول المالية للموظف لا تُرسل إلا من المالك
function stripForRole(col, obj) {
  if (col !== 'employees' || session?.role === 'owner') return obj;
  const copy = { ...obj };
  COMP_FIELDS.forEach((k) => delete copy[k]);
  return copy;
}

// ---------- سجل التدقيق ----------
function auditEntry(action, entity, details) {
  return { id: uid(), at: new Date().toISOString(), user: session?.name || 'النظام', action, entity, details: details || '' };
}
function withAudit(next, entry) {
  if (!entry) return next;
  if (isRemote) sync(() => remoteAudit(entry, session?.userId));
  return { ...next, audit: [entry, ...state.audit].slice(0, 2000) };
}
export function log(action, entity, details) {
  commit(withAudit(state, auditEntry(action, entity, details)));
}

// ---------- عمليات CRUD ----------
export function insert(col, obj, auditText) {
  const row = { id: uid(), createdAt: new Date().toISOString(), ...obj };
  commit(withAudit({ ...state, [col]: [...state[col], row] }, auditText && auditEntry('إضافة', col, auditText)));
  sync(() => remoteInsert(col, stripForRole(col, row)));
  return row;
}
export function update(col, id, patch, auditText) {
  const nextRows = state[col].map((r) => (r.id === id ? { ...r, ...patch } : r));
  const full = nextRows.find((r) => r.id === id);
  commit(withAudit({ ...state, [col]: nextRows }, auditText && auditEntry('تعديل', col, auditText)));
  sync(() => remoteUpdate(col, id, stripForRole(col, patch), full));
}
export function remove(col, id, auditText) {
  commit(withAudit({ ...state, [col]: state[col].filter((r) => r.id !== id) }, auditText && auditEntry('حذف', col, auditText)));
  sync(() => remoteDelete(col, [id]));
}
// استبدال عدة صفوف دفعة واحدة (مثل حفظ شحنات يوم كامل)
export function replaceWhere(col, predicate, rows, auditText) {
  const removed = state[col].filter(predicate).map((r) => r.id);
  const kept = state[col].filter((r) => !predicate(r));
  const added = rows.map((r) => ({ id: uid(), createdAt: new Date().toISOString(), ...r }));
  commit(withAudit({ ...state, [col]: [...kept, ...added] }, auditText && auditEntry('تعديل', col, auditText)));
  sync(async () => {
    await remoteDelete(col, removed);
    if (added.length) await remoteInsertMany(col, added);
  });
}

export function updateSettings(patch, auditText) {
  const rulesBefore = state.settings.incentiveRules || [];
  commit(withAudit({ ...state, settings: { ...state.settings, ...patch } }, auditText && auditEntry('إعدادات', 'settings', auditText)));
  sync(() => remoteSettings(patch, rulesBefore));
}

// رفع قراءة عداد السيارة إن كانت القراءة الجديدة أعلى
export function bumpOdometer(vehicleId, reading) {
  const v = state.vehicles.find((x) => x.id === vehicleId);
  const km = Number(reading) || 0;
  if (v && km > (Number(v.odometer) || 0)) update('vehicles', vehicleId, { odometer: km });
}

// ---------- النسخ الاحتياطي والاستيراد ----------
export function resetDemo() {
  if (isRemote) return;
  commit(buildSeed());
}
export function exportBackup() {
  return JSON.stringify(state, null, 2);
}

// ترتيب الإدراج يراعي العلاقات؛ الأشهر المقفلة آخراً لأن القاعدة تمنع الإضافة في شهر مقفل
const IMPORT_ORDER = ['employees', 'vehicles', 'custody', 'maintenance', 'schedules', 'fuel', 'incidents', 'shipments',
  'adjustments', 'payrollRuns', 'expenses', 'recurring', 'revenues', 'reserve', 'closedMonths'];
const FK_FIELDS = ['employeeId', 'vehicleId', 'categoryId'];

export function isDatabaseEmpty() {
  return ['employees', 'vehicles', 'shipments', 'expenses'].every((c) => state[c].length === 0);
}

export async function importBackup(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data.settings || !Array.isArray(data.employees)) throw new Error('ملف غير صالح');
  COLLECTIONS.forEach((c) => { if (!Array.isArray(data[c])) data[c] = []; });
  if (!isRemote) {
    commit(data);
    return;
  }
  if (!isDatabaseEmpty()) throw new Error('قاعدة البيانات تحتوي بيانات؛ الاستيراد متاح فقط لقاعدة فارغة');
  await queue;

  // معرّفات جديدة (UUID) لكل السجلات مع تحديث العلاقات
  const map = new Map();
  const newId = (old) => { if (!old) return old; if (!map.has(old)) map.set(old, uid()); return map.get(old); };
  // الفئات: نربطها بالفئات الموجودة بنفس الاسم أو ننشئها
  const catRows = [];
  data.expenseCategories.forEach((c) => {
    const existing = state.expenseCategories.find((x) => x.name === c.name);
    if (existing) map.set(c.id, existing.id);
    else catRows.push({ ...c, id: newId(c.id) });
  });
  if (catRows.length) await remoteInsertMany('expenseCategories', catRows);

  for (const col of IMPORT_ORDER) {
    const rows = data[col].map((r) => {
      const { createdAt, ...rest } = r;
      const out = { ...rest, id: newId(r.id), ...(createdAt ? { createdAt } : {}) };
      FK_FIELDS.forEach((f) => { if (out[f]) out[f] = newId(out[f]); });
      if (col === 'payrollRuns') out.rows = r.rows.map((x) => ({ ...x, employeeId: newId(x.employeeId) }));
      return out;
    });
    if (rows.length) await remoteInsertMany(col, rows);
  }
  const s = data.settings;
  await remoteSettings({
    companyName: s.companyName, alertDays: s.alertDays, revenuePerShipment: s.revenuePerShipment || 0,
    depreciation: s.depreciation || { method: 'straight_line', fixedAmount: 0 },
    incentiveRules: (s.incentiveRules || []).map((r) => ({ ...r, id: uid() })),
  }, state.settings.incentiveRules.filter((r) => r.id !== 'default'));
  await remoteAudit(auditEntry('استيراد', 'البيانات', `استيراد ${data.employees.length} موظف و${data.vehicles.length} سيارة`), session?.userId);
  await reload();
}

export async function loadDemoIntoDatabase() {
  await importBackup(buildSeed());
}

// الربط بين مجموعات التطبيق (camelCase) وجداول Supabase (snake_case)
import { supabase } from './supabase';

export const TABLES = {
  employees: 'employees',
  vehicles: 'vehicles',
  custody: 'custody',
  maintenance: 'maintenance',
  schedules: 'schedules',
  fuel: 'fuel',
  incidents: 'incidents',
  shipments: 'shipments',
  adjustments: 'adjustments',
  payrollRuns: 'payroll_runs',
  expenseCategories: 'expense_categories',
  expenses: 'expenses',
  recurring: 'recurring_expenses',
  revenues: 'revenues',
  reserve: 'reserve_transactions',
  closedMonths: 'closed_months',
  audit: 'audit_log',
  lookups: 'lookups',
};

// حقول الموظف المالية تُحفظ في جدول employee_compensation (للمالك فقط)
const COMP_FIELDS = ['baseSalary', 'allowances', 'iban', 'incentiveOverride'];
// أسماء حقول تختلف عن التحويل الآلي
const RENAME = { audit: { user: 'user_name' } };

const toSnake = (k) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (k) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

export function toRow(col, obj) {
  const row = {};
  const rename = RENAME[col] || {};
  Object.entries(obj).forEach(([k, v]) => {
    if (col === 'employees' && COMP_FIELDS.includes(k)) return;
    if (k === 'createdAt' && !v) return;
    // النص الفارغ يُحفظ null (أعمدة التاريخ والأرقام لا تقبل '')
    row[rename[k] || toSnake(k)] = v === '' || v === undefined ? null : v;
  });
  return row;
}

export function fromRow(col, row) {
  const obj = {};
  const rename = Object.fromEntries(Object.entries(RENAME[col] || {}).map(([a, b]) => [b, a]));
  Object.entries(row).forEach(([k, v]) => { obj[rename[k] || toCamel(k)] = v; });
  return obj;
}

const compRow = (id, obj) => ({
  employee_id: id,
  base_salary: Number(obj.baseSalary) || 0,
  allowances: Number(obj.allowances) || 0,
  iban: obj.iban || null,
  incentive_override: obj.incentiveOverride || null,
  updated_at: new Date().toISOString(),
});

function check({ error }) {
  if (error) throw new Error(translateError(error));
}

export function translateError(error) {
  const m = error?.message || String(error);
  if (/row-level security|permission denied/i.test(m)) return 'ليست لديك صلاحية لهذه العملية';
  if (/duplicate key/i.test(m)) return 'القيمة مكررة (موجودة مسبقاً)';
  if (/foreign key/i.test(m)) return 'السجل مرتبط ببيانات أخرى ولا يمكن حذفه';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'تعذّر الاتصال بالخادم — تحقق من الإنترنت';
  return m;
}

// جلب جدول كامل على دفعات (حد Supabase الافتراضي 1000 صف للطلب)
async function fetchAll(table, order = 'created_at') {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order(order, { ascending: true }).range(from, from + 999);
    if (error) {
      // جداول غير مسموحة لهذا الدور تُعامل كفارغة
      if (/row-level security|permission denied/i.test(error.message)) return [];
      // جدول لم يُنشأ بعد (ترحيل لم يُشغَّل): لا نعطّل التطبيق
      if (error.code === 'PGRST205' || error.code === '42P01') return [];
      throw new Error(translateError(error));
    }
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

export async function loadAll(role) {
  const data = {};
  const entries = Object.entries(TABLES).filter(([col]) => col !== 'audit' || role === 'owner');
  const results = await Promise.all(entries.map(([, table]) => fetchAll(table)));
  entries.forEach(([col], i) => { data[col] = results[i].map((r) => fromRow(col, r)); });
  if (!data.audit) data.audit = [];
  data.audit.reverse();

  if (role === 'owner') {
    const comp = await fetchAll('employee_compensation', 'updated_at');
    const byId = Object.fromEntries(comp.map((c) => [c.employee_id, c]));
    data.employees = data.employees.map((e) => {
      const c = byId[e.id];
      return { ...e, baseSalary: Number(c?.base_salary) || 0, allowances: Number(c?.allowances) || 0, iban: c?.iban || '', incentiveOverride: c?.incentive_override || null };
    });
  }

  const [{ data: s, error: se }, rules] = await Promise.all([
    supabase.from('settings').select('*').eq('id', 1).maybeSingle(),
    fetchAll('incentive_rules', 'from_month'),
  ]);
  if (se) throw new Error(translateError(se));
  data.settings = {
    companyName: s?.company_name || 'الشركة اللوجستية',
    alertDays: s?.alert_days || 30,
    revenuePerShipment: Number(s?.revenue_per_shipment) || 0,
    defaultRecoveryPct: Number(s?.default_recovery_pct) || 0,
    capitalAmount: Number(s?.capital_amount) || 0,
    incentiveRules: rules.map((r) => ({ id: r.id, from: r.from_month, threshold: r.threshold, rate: Number(r.rate), note: r.note || '' })),
  };
  // الأرقام من نوع numeric تصل أرقاماً؛ نحوّل احتياطياً ما قد يصل نصاً
  return data;
}

export async function remoteInsert(col, obj) {
  check(await supabase.from(TABLES[col]).insert(toRow(col, obj)));
  if (col === 'employees' && 'baseSalary' in obj) check(await supabase.from('employee_compensation').upsert(compRow(obj.id, obj)));
}

export async function remoteInsertMany(col, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    check(await supabase.from(TABLES[col]).insert(rows.slice(i, i + 500).map((r) => toRow(col, r))));
  }
  if (col === 'employees') {
    const comp = rows.filter((r) => 'baseSalary' in r).map((r) => compRow(r.id, r));
    if (comp.length) check(await supabase.from('employee_compensation').upsert(comp));
  }
}

export async function remoteUpdate(col, id, patch, full) {
  const row = toRow(col, patch);
  delete row.id;
  if (Object.keys(row).length) check(await supabase.from(TABLES[col]).update(row).eq('id', id));
  if (col === 'employees' && COMP_FIELDS.some((k) => k in patch)) check(await supabase.from('employee_compensation').upsert(compRow(id, full)));
}

export async function remoteDelete(col, ids) {
  if (!ids.length) return;
  check(await supabase.from(TABLES[col]).delete().in('id', ids));
}

export async function remoteAudit(entry, userId) {
  const { error } = await supabase.from('audit_log').insert({ ...toRow('audit', entry), user_id: userId });
  if (error) console.warn('audit', error.message);
}

export async function remoteSettings(patch, rulesBefore) {
  const row = {};
  if ('companyName' in patch) row.company_name = patch.companyName;
  if ('alertDays' in patch) row.alert_days = patch.alertDays;
  if ('revenuePerShipment' in patch) row.revenue_per_shipment = patch.revenuePerShipment;
  if ('defaultRecoveryPct' in patch) row.default_recovery_pct = patch.defaultRecoveryPct;
  if ('capitalAmount' in patch) row.capital_amount = patch.capitalAmount;
  if (Object.keys(row).length) check(await supabase.from('settings').update({ ...row, updated_at: new Date().toISOString() }).eq('id', 1));
  if (patch.incentiveRules) {
    const next = patch.incentiveRules;
    const removed = rulesBefore.filter((r) => !next.some((n) => n.id === r.id)).map((r) => r.id);
    if (removed.length) check(await supabase.from('incentive_rules').delete().in('id', removed));
    const added = next.filter((n) => !rulesBefore.some((r) => r.id === n.id));
    if (added.length) check(await supabase.from('incentive_rules').insert(added.map((r) => ({ id: r.id, from_month: r.from, threshold: r.threshold, rate: r.rate, note: r.note || null }))));
  }
}

// ---------- المستخدمون ----------
export async function fetchProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw new Error(translateError(error));
  return data;
}
export async function listProfiles() {
  const { data, error } = await supabase.from('profiles').select('*').order('created_at');
  if (error) throw new Error(translateError(error));
  return data;
}
export async function updateProfile(id, patch) {
  check(await supabase.from('profiles').update(patch).eq('id', id));
}

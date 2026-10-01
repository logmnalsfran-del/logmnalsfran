// منطق الأعمال: دوال نقية تعمل على لقطة البيانات (state) ولا تكتب شيئاً.
import {
  monthOf, monthStart, monthEnd, monthDiff, addDays, daysUntil, round2, addMonths,
} from './format';
import { SYSTEM_CATEGORIES } from './constants';
import { entriesOf, shipmentRoles } from './lookups';

// ---------- الإقفال ----------
export const isClosed = (db, month) => db.closedMonths.some((c) => c.month === month);
export const payrollRun = (db, month) => db.payrollRuns.find((r) => r.month === month);

// ---------- الحافز ----------
// القاعدة السارية لشهر معيّن = آخر قاعدة بدأ سريانها في هذا الشهر أو قبله
export function incentiveRuleFor(db, month) {
  const rules = [...(db.settings.incentiveRules || [])].sort((a, b) => a.from.localeCompare(b.from));
  let rule = rules[0] || { threshold: 1000, rate: 2 };
  rules.forEach((r) => { if (r.from <= month) rule = r; });
  return { threshold: Number(rule.threshold), rate: Number(rule.rate) };
}
export function ruleForEmployee(db, emp, month) {
  const o = emp.incentiveOverride;
  if (o && o.enabled) return { threshold: Number(o.threshold), rate: Number(o.rate), custom: true };
  return { ...incentiveRuleFor(db, month), custom: false };
}

// ---------- الشحنات ----------
export function shipmentsInMonth(db, month) {
  return db.shipments.filter((s) => monthOf(s.date) === month);
}
export function shipmentsByEmployee(db, month) {
  const map = {};
  shipmentsInMonth(db, month).forEach((s) => { map[s.employeeId] = (map[s.employeeId] || 0) + Number(s.count || 0); });
  return map;
}

// ---------- الموظفون ----------
export function employedInMonth(emp, month) {
  if (emp.hireDate && emp.hireDate > monthEnd(month)) return false;
  if (emp.terminationDate && emp.terminationDate < monthStart(month)) return false;
  if (emp.status === 'terminated' && !emp.terminationDate) return false;
  return true;
}
export function driversOf(db) {
  const roles = shipmentRoles(db);
  return db.employees.filter((e) => roles.has(e.role));
}
export const activeDrivers = (db) => driversOf(db).filter((e) => e.status !== 'terminated');

export function currentCustody(db, vehicleId) {
  return db.custody.find((c) => c.vehicleId === vehicleId && !c.toDate);
}
export function custodyOfEmployee(db, employeeId) {
  return db.custody.find((c) => c.employeeId === employeeId && !c.toDate);
}

// ---------- الرواتب ----------
// لا يوجد تناسب ولا حد أدنى (قرار صاحب المصلحة): الراتب كامل لكل من كان على رأس العمل في الشهر
export function computePayroll(db, month) {
  const counts = shipmentsByEmployee(db, month);
  const roles = shipmentRoles(db);
  const rows = db.employees
    .filter((e) => employedInMonth(e, month))
    .map((e) => {
      const base = Number(e.baseSalary) || 0;
      const allowances = Number(e.allowances) || 0;
      let shipments = 0; let threshold = 0; let rate = 0; let extra = 0; let incentive = 0; let custom = false;
      const driver = roles.has(e.role);
      if (driver) {
        shipments = counts[e.id] || 0;
        ({ threshold, rate, custom } = ruleForEmployee(db, e, month));
        extra = Math.max(0, shipments - threshold);
        incentive = round2(extra * rate);
      }
      const adj = db.adjustments.filter((a) => a.employeeId === e.id && a.month === month);
      const additions = adj.filter((a) => a.kind === 'allowance').reduce((s, a) => s + Number(a.amount), 0);
      const deductions = adj.filter((a) => a.kind === 'deduction').reduce((s, a) => s + Number(a.amount), 0);
      const net = round2(base + allowances + incentive + additions - deductions);
      return {
        employeeId: e.id, name: e.name, role: e.role, driver, base, allowances, shipments, threshold, rate, custom,
        extra, incentive, additions, deductions, net,
      };
    });
  const rank = (r) => (r.driver ? 2 : r.role === 'supervisor' ? 0 : 1);
  rows.sort((a, b) => (rank(a) - rank(b)) || a.name.localeCompare(b.name, 'ar'));
  return rows;
}
export function payrollFor(db, month) {
  const run = payrollRun(db, month);
  const rows = run ? run.rows : computePayroll(db, month);
  const total = round2(rows.reduce((s, r) => s + r.net, 0));
  return { rows, total, approved: !!run, run };
}

// ---------- أقساط السيارات ----------
export function installmentsInMonth(db, month) {
  return db.vehicles
    .filter((v) => v.paymentMethod === 'installments' && v.installmentStart && Number(v.installmentCount) > 0)
    .map((v) => {
      const idx = monthDiff(v.installmentStart, month);
      if (idx < 0 || idx >= Number(v.installmentCount)) return null;
      return { vehicleId: v.id, plate: v.plate, number: idx + 1, of: Number(v.installmentCount), amount: Number(v.installmentAmount) || 0 };
    })
    .filter(Boolean);
}
export function installmentsRemaining(v, month) {
  if (v.paymentMethod !== 'installments' || !v.installmentStart) return 0;
  const paid = Math.min(Number(v.installmentCount), Math.max(0, monthDiff(v.installmentStart, month) + 1));
  return Math.max(0, Number(v.installmentCount) - paid) * (Number(v.installmentAmount) || 0);
}

// ---------- المصروفات الشهرية الموحّدة ----------
// تجمع: المصروفات اليدوية + المتكررة + ما يتولد تلقائياً من الرواتب والصيانة والوقود والحوادث.
// أقساط السيارات ليست مصروفاً تشغيلياً (ثمن السيارة رأس مال يُسترد عبر حساب استرداد رأس المال) وتظهر كالتزام نقدي منفصل.
export function categoryName(db, id) {
  if (SYSTEM_CATEGORIES[id]) return SYSTEM_CATEGORIES[id];
  return db.expenseCategories.find((c) => c.id === id)?.name || 'غير مصنف';
}
export function monthExpenses(db, month) {
  const plate = (id) => db.vehicles.find((v) => v.id === id)?.plate || '';
  const items = [];
  db.expenses.filter((e) => monthOf(e.date) === month).forEach((e) => items.push({
    key: `m-${e.id}`, source: 'manual', refId: e.id, date: e.date, categoryId: e.categoryId,
    description: e.description, amount: Number(e.amount) || 0, vehicleId: e.vehicleId,
  }));
  db.recurring.filter((r) => r.startMonth <= month && (!r.endMonth || r.endMonth >= month)).forEach((r) => items.push({
    key: `r-${r.id}`, source: 'recurring', refId: r.id, date: `${month}-${String(r.day || 1).padStart(2, '0')}`,
    categoryId: r.categoryId, description: r.description, amount: Number(r.amount) || 0,
  }));
  const pay = payrollFor(db, month);
  if (pay.rows.length) items.push({
    key: `p-${month}`, source: 'payroll', date: monthEnd(month), categoryId: 'payroll',
    description: pay.approved ? 'مسيّر رواتب الشهر (معتمد)' : 'مسيّر رواتب الشهر (تقديري حتى الاعتماد)',
    amount: pay.total, estimated: !pay.approved,
  });
  db.maintenance.filter((m) => monthOf(m.date) === month).forEach((m) => items.push({
    key: `mt-${m.id}`, source: 'maintenance', date: m.date, categoryId: 'maintenance',
    description: `${m.description || 'صيانة'} — ${plate(m.vehicleId)}`, amount: Number(m.cost) || 0, vehicleId: m.vehicleId,
  }));
  db.fuel.filter((f) => monthOf(f.date) === month).forEach((f) => items.push({
    key: `f-${f.id}`, source: 'fuel', date: f.date, categoryId: 'fuel',
    description: `تعبئة وقود — ${plate(f.vehicleId)}`, amount: Number(f.cost) || 0, vehicleId: f.vehicleId,
  }));
  db.incidents.filter((i) => monthOf(i.date) === month && Number(i.cost) > 0).forEach((i) => items.push({
    key: `i-${i.id}`, source: 'incidents', date: i.date, categoryId: 'incidents',
    description: `${i.description || 'حادث/مخالفة'} — ${plate(i.vehicleId)}`, amount: Number(i.cost) || 0, vehicleId: i.vehicleId,
  }));
  items.sort((a, b) => a.date.localeCompare(b.date));
  return items;
}
export function expensesByCategory(db, month) {
  const map = {};
  monthExpenses(db, month).forEach((i) => { map[i.categoryId] = (map[i.categoryId] || 0) + i.amount; });
  return Object.entries(map).map(([categoryId, amount]) => ({ categoryId, name: categoryName(db, categoryId), amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);
}
export const totalExpenses = (db, month) => round2(monthExpenses(db, month).reduce((s, i) => s + i.amount, 0));

// ---------- حساب استرداد رأس المال ----------
// عند تسجيل كل إيراد تُحدَّد نسبة منه تُستقطع من الأرباح وتُرحَّل (عند إقفال الشهر) إلى حساب منفصل
// الغرض منه استرداد رأس المال المستثمر. النسبة تتغير من شهر لآخر.
export function recoveryBreakdown(db, month) {
  const items = db.revenues.filter((r) => r.month === month).map((r) => ({
    id: r.id, description: r.description, amount: Number(r.amount) || 0, pct: Number(r.recoveryPct) || 0,
    recovery: round2((Number(r.amount) || 0) * (Number(r.recoveryPct) || 0) / 100),
  }));
  const auto = revenueFor(db, month).auto;
  if (auto > 0) {
    const pct = Number(db.settings.defaultRecoveryPct) || 0;
    items.push({ id: 'auto', description: 'إيراد الشحنات التلقائي', amount: auto, pct, recovery: round2(auto * pct / 100) });
  }
  return items;
}
export function provisionFor(db, month) {
  return round2(recoveryBreakdown(db, month).reduce((s, i) => s + i.recovery, 0));
}
export function reserveBalance(db) {
  return round2(db.reserve.reduce((s, r) => s + (r.type === 'deposit' ? 1 : -1) * Number(r.amount), 0));
}
// رأس المال المستثمر: القيمة المحددة في الإعدادات، وإلا مجموع أسعار شراء السيارات
export function capitalStatus(db) {
  const manual = Number(db.settings.capitalAmount) || 0;
  const capital = manual > 0 ? manual : round2(db.vehicles.reduce((s, v) => s + (Number(v.price) || 0), 0));
  const recovered = round2(db.reserve.filter((r) => r.type === 'deposit').reduce((s, r) => s + Number(r.amount), 0));
  return { capital, recovered, remaining: Math.max(0, round2(capital - recovered)), pct: capital > 0 ? Math.min(100, (recovered / capital) * 100) : 0, manual: manual > 0 };
}
// النسبة المقترحة عند تسجيل إيراد جديد: آخر نسبة مستخدمة، وإلا الافتراضية من الإعدادات
export function suggestedRecoveryPct(db) {
  const key = (r) => `${r.month}|${r.createdAt || ''}`;
  const last = [...db.revenues].filter((r) => r.source !== 'بيع أصول').sort((a, b) => key(b).localeCompare(key(a)))[0];
  return last && last.recoveryPct !== undefined && last.recoveryPct !== null ? Number(last.recoveryPct) : Number(db.settings.defaultRecoveryPct) || 0;
}

// ---------- الإيرادات والأرباح ----------
export function revenueFor(db, month) {
  const manual = db.revenues.filter((r) => r.month === month).reduce((s, r) => s + Number(r.amount), 0);
  const rate = Number(db.settings.revenuePerShipment) || 0;
  const auto = rate > 0 ? shipmentsInMonth(db, month).reduce((s, x) => s + Number(x.count), 0) * rate : 0;
  return { manual: round2(manual), auto: round2(auto), total: round2(manual + auto) };
}
export function profitFor(db, month) {
  const closed = db.closedMonths.find((c) => c.month === month);
  if (closed) return { ...closed, closed: true };
  const revenue = revenueFor(db, month).total;
  const expenses = totalExpenses(db, month);
  const operatingProfit = round2(revenue - expenses);
  const provision = provisionFor(db, month);
  return { month, revenue, expenses, operatingProfit, provision, net: round2(operatingProfit - provision), closed: false };
}

// ---------- تكلفة السيارة ----------
// range اختياري: { from, to } بصيغة YYYY-MM لحصر تكاليف التشغيل في فترة
export function vehicleCosts(db, v, range) {
  const inRange = (x) => !range || ((!range.from || monthOf(x.date) >= range.from) && (!range.to || monthOf(x.date) <= range.to));
  const sum = (arr) => round2(arr.filter((x) => x.vehicleId === v.id && inRange(x)).reduce((s, x) => s + Number(x.cost || x.amount || 0), 0));
  const maintenance = sum(db.maintenance);
  const fuel = sum(db.fuel);
  const incidents = sum(db.incidents);
  const other = sum(db.expenses);
  const purchase = Number(v.price) || 0;
  return { purchase, maintenance, fuel, incidents, other, running: round2(maintenance + fuel + incidents + other), total: round2(purchase + maintenance + fuel + incidents + other) };
}

// ---------- التنبيهات ----------
export function alerts(db) {
  const days = Number(db.settings.alertDays) || 30;
  const out = [];
  const push = (d, base) => {
    const left = daysUntil(d);
    if (left === null || left > days) return;
    out.push({ ...base, date: d, left, level: left < 0 ? 'expired' : left <= 7 ? 'urgent' : 'soon' });
  };
  db.employees.filter((e) => e.status !== 'terminated').forEach((e) => {
    entriesOf('empDocs', db).forEach(([k, label]) => {
      const doc = e.docs?.[k];
      if (doc?.expiry) push(doc.expiry, { kind: 'employee', refId: e.id, title: `${label} — ${e.name}` });
    });
  });
  db.vehicles.filter((v) => v.status !== 'sold').forEach((v) => {
    entriesOf('vehDocs', db).forEach(([k, label]) => {
      const doc = v.docs?.[k];
      if (doc?.expiry) push(doc.expiry, { kind: 'vehicle', refId: v.id, title: `${label} — سيارة ${v.plate}` });
    });
  });
  scheduleStatus(db).filter((s) => s.due).forEach((s) => out.push({
    kind: 'maintenance', refId: s.vehicleId, title: `${s.name} — سيارة ${s.plate}`, date: s.dueDate,
    left: s.daysLeft ?? 0, kmLeft: s.kmLeft, level: s.overdue ? 'expired' : 'soon',
  }));
  out.sort((a, b) => a.left - b.left);
  return out;
}

// الصيانة المجدولة: مستحقة إذا بقي أقل من 500 كم أو وصل التاريخ حد التنبيه
export function scheduleStatus(db) {
  const days = Number(db.settings.alertDays) || 30;
  return db.schedules.map((s) => {
    const v = db.vehicles.find((x) => x.id === s.vehicleId);
    if (!v || v.status === 'sold') return null;
    const nextKm = s.everyKm ? Number(s.lastKm || 0) + Number(s.everyKm) : null;
    const kmLeft = nextKm !== null ? nextKm - Number(v.odometer || 0) : null;
    const dueDate = s.everyDays && s.lastDate ? addDays(s.lastDate, Number(s.everyDays)) : null;
    const daysLeft = dueDate ? daysUntil(dueDate) : null;
    const overdue = (kmLeft !== null && kmLeft <= 0) || (daysLeft !== null && daysLeft < 0);
    const due = overdue || (kmLeft !== null && kmLeft <= 500) || (daysLeft !== null && daysLeft <= Math.min(days, 14));
    return { ...s, plate: v.plate, odometer: v.odometer, nextKm, kmLeft, dueDate, daysLeft, due, overdue };
  }).filter(Boolean);
}

// أقرب موظف/سيارة تنتهي له وثيقة معيّنة (مثل الإقامة أو الاستمارة أو الفحص الدوري)
export function nearestExpiry(db, kind, docKey) {
  const rows = kind === 'employee'
    ? db.employees.filter((e) => e.status !== 'terminated').map((e) => ({ id: e.id, name: e.name, expiry: e.docs?.[docKey]?.expiry }))
    : db.vehicles.filter((v) => v.status !== 'sold').map((v) => ({ id: v.id, name: v.plate, expiry: v.docs?.[docKey]?.expiry }));
  return rows.filter((r) => r.expiry).sort((a, b) => a.expiry.localeCompare(b.expiry))[0] || null;
}

// ---------- سلسلة أشهر للتقارير ----------
export function monthSeries(count, from) {
  return Array.from({ length: count }, (_, i) => addMonths(from, -(count - 1 - i)));
}

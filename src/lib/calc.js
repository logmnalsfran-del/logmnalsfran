// منطق الأعمال: دوال نقية تعمل على لقطة البيانات (state) ولا تكتب شيئاً.
import {
  monthOf, monthStart, monthEnd, monthDiff, addDays, daysUntil, round2, addMonths,
} from './format';
import { EMP_DOCS, VEH_DOCS, SYSTEM_CATEGORIES } from './constants';

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
export const activeDrivers = (db) => db.employees.filter((e) => e.role === 'driver' && e.status !== 'terminated');

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
  const rows = db.employees
    .filter((e) => employedInMonth(e, month))
    .map((e) => {
      const base = Number(e.baseSalary) || 0;
      const allowances = Number(e.allowances) || 0;
      let shipments = 0; let threshold = 0; let rate = 0; let extra = 0; let incentive = 0; let custom = false;
      if (e.role === 'driver') {
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
        employeeId: e.id, name: e.name, role: e.role, base, allowances, shipments, threshold, rate, custom,
        extra, incentive, additions, deductions, net,
      };
    });
  const order = { supervisor: 0, maintenance: 1, driver: 2, other: 3 };
  rows.sort((a, b) => (order[a.role] - order[b.role]) || a.name.localeCompare(b.name, 'ar'));
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
// أقساط السيارات ليست مصروفاً تشغيلياً (تكلفة السيارة تُحمَّل عبر مخصص الهالك) وتظهر كالتزام نقدي منفصل.
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

// ---------- مخصص الهالك ----------
export function vehicleMonthlyDepreciation(v) {
  const life = Number(v.usefulLifeMonths) || 0;
  if (!life) return 0;
  return Math.max(0, (Number(v.price) || 0) - (Number(v.residualValue) || 0)) / life;
}
// يبدأ الإهلاك من شهر الشراء ويستمر حتى اكتمال العمر الإنتاجي أو خروج السيارة من الخدمة
export function depreciationBreakdown(db, month) {
  return db.vehicles.map((v) => {
    if (!v.purchaseDate) return null;
    const idx = monthDiff(monthOf(v.purchaseDate), month);
    if (idx < 0 || idx >= Number(v.usefulLifeMonths || 0)) return null;
    if (v.disposal?.date && monthOf(v.disposal.date) < month) return null;
    return { vehicleId: v.id, plate: v.plate, amount: round2(vehicleMonthlyDepreciation(v)), monthIndex: idx + 1, life: Number(v.usefulLifeMonths) };
  }).filter(Boolean);
}
export function provisionFor(db, month) {
  const dep = db.settings.depreciation || { method: 'straight_line' };
  if (dep.method === 'fixed') return round2(Number(dep.fixedAmount) || 0);
  return round2(depreciationBreakdown(db, month).reduce((s, d) => s + d.amount, 0));
}
export function reserveBalance(db) {
  return round2(db.reserve.reduce((s, r) => s + (r.type === 'deposit' ? 1 : -1) * Number(r.amount), 0));
}
export function accumulatedDepreciation(db, v, uptoMonth) {
  if (!v.purchaseDate) return 0;
  const months = Math.min(Number(v.usefulLifeMonths || 0), Math.max(0, monthDiff(monthOf(v.purchaseDate), uptoMonth) + 1));
  return round2(months * vehicleMonthlyDepreciation(v));
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
export function vehicleCosts(db, v) {
  const sum = (arr) => round2(arr.filter((x) => x.vehicleId === v.id).reduce((s, x) => s + Number(x.cost || x.amount || 0), 0));
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
    Object.entries(EMP_DOCS).forEach(([k, label]) => {
      const doc = e.docs?.[k];
      if (doc?.expiry) push(doc.expiry, { kind: 'employee', refId: e.id, title: `${label} — ${e.name}` });
    });
  });
  db.vehicles.filter((v) => v.status !== 'sold').forEach((v) => {
    Object.entries(VEH_DOCS).forEach(([k, label]) => {
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

// ---------- سلسلة أشهر للتقارير ----------
export function monthSeries(count, from) {
  return Array.from({ length: count }, (_, i) => addMonths(from, -(count - 1 - i)));
}

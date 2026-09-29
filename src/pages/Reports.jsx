import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDb, useSession } from '../lib/db';
import { PageHeader, Card, Button, Tabs, MonthSelect, Badge, Bar, ExpiryBadge } from '../components/ui';
import {
  shipmentsByEmployee, ruleForEmployee, payrollFor, employedInMonth, monthSeries, expensesByCategory, profitFor, vehicleCosts,
} from '../lib/calc';
import { thisMonth, monthLabel, money, fmtInt, round2, monthOf, MONTHS_AR, daysUntil } from '../lib/format';
import { EMP_DOCS, VEH_DOCS } from '../lib/constants';
import { seesMoney } from '../lib/permissions';
import { downloadCSV, printPage } from '../lib/export';

export default function Reports() {
  const { role } = useSession();
  const money_ = seesMoney(role);
  const [tab, setTab] = useState('shipments');
  const tabs = [
    { key: 'shipments', label: 'الشحنات والحوافز' },
    { key: 'trend', label: 'أداء المناديب (6 أشهر)' },
    ...(money_ ? [{ key: 'vehicles', label: 'تكاليف السيارات' }, { key: 'expenses', label: 'المصروفات حسب الفئة' }, { key: 'profit', label: 'الأرباح الشهرية' }] : []),
    { key: 'docs', label: 'الوثائق وتواريخ الانتهاء' },
  ];
  return (
    <>
      <PageHeader title="التقارير" subtitle="تقارير قابلة للتصدير إلى Excel والطباعة كـ PDF">
        <Button variant="ghost" icon="printer" onClick={printPage}>طباعة / PDF</Button>
      </PageHeader>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'shipments' && <ShipmentsReport money_={money_} />}
      {tab === 'trend' && <TrendReport />}
      {tab === 'vehicles' && <VehicleReport />}
      {tab === 'expenses' && <ExpenseReport />}
      {tab === 'profit' && <ProfitReport />}
      {tab === 'docs' && <DocsReport />}
    </>
  );
}

function ShipmentsReport({ money_ }) {
  const db = useDb();
  const [month, setMonth] = useState(thisMonth());
  const counts = shipmentsByEmployee(db, month);
  const pay = money_ ? payrollFor(db, month) : null;
  const drivers = db.employees.filter((e) => e.role === 'driver' && employedInMonth(e, month));
  const rows = drivers.map((e) => {
    const n = counts[e.id] || 0;
    const r = ruleForEmployee(db, e, month);
    const days = new Set(db.shipments.filter((s) => s.employeeId === e.id && monthOf(s.date) === month && s.count > 0).map((s) => s.date)).size;
    const pr = pay?.rows.find((x) => x.employeeId === e.id);
    return { e, n, r, days, avg: days ? n / days : 0, extra: Math.max(0, n - r.threshold), incentive: pr?.incentive || 0 };
  }).sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...rows.map((r) => r.n));
  const exportCsv = () => downloadCSV(`تقرير-الشحنات-${month}`, ['المندوب', 'أيام العمل', 'الشحنات', 'متوسط يومي', 'الحد', 'الإضافية', ...(money_ ? ['الحافز'] : [])],
    rows.map((r) => [r.e.name, r.days, r.n, round2(r.avg), r.r.threshold, r.extra, ...(money_ ? [r.incentive] : [])]));
  return (
    <Card flush title={`الشحنات والحوافز — ${monthLabel(month)}`} actions={<><MonthSelect value={month} onChange={setMonth} /><Button variant="ghost" icon="download" onClick={exportCsv}>Excel</Button></>}>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>#</th><th>المندوب</th><th>أيام العمل</th><th>الشحنات</th><th style={{ width: '22%' }} /><th>متوسط يومي</th><th>الإضافية</th>{money_ && <th className="money">الحافز</th>}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.e.id}>
                <td>{i + 1}</td><td><Link to={`/employees/${r.e.id}`}>{r.e.name}</Link></td><td className="num">{r.days}</td>
                <td className="num strong">{fmtInt(r.n)}</td><td><Bar value={r.n} max={max} tone={r.extra ? 'teal' : 'navy'} /></td>
                <td className="num">{round2(r.avg)}</td><td>{r.extra ? <Badge tone="teal">{fmtInt(r.extra)}</Badge> : '—'}</td>
                {money_ && <td className="money num">{money(r.incentive)}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={3}>الإجمالي</td><td className="num">{fmtInt(rows.reduce((s, r) => s + r.n, 0))}</td><td colSpan={2} /><td className="num">{fmtInt(rows.reduce((s, r) => s + r.extra, 0))}</td>{money_ && <td className="money num">{money(rows.reduce((s, r) => s + r.incentive, 0))}</td>}</tr></tfoot>
        </table>
      </div>
    </Card>
  );
}

function TrendReport() {
  const db = useDb();
  const months = monthSeries(6, thisMonth());
  const byMonth = Object.fromEntries(months.map((m) => [m, shipmentsByEmployee(db, m)]));
  const drivers = db.employees.filter((e) => e.role === 'driver' && e.status !== 'terminated').sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const exportCsv = () => downloadCSV('أداء-المناديب-6-أشهر', ['المندوب', ...months.map(monthLabel), 'المتوسط'],
    drivers.map((e) => { const vals = months.map((m) => byMonth[m][e.id] || 0); return [e.name, ...vals, Math.round(vals.reduce((s, n) => s + n, 0) / months.length)]; }));
  return (
    <Card flush title="شحنات المناديب خلال آخر 6 أشهر" actions={<Button variant="ghost" icon="download" onClick={exportCsv}>Excel</Button>}>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>المندوب</th>{months.map((m) => <th key={m}>{MONTHS_AR[Number(m.slice(5)) - 1]}</th>)}</tr></thead>
          <tbody>
            {drivers.map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td>
                {months.map((m) => {
                  const n = byMonth[m][e.id] || 0;
                  const over = n > ruleForEmployee(db, e, m).threshold;
                  return <td key={m} className={`num ${over ? 'text-green strong' : ''}`}>{n ? fmtInt(n) : '—'}</td>;
                })}
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td>الإجمالي</td>{months.map((m) => <td key={m} className="num">{fmtInt(Object.values(byMonth[m]).reduce((s, n) => s + n, 0))}</td>)}</tr></tfoot>
        </table>
      </div>
      <p className="small muted" style={{ padding: '0 20px' }}>الأرقام الخضراء: تجاوز الحد واستحق حافزاً.</p>
    </Card>
  );
}

function VehicleReport() {
  const db = useDb();
  const rows = db.vehicles.map((v) => ({ v, c: vehicleCosts(db, v) })).sort((a, b) => b.c.running - a.c.running);
  const max = Math.max(1, ...rows.map((r) => r.c.running));
  const exportCsv = () => downloadCSV('تكاليف-السيارات', ['اللوحة', 'السيارة', 'سعر الشراء', 'الصيانة', 'الوقود', 'الحوادث', 'أخرى', 'تكاليف التشغيل', 'الإجمالي'],
    rows.map(({ v, c }) => [v.plate, `${v.make} ${v.model}`, c.purchase, c.maintenance, c.fuel, c.incidents, c.other, c.running, c.total]));
  return (
    <Card flush title="تكاليف السيارات منذ الشراء (الأعلى تشغيلاً أولاً)" actions={<Button variant="ghost" icon="download" onClick={exportCsv}>Excel</Button>}>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>السيارة</th><th className="money">الشراء</th><th className="money">الصيانة</th><th className="money">الوقود</th><th className="money">الحوادث</th><th className="money">تكاليف التشغيل</th><th style={{ width: '14%' }} /><th className="money">الإجمالي</th></tr></thead>
          <tbody>
            {rows.map(({ v, c }) => (
              <tr key={v.id}>
                <td><Link to={`/vehicles/${v.id}`}>{v.plate}</Link><div className="sub">{v.make} {v.model}</div></td>
                <td className="money num">{money(c.purchase)}</td><td className="money num">{money(c.maintenance)}</td><td className="money num">{money(c.fuel)}</td>
                <td className="money num">{money(c.incidents)}</td><td className="money num strong">{money(c.running)}</td>
                <td><Bar value={c.running} max={max} tone="orange" /></td><td className="money num">{money(c.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td>الإجمالي</td>{['purchase', 'maintenance', 'fuel', 'incidents', 'running'].map((k) => <td key={k} className="money num">{money(rows.reduce((s, r) => s + r.c[k], 0))}</td>)}<td /><td className="money num">{money(rows.reduce((s, r) => s + r.c.total, 0))}</td></tr></tfoot>
        </table>
      </div>
    </Card>
  );
}

function ExpenseReport() {
  const db = useDb();
  const months = monthSeries(6, thisMonth());
  const data = Object.fromEntries(months.map((m) => [m, Object.fromEntries(expensesByCategory(db, m).map((c) => [c.name, c.amount]))]));
  const names = [...new Set(months.flatMap((m) => Object.keys(data[m])))];
  const exportCsv = () => downloadCSV('المصروفات-6-أشهر', ['الفئة', ...months.map(monthLabel), 'الإجمالي'],
    names.map((n) => [n, ...months.map((m) => data[m][n] || 0), round2(months.reduce((s, m) => s + (data[m][n] || 0), 0))]));
  return (
    <Card flush title="المصروفات حسب الفئة — آخر 6 أشهر" actions={<Button variant="ghost" icon="download" onClick={exportCsv}>Excel</Button>}>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>الفئة</th>{months.map((m) => <th key={m} className="money">{MONTHS_AR[Number(m.slice(5)) - 1]}</th>)}<th className="money">الإجمالي</th></tr></thead>
          <tbody>
            {names.map((n) => (
              <tr key={n}><td>{n}</td>{months.map((m) => <td key={m} className="money num">{data[m][n] ? fmtInt(data[m][n]) : '—'}</td>)}<td className="money num strong">{fmtInt(months.reduce((s, m) => s + (data[m][n] || 0), 0))}</td></tr>
            ))}
          </tbody>
          <tfoot><tr><td>الإجمالي</td>{months.map((m) => <td key={m} className="money num">{fmtInt(Object.values(data[m]).reduce((s, x) => s + x, 0))}</td>)}<td className="money num">{fmtInt(months.reduce((s, m) => s + Object.values(data[m]).reduce((a, x) => a + x, 0), 0))}</td></tr></tfoot>
        </table>
      </div>
    </Card>
  );
}

function ProfitReport() {
  const db = useDb();
  const months = monthSeries(6, thisMonth()).map((m) => ({ m, ...profitFor(db, m) })).filter((x) => x.revenue || x.expenses);
  const max = Math.max(1, ...months.map((x) => Math.max(x.revenue, x.expenses)));
  return (
    <Card title="الإيرادات والمصروفات وصافي الربح">
      <table className="table">
        <thead><tr><th>الشهر</th><th style={{ width: '36%' }}>الإيرادات / المصروفات</th><th className="money">الربح التشغيلي</th><th className="money">مخصص الهالك</th><th className="money">صافي الربح</th></tr></thead>
        <tbody>
          {months.map((x) => (
            <tr key={x.m}>
              <td>{monthLabel(x.m)} {!x.closed && <Badge tone="orange">مفتوح</Badge>}</td>
              <td>
                <div style={{ display: 'grid', gap: 4 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Bar value={x.revenue} max={max} tone="teal" /><span className="small num nowrap">{fmtInt(x.revenue)}</span></div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Bar value={x.expenses} max={max} tone="red" /><span className="small num nowrap">{fmtInt(x.expenses)}</span></div>
                </div>
              </td>
              <td className="money num">{money(x.operatingProfit)}</td><td className="money num text-orange">{money(x.provision)}</td>
              <td className={`money num strong ${x.net >= 0 ? 'text-green' : 'text-red'}`}>{money(x.net)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function DocsReport() {
  const db = useDb();
  const [filter, setFilter] = useState('90');
  const rows = [
    ...db.employees.filter((e) => e.status !== 'terminated').flatMap((e) => Object.entries(EMP_DOCS).map(([k, label]) => ({ owner: e.name, to: `/employees/${e.id}`, type: 'موظف', label, number: e.docs?.[k]?.number, expiry: e.docs?.[k]?.expiry }))),
    ...db.vehicles.filter((v) => v.status !== 'sold').flatMap((v) => Object.entries(VEH_DOCS).map(([k, label]) => ({ owner: `سيارة ${v.plate}`, to: `/vehicles/${v.id}`, type: 'سيارة', label, number: v.docs?.[k]?.number, expiry: v.docs?.[k]?.expiry }))),
  ].filter((r) => r.expiry && (filter === 'all' || daysUntil(r.expiry) <= Number(filter))).sort((a, b) => a.expiry.localeCompare(b.expiry));
  const exportCsv = () => downloadCSV('الوثائق', ['الجهة', 'النوع', 'الوثيقة', 'الرقم', 'تاريخ الانتهاء', 'الأيام المتبقية'], rows.map((r) => [r.owner, r.type, r.label, r.number, r.expiry, daysUntil(r.expiry)]));
  return (
    <Card flush title="الوثائق وتواريخ الانتهاء" actions={<>
      <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 'auto' }} aria-label="المدة">
        <option value="0">المنتهية فقط</option><option value="30">خلال 30 يوماً</option><option value="90">خلال 90 يوماً</option><option value="all">الكل</option>
      </select>
      <Button variant="ghost" icon="download" onClick={exportCsv}>Excel</Button></>}>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>الجهة</th><th>الوثيقة</th><th>الرقم</th><th>الحالة</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}><td><Link to={r.to}>{r.owner}</Link> <span className="sub">{r.type}</span></td><td>{r.label}</td><td className="num">{r.number || '—'}</td><td><ExpiryBadge date={r.expiry} /></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

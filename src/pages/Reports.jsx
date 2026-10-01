import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDb, useSession } from '../lib/db';
import { PageHeader, Card, Button, Tabs, MonthSelect, Badge, Bar, ExpiryCell, SearchBox } from '../components/ui';
import {
  shipmentsByEmployee, ruleForEmployee, payrollFor, employedInMonth, monthSeries, expensesByCategory, profitFor, vehicleCosts,
  currentCustody, custodyOfEmployee,
} from '../lib/calc';
import { thisMonth, monthLabel, money, fmtInt, round2, monthOf, MONTHS_AR, daysUntil, fmtDate } from '../lib/format';
import { EMP_STATUS, VEH_STATUS } from '../lib/constants';
import { seesMoney } from '../lib/permissions';
import { downloadCSV, printPage } from '../lib/export';
import { entriesOf, isDriver, labelOf, listOf } from '../lib/lookups';

export default function Reports() {
  const { role } = useSession();
  const money_ = seesMoney(role);
  const staff = role !== 'maintenance'; // مسؤول الصيانة يرى تقارير السيارات والوثائق فقط
  const [tab, setTab] = useState(staff ? 'employees' : 'vehicles');
  const tabs = [
    ...(staff ? [{ key: 'employees', label: 'العمالة' }, { key: 'shipments', label: 'الشحنات والحوافز' }, { key: 'trend', label: 'أداء المناديب (6 أشهر)' }] : []),
    { key: 'vehicles', label: 'السيارات والتكاليف' },
    ...(money_ ? [{ key: 'expenses', label: 'المصروفات حسب الفئة' }, { key: 'profit', label: 'الأرباح الشهرية' }] : []),
    { key: 'docs', label: 'الوثائق وتواريخ الانتهاء' },
  ];
  return (
    <>
      <PageHeader title="التقارير" subtitle="تقارير قابلة للتصدير إلى Excel والطباعة كـ PDF">
        <Button variant="ghost" icon="printer" onClick={printPage}>طباعة / PDF</Button>
      </PageHeader>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'employees' && <EmployeesReport money_={money_} />}
      {tab === 'shipments' && <ShipmentsReport money_={money_} />}
      {tab === 'trend' && <TrendReport />}
      {tab === 'vehicles' && <VehicleReport money_={money_} />}
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
  const [q, setQ] = useState('');
  const [only, setOnly] = useState('all');
  const drivers = db.employees.filter((e) => isDriver(e) && employedInMonth(e, month) && (!q || e.name.includes(q)));
  const rows = drivers.map((e) => {
    const n = counts[e.id] || 0;
    const r = ruleForEmployee(db, e, month);
    const days = new Set(db.shipments.filter((s) => s.employeeId === e.id && monthOf(s.date) === month && s.count > 0).map((s) => s.date)).size;
    const pr = pay?.rows.find((x) => x.employeeId === e.id);
    return { e, n, r, days, avg: days ? n / days : 0, extra: Math.max(0, n - r.threshold), incentive: pr?.incentive || 0 };
  }).filter((r) => only === 'all' || (only === 'over' ? r.extra > 0 : r.extra === 0)).sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...rows.map((r) => r.n));
  const exportCsv = () => downloadCSV(`تقرير-الشحنات-${month}`, ['المندوب', 'أيام العمل', 'الشحنات', 'متوسط يومي', 'الحد', 'الإضافية', ...(money_ ? ['الحافز'] : [])],
    rows.map((r) => [r.e.name, r.days, r.n, round2(r.avg), r.r.threshold, r.extra, ...(money_ ? [r.incentive] : [])]));
  return (
    <Card flush title={`الشحنات والحوافز — ${monthLabel(month)}`} actions={<><MonthSelect value={month} onChange={setMonth} /><Button variant="ghost" icon="download" onClick={exportCsv}>Excel</Button></>}>
      <div className="toolbar no-print" style={{ padding: '12px 20px 0' }}>
        <SearchBox value={q} onChange={setQ} placeholder="بحث باسم المندوب" />
        <select value={only} onChange={(e) => setOnly(e.target.value)} aria-label="الحد">
          <option value="all">الكل</option><option value="over">تجاوزوا الحد</option><option value="under">لم يتجاوزوا الحد</option>
        </select>
      </div>
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
  const drivers = db.employees.filter((e) => isDriver(e) && e.status !== 'terminated').sort((a, b) => a.name.localeCompare(b.name, 'ar'));
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

function VehicleReport({ money_ }) {
  const db = useDb();
  const [f, setF] = useState({ status: 'fleet', make: '', driver: '', from: '', to: '', q: '', doc: 'registration', sort: 'expiry' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  const docName = labelOf('vehDocs', f.doc);
  const range = f.from || f.to ? { from: f.from, to: f.to } : null;
  const makes = [...new Set(db.vehicles.map((v) => v.make).filter(Boolean))].sort();
  const driverOf = (v) => { const c = currentCustody(db, v.id); return c ? db.employees.find((e) => e.id === c.employeeId) : null; };
  const rows = db.vehicles
    .filter((v) => (f.status === 'fleet' ? v.status !== 'sold' : f.status === 'all' ? true : v.status === f.status))
    .filter((v) => !f.make || v.make === f.make)
    .filter((v) => !f.driver || (f.driver === 'none' ? !driverOf(v) : driverOf(v)?.id === f.driver))
    .filter((v) => !f.q || [v.plate, v.model, v.vin].some((x) => String(x || '').includes(f.q)))
    .map((v) => ({ v, c: vehicleCosts(db, v, range), d: driverOf(v), expiry: v.docs?.[f.doc]?.expiry || '' }))
    .sort((a, b) => (f.sort === 'expiry'
      ? (a.expiry || '9999').localeCompare(b.expiry || '9999')
      : b.c.running - a.c.running));
  const nearest = f.sort === 'expiry' && rows[0]?.expiry ? rows[0] : null;
  const max = Math.max(1, ...rows.map((r) => r.c.running));
  const period = range ? `${f.from ? monthLabel(f.from) : 'البداية'} — ${f.to ? monthLabel(f.to) : 'الآن'}` : 'منذ الشراء';
  const sum = (k) => rows.reduce((s, r) => s + r.c[k], 0);
  const exportCsv = () => downloadCSV('تقرير-السيارات', ['اللوحة', 'السيارة', 'السنة', 'الحالة', 'المندوب', 'العداد', `انتهاء ${docName}`, 'الأيام المتبقية', ...(money_ ? ['سعر الشراء'] : []), 'الصيانة', 'الوقود', 'الحوادث', 'أخرى', 'تكاليف التشغيل', 'الفترة'],
    rows.map(({ v, c, d, expiry }) => [v.plate, `${v.make} ${v.model}`, v.year, VEH_STATUS[v.status].label, d?.name || '', v.odometer, expiry, expiry ? daysUntil(expiry) : '', ...(money_ ? [c.purchase] : []), c.maintenance, c.fuel, c.incidents, c.other, c.running, period]));
  return (
    <Card flush title={`السيارات وتكاليف التشغيل — ${period}`} actions={<Button variant="ghost" icon="download" onClick={exportCsv}>Excel</Button>}>
      <div className="toolbar no-print" style={{ padding: '12px 20px 0' }}>
        <SearchBox value={f.q} onChange={set('q')} placeholder="بحث باللوحة أو الموديل" />
        <select value={f.status} onChange={set('status')} aria-label="الحالة">
          <option value="fleet">الأسطول الحالي</option><option value="all">الكل</option>
          {Object.entries(VEH_STATUS).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
        </select>
        <select value={f.make} onChange={set('make')} aria-label="الماركة">
          <option value="">كل الماركات</option>{makes.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={f.driver} onChange={set('driver')} aria-label="المندوب">
          <option value="">كل المناديب</option><option value="none">بدون عهدة</option>
          {db.employees.filter((e) => isDriver(e)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select value={f.doc} onChange={set('doc')} aria-label="الوثيقة">
          {listOf('vehDocs', db).map((t) => <option key={t.key} value={t.key}>وثيقة: {t.name}</option>)}
        </select>
        <select value={f.sort} onChange={set('sort')} aria-label="الترتيب">
          <option value="expiry">ترتيب: الأقرب انتهاءً</option><option value="cost">ترتيب: الأعلى تكلفة</option>
        </select>
        <label className="small muted">من <input type="month" value={f.from} onChange={set('from')} style={{ width: 150 }} /></label>
        <label className="small muted">إلى <input type="month" value={f.to} onChange={set('to')} style={{ width: 150 }} /></label>
        {(range || f.make || f.driver || f.q || f.status !== 'fleet') && <button type="button" className="btn-link" onClick={() => setF({ ...f, status: 'fleet', make: '', driver: '', from: '', to: '', q: '' })}>مسح الفلاتر</button>}
      </div>
      {nearest && (
        <div style={{ padding: '12px 20px 0' }}>
          <div className="notice n-warn" style={{ margin: 0 }}>
            أقرب سيارة تحتاج تجديد <strong>{docName}</strong>: <Link to={`/vehicles/${nearest.v.id}`}><strong>{nearest.v.plate}</strong></Link> ({nearest.v.make} {nearest.v.model}) — <ExpiryCell date={nearest.expiry} />
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>السيارة</th><th>الحالة</th><th>المندوب</th><th>انتهاء {docName}</th>{money_ && <th className="money">الشراء</th>}<th className="money">الصيانة</th><th className="money">الوقود</th><th className="money">الحوادث</th><th className="money">تكاليف التشغيل</th><th style={{ width: '12%' }} /></tr></thead>
          <tbody>
            {rows.map(({ v, c, d, expiry }) => (
              <tr key={v.id}>
                <td><Link to={`/vehicles/${v.id}`}>{v.plate}</Link><div className="sub">{v.make} {v.model} · {v.year}</div></td>
                <td><Badge tone={VEH_STATUS[v.status].tone}>{VEH_STATUS[v.status].label}</Badge></td>
                <td>{d?.name || <span className="muted">—</span>}</td>
                <td><ExpiryCell date={expiry} /></td>
                {money_ && <td className="money num">{money(c.purchase)}</td>}
                <td className="money num">{money(c.maintenance)}</td><td className="money num">{money(c.fuel)}</td>
                <td className="money num">{money(c.incidents)}</td><td className="money num strong">{money(c.running)}</td>
                <td><Bar value={c.running} max={max} tone="orange" /></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={4}>الإجمالي ({rows.length} سيارة)</td>{money_ && <td className="money num">{money(sum('purchase'))}</td>}<td className="money num">{money(sum('maintenance'))}</td><td className="money num">{money(sum('fuel'))}</td><td className="money num">{money(sum('incidents'))}</td><td className="money num">{money(sum('running'))}</td><td /></tr></tfoot>
        </table>
      </div>
    </Card>
  );
}

function EmployeesReport({ money_ }) {
  const db = useDb();
  const [f, setF] = useState({ type: '', status: 'current', nationality: '', q: '', month: thisMonth(), doc: 'iqama', sort: 'expiry' });
  const docName = labelOf('empDocs', f.doc);
  const set = (k) => (e) => setF({ ...f, [k]: e.target ? e.target.value : e });
  const nationalities = [...new Set(db.employees.map((e) => e.nationality).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
  const counts = shipmentsByEmployee(db, f.month);
  const pay = money_ ? payrollFor(db, f.month) : null;
  const rows = db.employees
    .filter((e) => !f.type || e.role === f.type)
    .filter((e) => (f.status === 'current' ? e.status !== 'terminated' : f.status === 'all' ? true : e.status === f.status))
    .filter((e) => !f.nationality || e.nationality === f.nationality)
    .filter((e) => !f.q || [e.name, e.nationalId, e.phone].some((x) => String(x || '').includes(f.q)))
    .map((e) => {
      const c = custodyOfEmployee(db, e.id);
      return { e, expiry: e.docs?.[f.doc]?.expiry || '', plate: c ? db.vehicles.find((v) => v.id === c.vehicleId)?.plate : '', shipments: counts[e.id] || 0, net: pay?.rows.find((r) => r.employeeId === e.id)?.net };
    })
    .sort((a, b) => (f.sort === 'expiry'
      ? (a.expiry || '9999').localeCompare(b.expiry || '9999') || a.e.name.localeCompare(b.e.name, 'ar')
      : a.e.name.localeCompare(b.e.name, 'ar')));
  const nearest = f.sort === 'expiry' && rows[0]?.expiry ? rows[0] : null;
  const exportCsv = () => downloadCSV(`تقرير-العمالة-${f.month}`, ['الاسم', 'نوع العمالة', 'المسمى', 'الجنسية', 'الهوية/الإقامة', 'الجوال', 'تاريخ التعيين', 'الحالة', `انتهاء ${docName}`, 'الأيام المتبقية', 'السيارة', `شحنات ${f.month}`, ...(money_ ? ['الراتب الأساسي', 'البدلات', `صافي راتب ${f.month}`] : [])],
    rows.map(({ e, plate, shipments, net, expiry }) => [e.name, labelOf('jobTypes', e.role), e.title, e.nationality, e.nationalId, e.phone, e.hireDate, EMP_STATUS[e.status].label, expiry, expiry ? daysUntil(expiry) : '', plate, isDriver(e) ? shipments : '', ...(money_ ? [e.baseSalary, e.allowances, net ?? ''] : [])]));
  return (
    <Card flush title={`تقرير العمالة — ${rows.length} موظف`} actions={<><MonthSelect value={f.month} onChange={set('month')} /><Button variant="ghost" icon="download" onClick={exportCsv}>Excel</Button></>}>
      <div className="toolbar no-print" style={{ padding: '12px 20px 0' }}>
        <SearchBox value={f.q} onChange={set('q')} placeholder="بحث بالاسم أو الهوية أو الجوال" />
        <select value={f.type} onChange={set('type')} aria-label="نوع العمالة">
          <option value="">كل أنواع العمالة</option>{listOf('jobTypes', db).map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
        </select>
        <select value={f.status} onChange={set('status')} aria-label="الحالة">
          <option value="current">الحاليون</option><option value="all">الكل</option>
          {Object.entries(EMP_STATUS).map(([k, x]) => <option key={k} value={k}>{x.label}</option>)}
        </select>
        <select value={f.nationality} onChange={set('nationality')} aria-label="الجنسية">
          <option value="">كل الجنسيات</option>{nationalities.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select value={f.doc} onChange={set('doc')} aria-label="الوثيقة">
          {listOf('empDocs', db).map((t) => <option key={t.key} value={t.key}>وثيقة: {t.name}</option>)}
        </select>
        <select value={f.sort} onChange={set('sort')} aria-label="الترتيب">
          <option value="expiry">ترتيب: الأقرب انتهاءً</option><option value="name">ترتيب: الاسم</option>
        </select>
        {(f.type || f.nationality || f.q || f.status !== 'current') && <button type="button" className="btn-link" onClick={() => setF({ ...f, type: '', status: 'current', nationality: '', q: '' })}>مسح الفلاتر</button>}
      </div>
      {nearest && (
        <div style={{ padding: '12px 20px 0' }}>
          <div className="notice n-warn" style={{ margin: 0 }}>
            أقرب موظف تنتهي <strong>{docName}</strong> الخاصة به: <Link to={`/employees/${nearest.e.id}`}><strong>{nearest.e.name}</strong></Link> — <ExpiryCell date={nearest.expiry} />
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>الاسم</th><th>نوع العمالة</th><th>الجنسية</th><th>انتهاء {docName}</th><th>السيارة</th><th>شحنات الشهر</th>{money_ && <><th className="money">الأساسي + البدلات</th><th className="money">صافي الشهر</th></>}<th>الحالة</th></tr></thead>
          <tbody>
            {rows.map(({ e, plate, shipments, net, expiry }) => (
              <tr key={e.id}>
                <td><Link to={`/employees/${e.id}`}>{e.name}</Link><div className="sub">{e.nationalId}</div></td>
                <td>{labelOf('jobTypes', e.role)}{e.title && <div className="sub">{e.title}</div>}</td>
                <td>{e.nationality || '—'}</td><td><ExpiryCell date={expiry} /></td><td>{plate || '—'}</td>
                <td className="num">{isDriver(e) ? fmtInt(shipments) : '—'}</td>
                {money_ && <><td className="money num">{money(Number(e.baseSalary || 0) + Number(e.allowances || 0))}</td><td className="money num strong">{net !== undefined ? money(net) : '—'}</td></>}
                <td><Badge tone={EMP_STATUS[e.status].tone}>{EMP_STATUS[e.status].label}</Badge></td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={5}>الإجمالي</td><td className="num">{fmtInt(rows.reduce((s, r) => s + (isDriver(r.e) ? r.shipments : 0), 0))}</td>{money_ && <><td className="money num">{money(rows.reduce((s, r) => s + Number(r.e.baseSalary || 0) + Number(r.e.allowances || 0), 0))}</td><td className="money num">{money(rows.reduce((s, r) => s + (r.net || 0), 0))}</td></>}<td /></tr></tfoot>
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
        <thead><tr><th>الشهر</th><th style={{ width: '36%' }}>الإيرادات / المصروفات</th><th className="money">الربح التشغيلي</th><th className="money">استرداد رأس المال</th><th className="money">صافي الربح</th></tr></thead>
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
  const [filter, setFilter] = useState('all');
  const [kind, setKind] = useState('');
  const [doc, setDoc] = useState('');
  const rows = [
    ...db.employees.filter((e) => e.status !== 'terminated').flatMap((e) => entriesOf('empDocs').map(([k, label]) => ({ owner: e.name, to: `/employees/${e.id}`, type: 'موظف', key: `e:${k}`, label, number: e.docs?.[k]?.number, expiry: e.docs?.[k]?.expiry }))),
    ...db.vehicles.filter((v) => v.status !== 'sold').flatMap((v) => entriesOf('vehDocs').map(([k, label]) => ({ owner: `سيارة ${v.plate}`, to: `/vehicles/${v.id}`, type: 'سيارة', key: `v:${k}`, label, number: v.docs?.[k]?.number, expiry: v.docs?.[k]?.expiry }))),
  ].filter((r) => r.expiry && (filter === 'all' || daysUntil(r.expiry) <= Number(filter)))
    .filter((r) => (!kind || r.type === kind) && (!doc || r.key === doc))
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
  const exportCsv = () => downloadCSV('الوثائق', ['الجهة', 'النوع', 'الوثيقة', 'الرقم', 'تاريخ الانتهاء', 'الأيام المتبقية'], rows.map((r) => [r.owner, r.type, r.label, r.number, r.expiry, daysUntil(r.expiry)]));
  return (
    <Card flush title="الوثائق وتواريخ الانتهاء" actions={<>
      <select value={kind} onChange={(e) => { setKind(e.target.value); setDoc(''); }} style={{ width: 'auto' }} aria-label="الجهة">
        <option value="">الموظفون والسيارات</option><option value="موظف">الموظفون</option><option value="سيارة">السيارات</option>
      </select>
      <select value={doc} onChange={(e) => setDoc(e.target.value)} style={{ width: 'auto' }} aria-label="نوع الوثيقة">
        <option value="">كل الوثائق</option>
        {kind !== 'سيارة' && entriesOf('empDocs').map(([k, n]) => <option key={`e:${k}`} value={`e:${k}`}>{n}</option>)}
        {kind !== 'موظف' && entriesOf('vehDocs').map(([k, n]) => <option key={`v:${k}`} value={`v:${k}`}>{n}</option>)}
      </select>
      <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 'auto' }} aria-label="المدة">
        <option value="0">المنتهية فقط</option><option value="30">خلال 30 يوماً</option><option value="90">خلال 90 يوماً</option><option value="all">الكل</option>
      </select>
      <Button variant="ghost" icon="download" onClick={exportCsv}>Excel</Button></>}>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>الجهة</th><th>الوثيقة</th><th>الرقم</th><th>الحالة</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}><td><Link to={r.to}>{r.owner}</Link> <span className="sub">{r.type}</span></td><td>{r.label}</td><td className="num">{r.number || '—'}</td><td><ExpiryCell date={r.expiry} /></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

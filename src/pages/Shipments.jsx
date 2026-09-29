import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDb, useSession, replaceWhere } from '../lib/db';
import { PageHeader, Card, Button, Badge, Tabs, MonthSelect, Stat, Bar, IconButton, Notice } from '../components/ui';
import { shipmentsByEmployee, ruleForEmployee, isClosed, employedInMonth } from '../lib/calc';
import {
  today, thisMonth, monthOf, addDays, fmtDate, fmtInt, weekdayAr, daysInMonth, monthLabel,
} from '../lib/format';
import { canEdit } from '../lib/permissions';
import { downloadCSV } from '../lib/export';

export default function Shipments() {
  const [tab, setTab] = useState('daily');
  return (
    <>
      <PageHeader title="الشحنات اليومية" subtitle="إدخال عدد الشحنات التي سلّمها كل مندوب يومياً، وتُجمع تلقائياً لحساب الحافز الشهري" />
      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'daily', label: 'الإدخال اليومي' }, { key: 'matrix', label: 'الجدول الشهري' }]} />
      {tab === 'daily' ? <Daily /> : <Matrix />}
    </>
  );
}

function Daily() {
  const db = useDb();
  const { role } = useSession();
  const [date, setDate] = useState(today());
  const month = monthOf(date);
  const closed = isClosed(db, month);
  const editable = canEdit(role, 'shipments') && !closed && date <= today();

  const drivers = useMemo(() => db.employees
    .filter((e) => e.role === 'driver' && employedInMonth(e, month) && (!e.hireDate || e.hireDate <= date))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar')), [db.employees, month, date]);

  const saved = useMemo(() => {
    const map = {};
    db.shipments.filter((s) => s.date === date).forEach((s) => { map[s.employeeId] = s.count; });
    return map;
  }, [db.shipments, date]);

  const [values, setValues] = useState({});
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setValues(Object.fromEntries(drivers.map((d) => [d.id, saved[d.id] ?? ''])));
    setDirty(false);
  }, [date, saved, drivers]);

  const monthCounts = shipmentsByEmployee(db, month);
  const dayTotal = Object.values(values).reduce((s, v) => s + (Number(v) || 0), 0);

  const save = () => {
    const rows = drivers.filter((d) => values[d.id] !== '' && values[d.id] !== undefined)
      .map((d) => ({ employeeId: d.id, date, count: Math.max(0, Math.round(Number(values[d.id]) || 0)) }));
    const ids = new Set(drivers.map((d) => d.id));
    replaceWhere('shipments', (s) => s.date === date && ids.has(s.employeeId), rows, `حفظ شحنات يوم ${date} (${rows.reduce((s, r) => s + r.count, 0)} شحنة)`);
    setDirty(false);
  };
  const go = (n) => {
    if (dirty && !window.confirm('لديك تعديلات غير محفوظة. الانتقال دون حفظ؟')) return;
    setDate(addDays(date, n));
  };

  return (
    <>
      <div className="toolbar">
        <IconButton icon="arrow" title="اليوم السابق" onClick={() => go(-1)} style={{ transform: 'scaleX(-1)' }} />
        <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} style={{ width: 170 }} />
        <IconButton icon="arrow" title="اليوم التالي" onClick={() => go(1)} disabled={date >= today()} />
        <strong>{weekdayAr(date)} {fmtDate(date)}</strong>
        <span className="spacer" />
        {editable && <Button icon="check" onClick={save} disabled={!dirty}>حفظ شحنات اليوم</Button>}
      </div>
      {closed && <Notice tone="warn">شهر {monthLabel(month)} مُقفل مالياً — لا يمكن تعديل الشحنات.</Notice>}
      {weekdayAr(date) === 'الجمعة' && <Notice>يوم الجمعة — اتركه فارغاً إن لم يكن هناك توصيل.</Notice>}

      <div className="stats">
        <Stat icon="box" tone="orange" label="إجمالي شحنات اليوم" value={fmtInt(dayTotal)} hint={`${Object.values(values).filter((v) => v !== '').length} من ${drivers.length} مندوب`} />
        <Stat icon="chart" label={`إجمالي ${monthLabel(month)}`} value={fmtInt(Object.values(monthCounts).reduce((s, n) => s + n, 0))} />
      </div>

      <Card flush>
        <div className="table-wrap">
          <table className="table ship-grid">
            <thead><tr><th>المندوب</th><th>شحنات اليوم</th><th>مجموع الشهر</th><th style={{ width: '30%' }}>التقدم نحو الحد</th><th>الحالة</th></tr></thead>
            <tbody>
              {drivers.map((d) => {
                const rule = ruleForEmployee(db, d, month);
                const base = (monthCounts[d.id] || 0) - (Number(saved[d.id]) || 0);
                const total = base + (Number(values[d.id]) || 0);
                return (
                  <tr key={d.id}>
                    <td><Link to={`/employees/${d.id}`}>{d.name}</Link><div className="sub">{d.externalId}{d.status === 'leave' ? ' · في إجازة' : ''}</div></td>
                    <td>
                      <input type="number" min="0" inputMode="numeric" value={values[d.id] ?? ''} disabled={!editable}
                        onChange={(e) => { setValues((v) => ({ ...v, [d.id]: e.target.value })); setDirty(true); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const inputs = [...document.querySelectorAll('.ship-grid input')]; inputs[inputs.indexOf(e.target) + 1]?.focus(); } }}
                        aria-label={`شحنات ${d.name}`} />
                    </td>
                    <td className="num strong">{fmtInt(total)}</td>
                    <td><Bar value={total} max={rule.threshold} tone={total > rule.threshold ? 'teal' : 'navy'} /></td>
                    <td>{total > rule.threshold ? <Badge tone="teal">+{fmtInt(total - rule.threshold)} إضافية</Badge> : <span className="small muted">باقي {fmtInt(rule.threshold - total)}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="small muted">اضغط Enter للانتقال إلى المندوب التالي. الحقل الفارغ يعني عدم وجود إدخال لذلك اليوم.</p>
    </>
  );
}

function Matrix() {
  const db = useDb();
  const [month, setMonth] = useState(thisMonth());
  const days = daysInMonth(month);
  const dayList = Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const drivers = db.employees.filter((e) => e.role === 'driver' && employedInMonth(e, month)).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const cell = {};
  db.shipments.filter((s) => monthOf(s.date) === month).forEach((s) => { cell[`${s.employeeId}|${s.date}`] = s.count; });
  const totals = shipmentsByEmployee(db, month);
  const dayTotals = dayList.map((d) => drivers.reduce((s, e) => s + (Number(cell[`${e.id}|${d}`]) || 0), 0));

  const exportCsv = () => downloadCSV(`الشحنات-${month}`, ['المندوب', ...dayList.map((d) => d.slice(8)), 'الإجمالي', 'الحد', 'الإضافية'],
    drivers.map((e) => {
      const r = ruleForEmployee(db, e, month);
      return [e.name, ...dayList.map((d) => cell[`${e.id}|${d}`] ?? ''), totals[e.id] || 0, r.threshold, Math.max(0, (totals[e.id] || 0) - r.threshold)];
    }));

  return (
    <>
      <div className="toolbar">
        <MonthSelect value={month} onChange={setMonth} />
        <span className="spacer" />
        <Button variant="ghost" icon="download" onClick={exportCsv}>تصدير Excel</Button>
      </div>
      <Card flush>
        <div className="table-wrap">
          <table className="table matrix">
            <thead>
              <tr>
                <th className="name">المندوب</th>
                {dayList.map((d) => <th key={d} title={weekdayAr(d)}>{Number(d.slice(8))}</th>)}
                <th>الإجمالي</th><th>الإضافية</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((e) => {
                const r = ruleForEmployee(db, e, month);
                const t = totals[e.id] || 0;
                return (
                  <tr key={e.id}>
                    <td className="name">{e.name}</td>
                    {dayList.map((d) => <td key={d} className={weekdayAr(d) === 'الجمعة' ? 'fri' : ''}>{cell[`${e.id}|${d}`] ?? ''}</td>)}
                    <td className="strong">{fmtInt(t)}</td>
                    <td className={t > r.threshold ? 'over' : ''}>{t > r.threshold ? fmtInt(t - r.threshold) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="name">إجمالي اليوم</td>
                {dayTotals.map((t, i) => <td key={i}>{t || ''}</td>)}
                <td>{fmtInt(dayTotals.reduce((s, n) => s + n, 0))}</td><td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDb, useSession, remove, update } from '../lib/db';
import { PageHeader, Card, Button, Badge, Tabs, Empty, IconButton, MonthSelect, Stat } from '../components/ui';
import { MaintenanceForm, FuelForm, IncidentForm, ScheduleForm } from '../components/OpsForms';
import { scheduleStatus, isClosed } from '../lib/calc';
import { thisMonth, monthOf, money, fmtDate, fmtInt, today, round2 } from '../lib/format';
import { canEdit } from '../lib/permissions';
import { downloadCSV } from '../lib/export';
import { labelOf } from '../lib/lookups';

export default function Operations() {
  const db = useDb();
  const { role } = useSession();
  const [tab, setTab] = useState('schedules');
  const [month, setMonth] = useState(thisMonth());
  const [modal, setModal] = useState(null);
  const editable = canEdit(role, 'operations');

  const plate = (id) => db.vehicles.find((v) => v.id === id)?.plate || '—';
  const inMonth = (arr) => arr.filter((x) => monthOf(x.date) === month).sort((a, b) => b.date.localeCompare(a.date));
  const maint = inMonth(db.maintenance);
  const fuel = inMonth(db.fuel);
  const inc = inMonth(db.incidents);
  const sched = scheduleStatus(db).sort((a, b) => Number(b.due) - Number(a.due) || (a.kmLeft ?? 1e9) - (b.kmLeft ?? 1e9));
  const sum = (arr) => round2(arr.reduce((s, x) => s + Number(x.cost || 0), 0));
  const closed = isClosed(db, month);

  const del = (col, r, label) => {
    if (isClosed(db, monthOf(r.date))) return alert('الشهر مُقفل ولا يمكن الحذف.');
    if (window.confirm(`حذف ${label}؟`)) remove(col, r.id, `حذف ${label} — ${plate(r.vehicleId)}`);
  };
  const actions = (col, type, r, label) => editable && (
    <td><div className="actions">
      <IconButton icon="edit" title="تعديل" onClick={() => setModal({ type, record: r })} />
      <IconButton icon="trash" tone="red" title="حذف" onClick={() => del(col, r, label)} />
    </div></td>
  );

  const exportCsv = () => {
    if (tab === 'maintenance') downloadCSV(`الصيانة-${month}`, ['التاريخ', 'السيارة', 'النوع', 'الوصف', 'الورشة', 'قطع الغيار', 'العداد', 'التكلفة'], maint.map((m) => [m.date, plate(m.vehicleId), labelOf('maintTypes', m.type), m.description, m.workshop, m.parts, m.odometer, m.cost]));
    else if (tab === 'fuel') downloadCSV(`الوقود-${month}`, ['التاريخ', 'السيارة', 'اللترات', 'العداد', 'التكلفة'], fuel.map((f) => [f.date, plate(f.vehicleId), f.liters, f.odometer, f.cost]));
    else if (tab === 'incidents') downloadCSV(`الحوادث-${month}`, ['التاريخ', 'السيارة', 'النوع', 'السائق', 'الوصف', 'التكلفة'], inc.map((i) => [i.date, plate(i.vehicleId), labelOf('incidentKinds', i.kind), db.employees.find((e) => e.id === i.employeeId)?.name, i.description, i.cost]));
    else downloadCSV('الصيانة-المجدولة', ['السيارة', 'الصيانة', 'العداد الحالي', 'الاستحقاق (كم)', 'المتبقي (كم)', 'تاريخ الاستحقاق'], sched.map((s) => [s.plate, s.name, s.odometer, s.nextKm, s.kmLeft, s.dueDate]));
  };

  return (
    <>
      <PageHeader title="الصيانة والتشغيل" subtitle="الصيانة المجدولة، سجلات الصيانة، الوقود، الحوادث والمخالفات لكل الأسطول">
        {tab !== 'schedules' && <MonthSelect value={month} onChange={setMonth} />}
        <Button variant="ghost" icon="download" onClick={exportCsv}>تصدير Excel</Button>
        {editable && tab !== 'schedules' && !closed && (
          <Button icon="plus" onClick={() => setModal({ type: { maintenance: 'maint', fuel: 'fuel', incidents: 'inc' }[tab] })}>
            {{ maintenance: 'تسجيل صيانة', fuel: 'تسجيل تعبئة', incidents: 'تسجيل حادث / مخالفة' }[tab]}
          </Button>
        )}
        {editable && tab === 'schedules' && <Button icon="plus" onClick={() => setModal({ type: 'sched' })}>إضافة صيانة مجدولة</Button>}
      </PageHeader>

      {tab !== 'schedules' && (
        <div className="stats">
          <Stat icon="wrench" tone="orange" label="تكلفة الصيانة" value={money(sum(maint))} hint={`${maint.length} سجل`} />
          <Stat icon="truck" tone="navy" label="تكلفة الوقود" value={money(sum(fuel))} hint={`${fmtInt(fuel.reduce((s, f) => s + Number(f.liters || 0), 0))} لتر`} />
          <Stat icon="bell" tone="red" label="الحوادث والمخالفات" value={money(sum(inc))} hint={`${inc.length} سجل`} />
        </div>
      )}
      {closed && tab !== 'schedules' && <div className="notice n-warn">هذا الشهر مُقفل مالياً — العرض فقط.</div>}

      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'schedules', label: 'الصيانة المجدولة', count: sched.filter((s) => s.due).length },
        { key: 'maintenance', label: 'سجل الصيانة', count: maint.length },
        { key: 'fuel', label: 'الوقود', count: fuel.length },
        { key: 'incidents', label: 'الحوادث والمخالفات', count: inc.length },
      ]} />

      <Card flush>
        <div className="table-wrap">
          {tab === 'schedules' && (sched.length === 0 ? <Empty /> : (
            <table className="table">
              <thead><tr><th>السيارة</th><th>الصيانة</th><th>العداد الحالي</th><th>الاستحقاق القادم</th><th>الحالة</th>{editable && <th />}</tr></thead>
              <tbody>
                {sched.map((s) => (
                  <tr key={s.id}>
                    <td><Link to={`/vehicles/${s.vehicleId}`}>{s.plate}</Link></td>
                    <td>{s.name}<div className="sub">{s.everyKm ? `كل ${fmtInt(s.everyKm)} كم` : ''}{s.everyDays ? ` / ${s.everyDays} يوم` : ''}</div></td>
                    <td className="num">{fmtInt(s.odometer)}</td>
                    <td>{s.nextKm ? <><span className="num">{fmtInt(s.nextKm)}</span> كم</> : ''}{s.dueDate && <div className="sub">{fmtDate(s.dueDate)}</div>}</td>
                    <td>{s.overdue ? <Badge tone="red">متأخرة</Badge> : s.due ? <Badge tone="orange">مستحقة قريباً</Badge> : <Badge tone="green">{s.kmLeft !== null ? `باقي ${fmtInt(s.kmLeft)} كم` : 'منتظمة'}</Badge>}</td>
                    {editable && <td><div className="actions">
                      <IconButton icon="check" title="تم التنفيذ الآن" onClick={() => {
                        const v = db.vehicles.find((x) => x.id === s.vehicleId);
                        update('schedules', s.id, { lastKm: v.odometer, lastDate: today() }, `تنفيذ ${s.name} — ${s.plate}`);
                      }} />
                      <IconButton icon="edit" title="تعديل" onClick={() => setModal({ type: 'sched', record: s })} />
                    </div></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

          {tab === 'maintenance' && (maint.length === 0 ? <Empty>لا توجد صيانة في هذا الشهر</Empty> : (
            <table className="table">
              <thead><tr><th>التاريخ</th><th>السيارة</th><th>النوع</th><th>الوصف</th><th>الورشة</th><th className="money">التكلفة</th>{editable && <th />}</tr></thead>
              <tbody>
                {maint.map((m) => (
                  <tr key={m.id}>
                    <td>{fmtDate(m.date)}</td><td><Link to={`/vehicles/${m.vehicleId}`}>{plate(m.vehicleId)}</Link></td>
                    <td><Badge tone={m.type === 'emergency' ? 'orange' : 'navy'}>{labelOf('maintTypes', m.type)}</Badge></td>
                    <td>{m.description}{m.parts && <div className="sub">{m.parts}</div>}</td><td>{m.workshop}</td>
                    <td className="money num">{money(m.cost)}</td>{actions('maintenance', 'maint', m, 'سجل الصيانة')}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={5}>الإجمالي</td><td className="money num">{money(sum(maint))}</td>{editable && <td />}</tr></tfoot>
            </table>
          ))}

          {tab === 'fuel' && (fuel.length === 0 ? <Empty>لا توجد تعبئات في هذا الشهر</Empty> : (
            <table className="table">
              <thead><tr><th>التاريخ</th><th>السيارة</th><th>اللترات</th><th>العداد</th><th className="money">التكلفة</th>{editable && <th />}</tr></thead>
              <tbody>
                {fuel.map((f) => (
                  <tr key={f.id}>
                    <td>{fmtDate(f.date)}</td><td><Link to={`/vehicles/${f.vehicleId}`}>{plate(f.vehicleId)}</Link></td>
                    <td className="num">{fmtInt(f.liters)}</td><td className="num">{fmtInt(f.odometer)}</td><td className="money num">{money(f.cost)}</td>
                    {actions('fuel', 'fuel', f, 'تعبئة الوقود')}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={4}>الإجمالي</td><td className="money num">{money(sum(fuel))}</td>{editable && <td />}</tr></tfoot>
            </table>
          ))}

          {tab === 'incidents' && (inc.length === 0 ? <Empty>لا توجد حوادث أو مخالفات في هذا الشهر</Empty> : (
            <table className="table">
              <thead><tr><th>التاريخ</th><th>السيارة</th><th>النوع</th><th>السائق</th><th>الوصف</th><th className="money">التكلفة على الشركة</th>{editable && <th />}</tr></thead>
              <tbody>
                {inc.map((i) => (
                  <tr key={i.id}>
                    <td>{fmtDate(i.date)}</td><td><Link to={`/vehicles/${i.vehicleId}`}>{plate(i.vehicleId)}</Link></td>
                    <td><Badge tone={i.kind === 'accident' ? 'red' : 'orange'}>{labelOf('incidentKinds', i.kind)}</Badge></td>
                    <td>{db.employees.find((e) => e.id === i.employeeId)?.name || '—'}</td><td>{i.description}</td>
                    <td className="money num">{money(i.cost)}</td>{actions('incidents', 'inc', i, 'السجل')}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={5}>الإجمالي</td><td className="money num">{money(sum(inc))}</td>{editable && <td />}</tr></tfoot>
            </table>
          ))}
        </div>
      </Card>

      {modal?.type === 'maint' && <MaintenanceForm record={modal.record} onClose={() => setModal(null)} />}
      {modal?.type === 'fuel' && <FuelForm record={modal.record} onClose={() => setModal(null)} />}
      {modal?.type === 'inc' && <IncidentForm record={modal.record} onClose={() => setModal(null)} />}
      {modal?.type === 'sched' && <ScheduleForm record={modal.record} onClose={() => setModal(null)} />}
    </>
  );
}

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDb, useSession, remove, update, insert } from '../lib/db';
import {
  PageHeader, Card, Button, Badge, ExpiryBadge, Empty, Tabs, IconButton, Modal, Field, FormGrid, useForm, Stat,
} from '../components/ui';
import VehicleForm from '../components/VehicleForm';
import { MaintenanceForm, FuelForm, IncidentForm, ScheduleForm, HandoverForm, ReturnForm } from '../components/OpsForms';
import { VEH_STATUS } from '../lib/constants';
import {
  currentCustody, vehicleCosts, installmentsRemaining, scheduleStatus, isClosed,
} from '../lib/calc';
import { money, fmtDate, fmtInt, thisMonth, today, monthOf, monthDiff, addMonths, monthLabel } from '../lib/format';
import { canEdit, canCustody, seesMoney } from '../lib/permissions';
import { entriesOf, labelOf } from '../lib/lookups';

export default function VehicleDetail() {
  const { id } = useParams();
  const db = useDb();
  const { role } = useSession();
  const nav = useNavigate();
  const [tab, setTab] = useState('custody');
  const [modal, setModal] = useState(null);
  const v = db.vehicles.find((x) => x.id === id);
  if (!v) return <Empty>السيارة غير موجودة. <Link to="/vehicles">العودة</Link></Empty>;

  const editable = canEdit(role, 'vehicles');
  const opsEditable = canEdit(role, 'operations');
  const showMoney = seesMoney(role);
  const cur = currentCustody(db, v.id);
  const curEmp = cur && db.employees.find((e) => e.id === cur.employeeId);
  const byDate = (a, b) => b.date.localeCompare(a.date);
  const custody = db.custody.filter((c) => c.vehicleId === v.id).sort((a, b) => b.fromDate.localeCompare(a.fromDate));
  const maint = db.maintenance.filter((m) => m.vehicleId === v.id).sort(byDate);
  const fuel = db.fuel.filter((f) => f.vehicleId === v.id).sort(byDate);
  const inc = db.incidents.filter((i) => i.vehicleId === v.id).sort(byDate);
  const sched = scheduleStatus(db).filter((s) => s.vehicleId === v.id);
  const costs = vehicleCosts(db, v);
  const M = thisMonth();
  const empName = (eid) => db.employees.find((e) => e.id === eid)?.name || '—';

  const del = (col, r, label) => {
    if (r.date && isClosed(db, monthOf(r.date))) return alert('الشهر مُقفل ولا يمكن الحذف.');
    if (window.confirm(`حذف ${label}؟`)) remove(col, r.id, `حذف ${label} — ${v.plate}`);
  };
  const delVehicle = () => {
    if (custody.length || maint.length || fuel.length) return alert('لا يمكن حذف سيارة لها سجلات. استخدم «بيع / تشطيب» بدلاً من ذلك.');
    if (window.confirm(`حذف السيارة ${v.plate} نهائياً؟`)) { remove('vehicles', v.id, `حذف السيارة ${v.plate}`); nav('/vehicles'); }
  };

  const tabs = [
    { key: 'custody', label: 'العهدة', count: custody.length },
    { key: 'maintenance', label: 'الصيانة', count: maint.length },
    { key: 'schedules', label: 'الصيانة المجدولة', count: sched.length },
    { key: 'fuel', label: 'الوقود', count: fuel.length },
    { key: 'incidents', label: 'الحوادث والمخالفات', count: inc.length },
    ...(showMoney ? [{ key: 'finance', label: 'التكاليف والأقساط' }] : []),
  ];

  return (
    <>
      <PageHeader title={`${v.plate}`} subtitle={<>{v.make} {v.model} {v.year} · <Badge tone={VEH_STATUS[v.status].tone}>{VEH_STATUS[v.status].label}</Badge></>}>
        <Button variant="ghost" icon="back" onClick={() => nav('/vehicles')}>رجوع</Button>
        {editable && <Button icon="edit" onClick={() => setModal({ type: 'edit' })}>تعديل</Button>}
        {role === 'owner' && v.status !== 'sold' && <Button variant="ghost" onClick={() => setModal({ type: 'dispose' })}>بيع / تشطيب</Button>}
        {role === 'owner' && <Button variant="danger" icon="trash" onClick={delVehicle}>حذف</Button>}
      </PageHeader>

      <div className="stats">
        <Stat icon="users" label="المندوب الحالي" value={curEmp ? curEmp.name : 'بدون عهدة'} hint={cur ? `منذ ${fmtDate(cur.fromDate)}` : ''} />
        <Stat icon="truck" tone="teal" label="قراءة العداد" value={`${fmtInt(v.odometer)} كم`} />
        <Stat icon="wrench" tone="orange" label="تكاليف التشغيل" value={money(costs.running)} hint="صيانة + وقود + حوادث + أخرى" />
        {showMoney && <Stat icon="coins" label="إجمالي التكلفة" value={money(costs.total)} hint={`منها الشراء ${money(costs.purchase)}`} />}
      </div>

      <div className="grid grid-2">
        <Card title="بيانات السيارة">
          <div className="kv">
            <div><span>رقم الهيكل</span><strong className="num">{v.vin || '—'}</strong></div>
            <div><span>اللون</span><strong>{v.color || '—'}</strong></div>
            {showMoney && <>
              <div><span>تاريخ الشراء</span><strong>{fmtDate(v.purchaseDate)}</strong></div>
              <div><span>سعر الشراء</span><strong>{money(v.price)}</strong></div>
              <div><span>البائع</span><strong>{v.vendor || '—'}</strong></div>
              <div><span>طريقة الدفع</span><strong>{v.paymentMethod === 'installments' ? `أقساط: ${v.installmentCount} × ${money(v.installmentAmount)}` : 'نقداً'}</strong></div>
            </>}
            {v.disposal && <div><span>{v.disposal.type === 'sold' ? 'بيعت في' : 'شُطبت في'}</span><strong>{fmtDate(v.disposal.date)} {v.disposal.price ? `بـ ${money(v.disposal.price)}` : ''}</strong></div>}
          </div>
        </Card>
        <Card title="الوثائق">
          <table className="table compact">
            <tbody>
              {entriesOf('vehDocs').map(([k, label]) => (
                <tr key={k}><td>{label}</td><td className="num">{v.docs?.[k]?.number || '—'}</td><td><ExpiryBadge date={v.docs?.[k]?.expiry} /></td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <Card>
        <Tabs tabs={tabs} active={tab} onChange={setTab} />

        {tab === 'custody' && <>
          <div className="toolbar">
            {canCustody(role) && v.status !== 'sold' && (cur
              ? <Button icon="swap" onClick={() => setModal({ type: 'return', custody: cur })}>استلام السيارة من {curEmp?.name}</Button>
              : <Button icon="swap" onClick={() => setModal({ type: 'handover' })}>تسليم السيارة لمندوب</Button>)}
          </div>
          {custody.length === 0 ? <Empty>لم تُسلَّم لأي مندوب بعد</Empty> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>المندوب</th><th>من</th><th>إلى</th><th>العداد عند التسليم</th><th>العداد عند الاستلام</th><th>الحالة عند الاستلام</th></tr></thead>
              <tbody>
                {custody.map((c) => (
                  <tr key={c.id}>
                    <td><Link to={`/employees/${c.employeeId}`}>{empName(c.employeeId)}</Link></td>
                    <td>{fmtDate(c.fromDate)}</td>
                    <td>{c.toDate ? fmtDate(c.toDate) : <Badge tone="green">حالية</Badge>}</td>
                    <td className="num">{fmtInt(c.odometerOut)}</td>
                    <td className="num">{c.odometerIn ? fmtInt(c.odometerIn) : '—'}</td>
                    <td>{c.conditionIn || (c.toDate ? '—' : c.conditionOut)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </>}

        {tab === 'maintenance' && <>
          {opsEditable && <div className="toolbar"><Button icon="plus" onClick={() => setModal({ type: 'maint' })}>تسجيل صيانة</Button></div>}
          {maint.length === 0 ? <Empty /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>التاريخ</th><th>النوع</th><th>الوصف</th><th>الورشة</th><th>العداد</th><th className="money">التكلفة</th>{opsEditable && <th />}</tr></thead>
              <tbody>
                {maint.map((m) => (
                  <tr key={m.id}>
                    <td>{fmtDate(m.date)}</td><td><Badge tone={m.type === 'emergency' ? 'orange' : 'navy'}>{labelOf('maintTypes', m.type)}</Badge></td>
                    <td>{m.description}{m.parts && <div className="sub">{m.parts}</div>}</td><td>{m.workshop}</td>
                    <td className="num">{fmtInt(m.odometer)}</td><td className="money num">{money(m.cost)}</td>
                    {opsEditable && <td><div className="actions"><IconButton icon="edit" title="تعديل" onClick={() => setModal({ type: 'maint', record: m })} /><IconButton icon="trash" tone="red" title="حذف" onClick={() => del('maintenance', m, 'سجل الصيانة')} /></div></td>}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={5}>الإجمالي</td><td className="money num">{money(costs.maintenance)}</td>{opsEditable && <td />}</tr></tfoot>
            </table></div>
          )}
        </>}

        {tab === 'schedules' && <>
          {opsEditable && <div className="toolbar"><Button icon="plus" onClick={() => setModal({ type: 'sched' })}>إضافة صيانة مجدولة</Button></div>}
          {sched.length === 0 ? <Empty /> : (
            <table className="table">
              <thead><tr><th>الصيانة</th><th>الدورة</th><th>آخر تنفيذ</th><th>الاستحقاق القادم</th><th>الحالة</th>{opsEditable && <th />}</tr></thead>
              <tbody>
                {sched.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{s.everyKm ? `كل ${fmtInt(s.everyKm)} كم` : ''}{s.everyKm && s.everyDays ? ' أو ' : ''}{s.everyDays ? `كل ${s.everyDays} يوم` : ''}</td>
                    <td><span className="num">{fmtInt(s.lastKm)}</span> كم · {fmtDate(s.lastDate)}</td>
                    <td>{s.nextKm ? <><span className="num">{fmtInt(s.nextKm)}</span> كم</> : ''} {s.dueDate ? `· ${fmtDate(s.dueDate)}` : ''}</td>
                    <td>{s.overdue ? <Badge tone="red">متأخرة</Badge> : s.due ? <Badge tone="orange">مستحقة قريباً</Badge> : <Badge tone="green">{s.kmLeft !== null ? `باقي ${fmtInt(s.kmLeft)} كم` : 'منتظمة'}</Badge>}</td>
                    {opsEditable && <td><div className="actions">
                      <IconButton icon="check" title="تم التنفيذ الآن" onClick={() => update('schedules', s.id, { lastKm: v.odometer, lastDate: today() }, `تنفيذ ${s.name} — ${v.plate}`)} />
                      <IconButton icon="edit" title="تعديل" onClick={() => setModal({ type: 'sched', record: s })} />
                      <IconButton icon="trash" tone="red" title="حذف" onClick={() => window.confirm('حذف الجدول؟') && remove('schedules', s.id, `حذف جدول ${s.name} — ${v.plate}`)} />
                    </div></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>}

        {tab === 'fuel' && <>
          {opsEditable && <div className="toolbar"><Button icon="plus" onClick={() => setModal({ type: 'fuel' })}>تسجيل تعبئة</Button></div>}
          {fuel.length === 0 ? <Empty /> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>التاريخ</th><th>اللترات</th><th>العداد</th><th className="money">التكلفة</th>{opsEditable && <th />}</tr></thead>
              <tbody>
                {fuel.slice(0, 40).map((f) => (
                  <tr key={f.id}>
                    <td>{fmtDate(f.date)}</td><td className="num">{fmtInt(f.liters)}</td><td className="num">{fmtInt(f.odometer)}</td><td className="money num">{money(f.cost)}</td>
                    {opsEditable && <td><div className="actions"><IconButton icon="edit" title="تعديل" onClick={() => setModal({ type: 'fuel', record: f })} /><IconButton icon="trash" tone="red" title="حذف" onClick={() => del('fuel', f, 'تعبئة الوقود')} /></div></td>}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={3}>الإجمالي</td><td className="money num">{money(costs.fuel)}</td>{opsEditable && <td />}</tr></tfoot>
            </table></div>
          )}
        </>}

        {tab === 'incidents' && <>
          {opsEditable && <div className="toolbar"><Button icon="plus" onClick={() => setModal({ type: 'inc' })}>تسجيل حادث / مخالفة</Button></div>}
          {inc.length === 0 ? <Empty /> : (
            <table className="table">
              <thead><tr><th>التاريخ</th><th>النوع</th><th>السائق</th><th>الوصف</th><th className="money">التكلفة</th>{opsEditable && <th />}</tr></thead>
              <tbody>
                {inc.map((i) => (
                  <tr key={i.id}>
                    <td>{fmtDate(i.date)}</td><td><Badge tone={i.kind === 'accident' ? 'red' : 'orange'}>{labelOf('incidentKinds', i.kind)}</Badge></td>
                    <td>{empName(i.employeeId)}</td><td>{i.description}</td><td className="money num">{money(i.cost)}</td>
                    {opsEditable && <td><div className="actions"><IconButton icon="edit" title="تعديل" onClick={() => setModal({ type: 'inc', record: i })} /><IconButton icon="trash" tone="red" title="حذف" onClick={() => del('incidents', i, 'السجل')} /></div></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>}

        {tab === 'finance' && showMoney && <FinanceTab db={db} v={v} costs={costs} M={M} />}
      </Card>

      {modal?.type === 'edit' && <VehicleForm vehicle={v} onClose={() => setModal(null)} showMoney={showMoney} />}
      {modal?.type === 'maint' && <MaintenanceForm vehicleId={v.id} record={modal.record} onClose={() => setModal(null)} />}
      {modal?.type === 'fuel' && <FuelForm vehicleId={v.id} record={modal.record} onClose={() => setModal(null)} />}
      {modal?.type === 'inc' && <IncidentForm vehicleId={v.id} record={modal.record} onClose={() => setModal(null)} />}
      {modal?.type === 'sched' && <ScheduleForm vehicleId={v.id} record={modal.record} onClose={() => setModal(null)} />}
      {modal?.type === 'handover' && <HandoverForm vehicle={v} onClose={() => setModal(null)} />}
      {modal?.type === 'return' && <ReturnForm vehicle={v} custody={modal.custody} onClose={() => setModal(null)} />}
      {modal?.type === 'dispose' && <DisposeForm v={v} cur={cur} onClose={() => setModal(null)} />}
    </>
  );
}

function FinanceTab({ db, v, costs, M }) {
  const remaining = installmentsRemaining(v, M);
  const paidCount = v.paymentMethod === 'installments' && v.installmentStart ? Math.min(v.installmentCount, Math.max(0, monthDiff(v.installmentStart, M) + 1)) : 0;
  return (
    <div className="grid grid-2">
      <div>
        <h2 style={{ marginBottom: 10 }}>تكلفة السيارة</h2>
        <table className="statement"><tbody>
          <tr><td>سعر الشراء</td><td>{money(costs.purchase)}</td></tr>
          <tr className="sub"><td>الصيانة</td><td>{money(costs.maintenance)}</td></tr>
          <tr className="sub"><td>الوقود</td><td>{money(costs.fuel)}</td></tr>
          <tr className="sub"><td>الحوادث والمخالفات</td><td>{money(costs.incidents)}</td></tr>
          <tr className="sub"><td>مصروفات أخرى مرتبطة</td><td>{money(costs.other)}</td></tr>
          <tr className="total"><td>الإجمالي</td><td>{money(costs.total)}</td></tr>
        </tbody></table>
      </div>
      <div>
        {v.paymentMethod === 'installments' && <>
          <h2 style={{ marginBottom: 10 }}>الأقساط</h2>
          <table className="statement"><tbody>
            <tr><td>القسط الشهري</td><td>{money(v.installmentAmount)}</td></tr>
            <tr className="sub"><td>المدفوع</td><td>{paidCount} من {v.installmentCount} (ينتهي {monthLabel(addMonths(v.installmentStart, v.installmentCount - 1))})</td></tr>
            <tr className="total"><td>المتبقي</td><td>{money(remaining)}</td></tr>
          </tbody></table>
        </>}
        {v.paymentMethod !== 'installments' && <p className="muted">السيارة مشتراة نقداً. ثمن السيارات رأس مال يُسترد تدريجياً عبر «حساب استرداد رأس المال» في شاشة الأرباح.</p>}
      </div>
    </div>
  );
}

function DisposeForm({ v, cur, onClose }) {
  const { values: f, bind } = useForm({ date: today(), type: 'sold', price: '' });
  const save = () => {
    const price = Number(f.price) || 0;
    if (cur) update('custody', cur.id, { toDate: f.date, odometerIn: v.odometer, conditionIn: f.type === 'sold' ? 'بيعت' : 'شُطبت' });
    update('vehicles', v.id, { status: 'sold', disposal: { date: f.date, type: f.type, price } }, `${f.type === 'sold' ? 'بيع' : 'تشطيب'} السيارة ${v.plate}${price ? ` بـ ${price} ر.س` : ''}`);
    if (price > 0) insert('revenues', { month: monthOf(f.date), date: f.date, amount: price, description: `بيع السيارة ${v.plate}`, source: 'بيع أصول', recoveryPct: 0 });
    onClose();
  };
  return (
    <Modal title={`إخراج السيارة ${v.plate} من الخدمة`} onClose={onClose}
      footer={<><Button variant="danger" onClick={save}>تأكيد</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <FormGrid cols={3}>
        <Field label="التاريخ" type="date" {...bind('date')} />
        <Field label="النوع" as="select" options={[{ value: 'sold', label: 'بيع' }, { value: 'scrapped', label: 'تشليح / شطب' }]} {...bind('type')} />
        <Field label="المبلغ المحصّل (ر.س)" type="number" min="0" {...bind('price')} />
      </FormGrid>
      <p className="muted small">تُغلق العهدة الحالية، ويُسجَّل مبلغ البيع إيراداً في شهره (يمكن تحديد نسبة استرداد رأس المال منه من شاشة الأرباح).</p>
    </Modal>
  );
}

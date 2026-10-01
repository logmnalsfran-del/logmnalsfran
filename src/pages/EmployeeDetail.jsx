import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useDb, useSession, remove } from '../lib/db';
import { PageHeader, Card, Button, Badge, ExpiryBadge, Empty } from '../components/ui';
import EmployeeForm from '../components/EmployeeForm';
import { EMP_STATUS } from '../lib/constants';
import { shipmentsByEmployee, ruleForEmployee, payrollFor, monthSeries } from '../lib/calc';
import { thisMonth, monthLabel, money, fmtDate, fmtInt } from '../lib/format';
import { canEdit, seesMoney } from '../lib/permissions';
import { entriesOf, labelOf, isDriver } from '../lib/lookups';

export default function EmployeeDetail() {
  const { id } = useParams();
  const db = useDb();
  const { role } = useSession();
  const nav = useNavigate();
  const [editing, setEditing] = useState(false);
  const e = db.employees.find((x) => x.id === id);
  if (!e) return <Empty>الموظف غير موجود. <Link to="/employees">العودة</Link></Empty>;

  const showMoney = seesMoney(role);
  const editable = canEdit(role, 'employees');
  const M = thisMonth();
  const custody = db.custody.filter((c) => c.employeeId === e.id).sort((a, b) => b.fromDate.localeCompare(a.fromDate));
  const incidents = db.incidents.filter((i) => i.employeeId === e.id).sort((a, b) => b.date.localeCompare(a.date));
  const hasShipments = db.shipments.some((s) => s.employeeId === e.id);

  const del = () => {
    if (hasShipments || custody.length) {
      alert('لا يمكن حذف موظف له شحنات أو عهدة مسجّلة. غيّر حالته إلى «منتهية خدماته» بدلاً من ذلك.');
      return;
    }
    if (!window.confirm(`حذف ${e.name} نهائياً؟`)) return;
    remove('employees', e.id, `حذف الموظف ${e.name}`);
    nav('/employees');
  };

  const history = isDriver(e) ? monthSeries(6, M).reverse().map((m) => {
    const n = shipmentsByEmployee(db, m)[e.id] || 0;
    const rule = ruleForEmployee(db, e, m);
    const row = showMoney ? payrollFor(db, m).rows.find((r) => r.employeeId === e.id) : null;
    return { m, n, rule, extra: Math.max(0, n - rule.threshold), row };
  }) : [];

  return (
    <>
      <PageHeader title={e.name} subtitle={<>{labelOf('jobTypes', e.role)} · <Badge tone={EMP_STATUS[e.status].tone}>{EMP_STATUS[e.status].label}</Badge></>}>
        <Button variant="ghost" icon="back" onClick={() => nav('/employees')}>رجوع</Button>
        {editable && <Button icon="edit" onClick={() => setEditing(true)}>تعديل</Button>}
        {role === 'owner' && <Button variant="danger" icon="trash" onClick={del}>حذف</Button>}
      </PageHeader>

      <Card title="البيانات">
        <div className="kv">
          <div><span>المسمى الوظيفي</span><strong>{e.title || '—'}</strong></div>
          <div><span>رقم الهوية / الإقامة</span><strong className="num">{e.nationalId || '—'}</strong></div>
          <div><span>الجنسية</span><strong>{e.nationality || '—'}</strong></div>
          <div><span>الجوال</span><strong className="num">{e.phone || '—'}</strong></div>
          <div><span>تاريخ الميلاد</span><strong>{fmtDate(e.birthDate)}</strong></div>
          <div><span>تاريخ التعيين</span><strong>{fmtDate(e.hireDate)}</strong></div>
          {isDriver(e) && <div><span>رقمه في تطبيق الشركة الرئيسية</span><strong>{e.externalId || '—'}</strong></div>}
          {showMoney && <>
            <div><span>الراتب الأساسي</span><strong>{money(e.baseSalary)}</strong></div>
            <div><span>البدلات</span><strong>{money(e.allowances)}</strong></div>
            <div><span>الآيبان</span><strong className="num">{e.iban || '—'}</strong></div>
            {isDriver(e) && <div><span>الحافز</span><strong>{e.incentiveOverride?.enabled ? `خاص: فوق ${fmtInt(e.incentiveOverride.threshold)} × ${e.incentiveOverride.rate} ر.س` : 'حسب الإعداد العام'}</strong></div>}
          </>}
        </div>
        {e.notes && <p className="muted" style={{ marginBottom: 0 }}>{e.notes}</p>}
      </Card>

      <div className="grid grid-2">
        <Card title="الوثائق">
          <table className="table compact">
            <thead><tr><th>الوثيقة</th><th>الرقم</th><th>الانتهاء</th></tr></thead>
            <tbody>
              {entriesOf('empDocs').map(([k, label]) => (
                <tr key={k}><td>{label}</td><td className="num">{e.docs?.[k]?.number || '—'}</td><td><ExpiryBadge date={e.docs?.[k]?.expiry} /></td></tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="عهدة السيارات">
          {custody.length === 0 ? <Empty>لا توجد عهدة</Empty> : (
            <table className="table compact">
              <thead><tr><th>السيارة</th><th>من</th><th>إلى</th></tr></thead>
              <tbody>
                {custody.map((c) => {
                  const v = db.vehicles.find((x) => x.id === c.vehicleId);
                  return (
                    <tr key={c.id}>
                      <td><Link to={`/vehicles/${c.vehicleId}`}>{v?.plate}</Link> <span className="sub">{v?.make} {v?.model}</span></td>
                      <td>{fmtDate(c.fromDate)}</td>
                      <td>{c.toDate ? fmtDate(c.toDate) : <Badge tone="green">حالية</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {isDriver(e) && (
        <Card title="الشحنات والحوافز (آخر 6 أشهر)" flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>الشهر</th><th>الشحنات</th><th>الحد</th><th>الإضافية</th>{showMoney && <><th className="money">الحافز</th><th className="money">صافي الراتب</th></>}</tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.m}>
                    <td>{monthLabel(h.m)}</td>
                    <td className="num strong">{fmtInt(h.n)}</td>
                    <td className="num">{fmtInt(h.rule.threshold)}</td>
                    <td>{h.extra > 0 ? <Badge tone="teal">+{fmtInt(h.extra)}</Badge> : '—'}</td>
                    {showMoney && <><td className="money num">{h.row ? money(h.row.incentive) : '—'}</td><td className="money num strong">{h.row ? money(h.row.net) : '—'}</td></>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {incidents.length > 0 && (
        <Card title="الحوادث والمخالفات" flush>
          <table className="table">
            <thead><tr><th>التاريخ</th><th>النوع</th><th>الوصف</th><th>السيارة</th><th className="money">التكلفة على الشركة</th></tr></thead>
            <tbody>
              {incidents.map((i) => (
                <tr key={i.id}>
                  <td>{fmtDate(i.date)}</td><td>{labelOf('incidentKinds', i.kind)}</td><td>{i.description}</td>
                  <td>{db.vehicles.find((v) => v.id === i.vehicleId)?.plate}</td><td className="money num">{money(i.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {editing && <EmployeeForm employee={e} onClose={() => setEditing(false)} showMoney={showMoney} />}
    </>
  );
}

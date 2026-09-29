import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb, useSession } from '../lib/db';
import { PageHeader, Card, Button, Badge, ExpiryBadge, SearchBox, Tabs, Empty } from '../components/ui';
import EmployeeForm from '../components/EmployeeForm';
import { JOBS, EMP_STATUS, EMP_DOCS } from '../lib/constants';
import { custodyOfEmployee } from '../lib/calc';
import { money } from '../lib/format';
import { canEdit, seesMoney } from '../lib/permissions';
import { downloadCSV } from '../lib/export';

// أقرب وثيقة انتهاءً لكل موظف
function nearestDoc(e) {
  return Object.entries(EMP_DOCS)
    .map(([k, label]) => ({ label, expiry: e.docs?.[k]?.expiry }))
    .filter((d) => d.expiry)
    .sort((a, b) => a.expiry.localeCompare(b.expiry))[0];
}

export default function Employees() {
  const db = useDb();
  const { role } = useSession();
  const nav = useNavigate();
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('current');
  const [form, setForm] = useState(null);
  const editable = canEdit(role, 'employees');
  const showMoney = seesMoney(role);

  const list = useMemo(() => db.employees
    .filter((e) => tab === 'all' || e.role === tab)
    .filter((e) => (status === 'current' ? e.status !== 'terminated' : status === 'all' ? true : e.status === status))
    .filter((e) => !q || [e.name, e.nationalId, e.phone, e.externalId].some((x) => (x || '').includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar')), [db.employees, tab, q, status]);

  const count = (r) => db.employees.filter((e) => e.status !== 'terminated' && (r === 'all' || e.role === r)).length;
  const plate = (e) => {
    const c = custodyOfEmployee(db, e.id);
    return c ? db.vehicles.find((v) => v.id === c.vehicleId)?.plate : null;
  };

  const exportCsv = () => downloadCSV('الموظفون', ['الاسم', 'الفئة', 'الهوية/الإقامة', 'الجنسية', 'الجوال', 'تاريخ التعيين', 'الحالة', ...(showMoney ? ['الراتب', 'البدلات'] : []), 'انتهاء الإقامة', 'انتهاء الرخصة'],
    list.map((e) => [e.name, JOBS[e.role], e.nationalId, e.nationality, e.phone, e.hireDate, EMP_STATUS[e.status].label, ...(showMoney ? [e.baseSalary, e.allowances] : []), e.docs?.iqama?.expiry, e.docs?.license?.expiry]));

  return (
    <>
      <PageHeader title="الموظفون" subtitle="المشرفون ومسؤولو الصيانة ومناديب التوصيل">
        <Button variant="ghost" icon="download" onClick={exportCsv}>تصدير Excel</Button>
        {editable && <Button icon="plus" onClick={() => setForm({})}>إضافة موظف</Button>}
      </PageHeader>

      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'all', label: 'الكل', count: count('all') },
        { key: 'driver', label: 'المناديب', count: count('driver') },
        { key: 'supervisor', label: 'المشرفون', count: count('supervisor') },
        { key: 'maintenance', label: 'الصيانة', count: count('maintenance') },
        { key: 'other', label: 'أخرى', count: count('other') },
      ]} />

      <div className="toolbar">
        <SearchBox value={q} onChange={setQ} placeholder="بحث بالاسم أو الهوية أو الجوال" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="الحالة">
          <option value="current">الحاليون</option>
          <option value="all">الكل (مع المنتهية خدماتهم)</option>
          {Object.entries(EMP_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </select>
      </div>

      <Card flush>
        {list.length === 0 ? <Empty>لا يوجد موظفون مطابقون</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>الاسم</th><th>الفئة</th><th>الجوال</th><th>السيارة</th>
                  {showMoney && <th className="money">الراتب + البدلات</th>}
                  <th>أقرب وثيقة تنتهي</th><th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {list.map((e) => {
                  const d = nearestDoc(e);
                  return (
                    <tr key={e.id} className="clickable" onClick={() => nav(`/employees/${e.id}`)}>
                      <td><strong>{e.name}</strong><div className="sub">{e.nationality} · {e.nationalId}</div></td>
                      <td>{JOBS[e.role]}{e.externalId && <div className="sub">{e.externalId}</div>}</td>
                      <td><span className="num">{e.phone}</span></td>
                      <td>{e.role === 'driver' ? (plate(e) || <span className="muted">—</span>) : ''}</td>
                      {showMoney && <td className="money num">{money(Number(e.baseSalary) + Number(e.allowances || 0))}</td>}
                      <td>{d ? <><span className="sub">{d.label}</span> <ExpiryBadge date={d.expiry} /></> : '—'}</td>
                      <td><Badge tone={EMP_STATUS[e.status].tone}>{EMP_STATUS[e.status].label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {form && <EmployeeForm onClose={() => setForm(null)} showMoney={showMoney} />}
    </>
  );
}

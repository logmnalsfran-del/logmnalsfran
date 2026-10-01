import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDb, useSession } from '../lib/db';
import { PageHeader, Card, Button, Badge, ExpiryBadge, SearchBox, Tabs, Empty } from '../components/ui';
import VehicleForm from '../components/VehicleForm';
import { VEH_STATUS } from '../lib/constants';
import { currentCustody, vehicleCosts } from '../lib/calc';
import { money, fmtInt } from '../lib/format';
import { canEdit, seesMoney } from '../lib/permissions';
import { downloadCSV } from '../lib/export';
import { entriesOf } from '../lib/lookups';

function nearestDoc(v) {
  return entriesOf('vehDocs')
    .map(([k, label]) => ({ label, expiry: v.docs?.[k]?.expiry }))
    .filter((d) => d.expiry)
    .sort((a, b) => a.expiry.localeCompare(b.expiry))[0];
}

export default function Vehicles() {
  const db = useDb();
  const { role } = useSession();
  const nav = useNavigate();
  const [tab, setTab] = useState('fleet');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const editable = canEdit(role, 'vehicles');
  const showMoney = seesMoney(role);

  const list = useMemo(() => db.vehicles
    .filter((v) => (tab === 'fleet' ? v.status !== 'sold' : tab === 'all' ? true : v.status === tab))
    .filter((v) => !q || [v.plate, v.make, v.model, v.vin].some((x) => String(x || '').includes(q)))
    .sort((a, b) => a.plate.localeCompare(b.plate, 'ar')), [db.vehicles, tab, q]);

  const driverName = (v) => {
    const c = currentCustody(db, v.id);
    return c ? db.employees.find((e) => e.id === c.employeeId)?.name : null;
  };
  const count = (s) => db.vehicles.filter((v) => (s === 'fleet' ? v.status !== 'sold' : v.status === s)).length;

  const exportCsv = () => downloadCSV('السيارات', ['اللوحة', 'الماركة', 'الموديل', 'السنة', 'الحالة', 'المندوب', 'العداد', ...(showMoney ? ['سعر الشراء', 'تكاليف التشغيل', 'إجمالي التكلفة'] : []), 'انتهاء الاستمارة', 'انتهاء التأمين', 'انتهاء الفحص', 'انتهاء بطاقة التشغيل'],
    list.map((v) => {
      const c = vehicleCosts(db, v);
      return [v.plate, v.make, v.model, v.year, VEH_STATUS[v.status].label, driverName(v) || '', v.odometer, ...(showMoney ? [c.purchase, c.running, c.total] : []),
        v.docs?.registration?.expiry, v.docs?.insurance?.expiry, v.docs?.inspection?.expiry, v.docs?.operatingCard?.expiry];
    }));

  return (
    <>
      <PageHeader title="السيارات" subtitle="أسطول الشركة: الشراء، الوثائق، العهدة، والتكاليف">
        <Button variant="ghost" icon="download" onClick={exportCsv}>تصدير Excel</Button>
        {editable && <Button icon="plus" onClick={() => setAdding(true)}>إضافة سيارة</Button>}
      </PageHeader>

      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'fleet', label: 'الأسطول الحالي', count: count('fleet') },
        { key: 'active', label: 'في الخدمة', count: count('active') },
        { key: 'workshop', label: 'في الورشة', count: count('workshop') },
        { key: 'stopped', label: 'متوقفة', count: count('stopped') },
        { key: 'sold', label: 'مباعة / مشطوبة', count: count('sold') },
      ]} />
      <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="بحث باللوحة أو الموديل" /></div>

      <Card flush>
        {list.length === 0 ? <Empty>لا توجد سيارات</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>اللوحة</th><th>السيارة</th><th>المندوب</th><th>العداد</th><th>أقرب وثيقة تنتهي</th>
                  {showMoney && <th className="money">إجمالي التكلفة</th>}<th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {list.map((v) => {
                  const d = nearestDoc(v);
                  const name = driverName(v);
                  return (
                    <tr key={v.id} className="clickable" onClick={() => nav(`/vehicles/${v.id}`)}>
                      <td><strong>{v.plate}</strong></td>
                      <td>{v.make} {v.model}<div className="sub">{v.year} · {v.color}</div></td>
                      <td>{name || <span className="muted">بدون عهدة</span>}</td>
                      <td><span className="num">{fmtInt(v.odometer)}</span> كم</td>
                      <td>{d ? <><span className="sub">{d.label}</span> <ExpiryBadge date={d.expiry} /></> : '—'}</td>
                      {showMoney && <td className="money num">{money(vehicleCosts(db, v).total)}</td>}
                      <td><Badge tone={VEH_STATUS[v.status].tone}>{VEH_STATUS[v.status].label}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {adding && <VehicleForm onClose={() => setAdding(false)} showMoney={showMoney} />}
    </>
  );
}

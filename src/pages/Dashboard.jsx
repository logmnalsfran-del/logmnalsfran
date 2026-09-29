import { Link } from 'react-router-dom';
import { useDb, useSession } from '../lib/db';
import { PageHeader, Stat, Card, Badge, Bar, Empty } from '../components/ui';
import {
  alerts, shipmentsByEmployee, payrollFor, profitFor, reserveBalance, expensesByCategory, incentiveRuleFor, currentCustody,
} from '../lib/calc';
import { thisMonth, monthLabel, money, fmtInt, fmtDate, today } from '../lib/format';
import { VEH_STATUS } from '../lib/constants';
import { seesMoney } from '../lib/permissions';

export default function Dashboard() {
  const db = useDb();
  const { role } = useSession();
  const M = thisMonth();
  const money_ = seesMoney(role);

  const emps = db.employees.filter((e) => e.status !== 'terminated');
  const drivers = emps.filter((e) => e.role === 'driver');
  const vehicles = db.vehicles.filter((v) => v.status !== 'sold');
  const counts = shipmentsByEmployee(db, M);
  const monthShipments = Object.values(counts).reduce((s, n) => s + n, 0);
  const todayShipments = db.shipments.filter((s) => s.date === today()).reduce((s, x) => s + Number(x.count), 0);
  const rule = incentiveRuleFor(db, M);
  const al = alerts(db);
  const pay = money_ ? payrollFor(db, M) : null;
  const profit = money_ ? profitFor(db, M) : null;
  const cats = money_ ? expensesByCategory(db, M) : [];
  const lastClosed = [...db.closedMonths].sort((a, b) => b.month.localeCompare(a.month))[0];
  const maxCat = Math.max(1, ...cats.map((c) => c.amount));

  const ranking = drivers.map((d) => ({ d, n: counts[d.id] || 0 })).sort((a, b) => b.n - a.n);
  const maxN = Math.max(rule.threshold, ...ranking.map((r) => r.n));

  const statusCount = Object.keys(VEH_STATUS).map((k) => ({ k, n: db.vehicles.filter((v) => v.status === k).length }));

  return (
    <>
      <PageHeader title="لوحة التحكم" subtitle={`ملخص شهر ${monthLabel(M)}`} />

      <div className="stats">
        <Stat icon="users" label="الموظفون على رأس العمل" value={fmtInt(emps.filter((e) => e.status === 'active').length)} hint={`${drivers.length} مندوب`} />
        <Stat icon="truck" tone="teal" label="السيارات في الخدمة" value={`${db.vehicles.filter((v) => v.status === 'active').length} من ${vehicles.length}`} hint={`${db.vehicles.filter((v) => v.status === 'workshop').length} في الورشة`} />
        <Stat icon="box" tone="orange" label="شحنات الشهر" value={fmtInt(monthShipments)} hint={`اليوم: ${fmtInt(todayShipments)}`} />
        <Stat icon="bell" tone={al.some((a) => a.level === 'expired') ? 'red' : 'orange'} label="تنبيهات تحتاج متابعة" value={fmtInt(al.length)} hint={`${al.filter((a) => a.level === 'expired').length} منتهية`} />
        {money_ && <>
          <Stat icon="wallet" label="رواتب الشهر" value={money(pay.total)} hint={pay.approved ? 'معتمدة' : 'تقديرية حتى الاعتماد'} />
          <Stat icon="receipt" tone="red" label="مصروفات الشهر" value={money(profit.expenses)} hint="شاملة الرواتب" />
          {lastClosed
            ? <Stat icon="coins" tone={lastClosed.net >= 0 ? 'green' : 'red'} label={`صافي ربح ${monthLabel(lastClosed.month)}`} value={money(lastClosed.net)} hint={`آخر شهر مُقفل · بعد مخصص هالك ${money(lastClosed.provision)}`} />
            : <Stat icon="coins" tone={profit.net >= 0 ? 'green' : 'red'} label="صافي الربح (حتى الآن)" value={money(profit.net)} hint={`بعد مخصص هالك ${money(profit.provision)}`} />}
          <Stat icon="lock" tone="teal" label="رصيد حساب مخصص الهالك" value={money(reserveBalance(db))} hint="حساب منفصل" />
        </>}
      </div>

      <div className="grid grid-2">
        <Card title="التنبيهات" actions={<Badge tone="orange">خلال {db.settings.alertDays} يوماً</Badge>}>
          {al.length === 0 ? <Empty>لا توجد تنبيهات</Empty> : (
            <ul className="alert-list">
              {al.slice(0, 9).map((a, i) => (
                <li key={i}>
                  <span className={`dot ${a.level}`} />
                  <Link to={a.kind === 'employee' ? `/employees/${a.refId}` : `/vehicles/${a.refId}`} style={{ flex: 1 }}>{a.title}</Link>
                  <span className="small muted nowrap">
                    {a.kind === 'maintenance'
                      ? (a.kmLeft !== null && a.kmLeft !== undefined ? (a.kmLeft <= 0 ? `متأخرة ${fmtInt(-a.kmLeft)} كم` : `باقي ${fmtInt(a.kmLeft)} كم`) : fmtDate(a.date))
                      : a.left < 0 ? `منتهية منذ ${-a.left} يوم` : `باقي ${a.left} يوم`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {al.length > 9 && <p className="small muted">و {al.length - 9} تنبيهات أخرى…</p>}
        </Card>

        <Card title="أداء المناديب هذا الشهر" actions={<span className="small muted">الحد: {fmtInt(rule.threshold)} شحنة · {rule.rate} ر.س للإضافية</span>}>
          <table className="table compact">
            <tbody>
              {ranking.map(({ d, n }) => (
                <tr key={d.id}>
                  <td style={{ width: '42%' }}><Link to={`/employees/${d.id}`}>{d.name}</Link></td>
                  <td><Bar value={n} max={maxN} tone={n > rule.threshold ? 'teal' : 'navy'} /></td>
                  <td className="money"><span className="num strong">{fmtInt(n)}</span></td>
                  <td style={{ width: 90 }}>{n > rule.threshold ? <Badge tone="teal">+{fmtInt(n - rule.threshold)}</Badge> : <span className="small muted">باقي {fmtInt(rule.threshold - n)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="حالة الأسطول">
          <div className="stats" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))', marginBottom: 12 }}>
            {statusCount.map(({ k, n }) => (
              <div key={k} style={{ textAlign: 'center' }}>
                <div className="stat-value">{n}</div>
                <Badge tone={VEH_STATUS[k].tone}>{VEH_STATUS[k].label}</Badge>
              </div>
            ))}
          </div>
          <table className="table compact">
            <thead><tr><th>السيارة</th><th>المندوب</th><th>العداد</th></tr></thead>
            <tbody>
              {vehicles.slice(0, 10).map((v) => {
                const c = currentCustody(db, v.id);
                const emp = c && db.employees.find((e) => e.id === c.employeeId);
                return (
                  <tr key={v.id}>
                    <td><Link to={`/vehicles/${v.id}`}>{v.plate}</Link> <span className="sub">{v.make} {v.model}</span></td>
                    <td>{emp ? emp.name : <span className="muted">بدون عهدة</span>}</td>
                    <td><span className="num">{fmtInt(v.odometer)}</span> كم</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        {money_ && (
          <Card title="توزيع مصروفات الشهر" actions={<Link to="/expenses" className="small">التفاصيل</Link>}>
            {cats.length === 0 ? <Empty /> : (
              <table className="table compact">
                <tbody>
                  {cats.map((c) => (
                    <tr key={c.categoryId}>
                      <td style={{ width: '40%' }}>{c.name}</td>
                      <td><Bar value={c.amount} max={maxCat} tone="orange" /></td>
                      <td className="money num">{money(c.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDb, insert, update, remove, getState } from '../lib/db';
import {
  PageHeader, Card, Button, Badge, MonthSelect, Stat, Tabs, Empty, IconButton, Modal, Field, FormGrid, useForm, Notice,
} from '../components/ui';
import {
  profitFor, revenueFor, expensesByCategory, provisionFor, depreciationBreakdown, reserveBalance, isClosed, payrollFor,
  totalExpenses, monthSeries,
} from '../lib/calc';
import { thisMonth, monthLabel, money, fmtDate, round2, today, monthOf, addMonths } from '../lib/format';
import { downloadCSV, printPage } from '../lib/export';

export default function Finance() {
  const db = useDb();
  const [month, setMonth] = useState(addMonths(thisMonth(), 0));
  const [tab, setTab] = useState('pl');
  const [modal, setModal] = useState(null);
  const p = profitFor(db, month);
  const rev = revenueFor(db, month);
  const cats = expensesByCategory(db, month);
  const closed = isClosed(db, month);
  const balance = reserveBalance(db);
  const dep = db.settings.depreciation || {};

  const closeMonth = () => {
    const pay = payrollFor(db, month);
    const warn = [];
    if (!pay.approved) warn.push('• مسيّر رواتب الشهر غير معتمد (سيُعتمد تلقائياً بالأرقام الحالية).');
    if (!rev.total) warn.push('• لا توجد إيرادات مسجلة لهذا الشهر.');
    if (month >= thisMonth()) warn.push('• الشهر لم ينتهِ بعد.');
    const provision = provisionFor(db, month);
    const msg = `إقفال شهر ${monthLabel(month)}؟\n\nصافي الربح: ${money(p.net)}\nسيُرحَّل مخصص الهالك (${money(provision)}) إلى حساب المخصص المنفصل.\nبعد الإقفال لا يمكن تعديل حركات هذا الشهر.${warn.length ? `\n\nتنبيه:\n${warn.join('\n')}` : ''}`;
    if (!window.confirm(msg)) return;
    if (!pay.approved) {
      insert('payrollRuns', { month, approvedAt: new Date().toISOString(), approvedBy: 'المالك / المدير العام', rows: pay.rows, total: pay.total }, `اعتماد مسيّر رواتب ${monthLabel(month)} (عند الإقفال)`);
    }
    const s = getState();
    const revenue = revenueFor(s, month).total;
    const expenses = totalExpenses(s, month);
    const operatingProfit = round2(revenue - expenses);
    insert('closedMonths', { month, closedAt: new Date().toISOString(), revenue, expenses, operatingProfit, provision, net: round2(operatingProfit - provision) }, `إقفال شهر ${monthLabel(month)}`);
    if (provision > 0) insert('reserve', { date: today(), month, type: 'deposit', amount: provision, note: `مخصص هالك ${monthLabel(month)}` }, `ترحيل مخصص هالك ${monthLabel(month)}: ${provision} ر.س`);
  };
  const reopen = () => {
    const later = db.closedMonths.some((c) => c.month > month);
    if (later) return alert('لا يمكن إعادة فتح شهر تليه أشهر مقفلة. أعد فتح الأشهر اللاحقة أولاً.');
    if (!window.confirm(`إعادة فتح شهر ${monthLabel(month)}؟ سيُلغى ترحيل مخصص الهالك الخاص به من الحساب المنفصل.`)) return;
    const c = db.closedMonths.find((x) => x.month === month);
    remove('closedMonths', c.id, `إعادة فتح شهر ${monthLabel(month)}`);
    db.reserve.filter((r) => r.type === 'deposit' && r.month === month).forEach((r) => remove('reserve', r.id));
  };

  const exportPL = () => {
    const months = monthSeries(12, thisMonth());
    downloadCSV('الأرباح-12-شهراً', ['الشهر', 'الإيرادات', 'المصروفات', 'الربح التشغيلي', 'مخصص الهالك', 'صافي الربح', 'الحالة'],
      months.map((m) => { const x = profitFor(db, m); return [monthLabel(m), x.revenue, x.expenses, x.operatingProfit, x.provision, x.net, x.closed ? 'مقفل' : 'مفتوح']; }));
  };

  return (
    <>
      <PageHeader title="الأرباح ومخصص الهالك" subtitle="الإيرادات − المصروفات = الربح التشغيلي، ثم يُخصم مخصص الهالك ويُرحَّل إلى حساب منفصل">
        <MonthSelect value={month} onChange={setMonth} />
        <Button variant="ghost" icon="download" onClick={exportPL}>تصدير 12 شهراً</Button>
        <Button variant="ghost" icon="printer" onClick={printPage}>طباعة / PDF</Button>
        {closed ? <Button variant="ghost" icon="lock" onClick={reopen}>إعادة فتح الشهر</Button>
          : <Button variant="accent" icon="lock" onClick={closeMonth}>إقفال الشهر وترحيل المخصص</Button>}
      </PageHeader>
      <div className="print-only"><h2>{db.settings.companyName} — قائمة الأرباح {monthLabel(month)}</h2></div>
      {closed ? <Notice tone="ok">الشهر مُقفل — الأرقام مثبّتة منذ {fmtDate(db.closedMonths.find((c) => c.month === month).closedAt.slice(0, 10))}، ومخصص الهالك مُرحَّل إلى الحساب المنفصل.</Notice>
        : <Notice tone="warn">الشهر مفتوح — الأرقام تتحدّث مع كل حركة. عند نهاية الشهر اضغط «إقفال الشهر» لتثبيت الأرقام وترحيل المخصص.</Notice>}

      <div className="stats">
        <Stat icon="coins" tone="teal" label="الإيرادات" value={money(p.revenue)} />
        <Stat icon="receipt" tone="red" label="المصروفات" value={money(p.expenses)} />
        <Stat icon="chart" label="الربح التشغيلي" value={money(p.operatingProfit)} />
        <Stat icon="truck" tone="orange" label="مخصص الهالك" value={money(p.provision)} hint={dep.method === 'fixed' ? 'مبلغ شهري ثابت' : 'قسط ثابت لكل سيارة'} />
        <Stat icon="wallet" tone={p.net >= 0 ? 'green' : 'red'} label="صافي الربح" value={money(p.net)} />
        <Stat icon="lock" tone="teal" label="رصيد حساب المخصص" value={money(balance)} hint="حساب منفصل" />
      </div>

      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'pl', label: 'قائمة الأرباح' },
        { key: 'revenue', label: 'الإيرادات', count: db.revenues.filter((r) => r.month === month).length },
        { key: 'provision', label: 'تفاصيل المخصص' },
        { key: 'reserve', label: 'حساب مخصص الهالك', count: db.reserve.length },
        { key: 'history', label: 'آخر 12 شهراً' },
      ]} />

      {tab === 'pl' && (
        <div className="grid grid-2">
          <Card title={`قائمة الأرباح — ${monthLabel(month)}`}>
            <table className="statement"><tbody>
              <tr><td className="strong">الإيرادات</td><td className="text-green">{money(p.revenue)}</td></tr>
              {!closed && db.revenues.filter((r) => r.month === month).map((r) => <tr key={r.id} className="sub"><td>{r.description}</td><td>{money(r.amount)}</td></tr>)}
              {!closed && rev.auto > 0 && <tr className="sub"><td>الشحنات × {db.settings.revenuePerShipment} ر.س (تلقائي)</td><td>{money(rev.auto)}</td></tr>}
              <tr><td className="strong">المصروفات التشغيلية</td><td className="text-red">({money(p.expenses)})</td></tr>
              {!closed && cats.map((c) => <tr key={c.categoryId} className="sub"><td>{c.name}</td><td>{money(c.amount)}</td></tr>)}
              <tr className="total"><td>الربح التشغيلي</td><td>{money(p.operatingProfit)}</td></tr>
              <tr className="provision"><td>(−) مخصص الهالك ← يُرحَّل لحساب المخصص</td><td>({money(p.provision)})</td></tr>
              <tr className="total"><td>صافي الربح</td><td className={p.net >= 0 ? 'text-green' : 'text-red'}>{money(p.net)}</td></tr>
            </tbody></table>
          </Card>
          <Card title="كيف يعمل مخصص الهالك؟">
            <ol style={{ margin: 0, paddingInlineStart: 20, lineHeight: 2 }}>
              <li>يُحسب لكل سيارة: <strong>(سعر الشراء − القيمة المتبقية) ÷ العمر الإنتاجي بالأشهر</strong>.</li>
              <li>يُخصم مجموعه من الربح التشغيلي كل شهر، فيظهر صافي الربح الحقيقي.</li>
              <li>عند إقفال الشهر يُرحَّل المبلغ إلى <strong>حساب مخصص الهالك</strong> المنفصل.</li>
              <li>يُصرف من الحساب عند شراء سيارة بديلة أو إصلاح كبير، ويُسجَّل الصرف في نفس الحساب.</li>
            </ol>
            <p className="small muted">يمكن تغيير الطريقة إلى مبلغ شهري ثابت من <Link to="/settings">الإعدادات</Link>، ويُعدَّل العمر الإنتاجي والقيمة المتبقية من بيانات كل سيارة.</p>
          </Card>
        </div>
      )}

      {tab === 'revenue' && (
        <Card flush title={`إيرادات ${monthLabel(month)}`} actions={!closed && <Button icon="plus" onClick={() => setModal({ type: 'revenue' })}>تسجيل إيراد</Button>}>
          {db.settings.revenuePerShipment > 0 && <div style={{ padding: '12px 20px 0' }}><Notice>يُضاف تلقائياً: عدد الشحنات × {db.settings.revenuePerShipment} ر.س = {money(rev.auto)}</Notice></div>}
          {db.revenues.filter((r) => r.month === month).length === 0 ? <Empty>لا توجد إيرادات مسجلة لهذا الشهر</Empty> : (
            <table className="table">
              <thead><tr><th>تاريخ الاستلام</th><th>البيان</th><th>المصدر</th><th className="money">المبلغ</th><th /></tr></thead>
              <tbody>
                {db.revenues.filter((r) => r.month === month).map((r) => (
                  <tr key={r.id}>
                    <td>{fmtDate(r.date)}</td><td>{r.description}</td><td>{r.source}</td><td className="money num">{money(r.amount)}</td>
                    <td>{!closed && <div className="actions">
                      <IconButton icon="edit" title="تعديل" onClick={() => setModal({ type: 'revenue', record: r })} />
                      <IconButton icon="trash" tone="red" title="حذف" onClick={() => window.confirm('حذف الإيراد؟') && remove('revenues', r.id, `حذف إيراد ${r.description}`)} />
                    </div>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={3}>الإجمالي</td><td className="money num">{money(rev.manual)}</td><td /></tr></tfoot>
            </table>
          )}
        </Card>
      )}

      {tab === 'provision' && (
        <Card flush title={`مخصص الهالك — ${monthLabel(month)}`}>
          {dep.method === 'fixed' ? <div style={{ padding: 20 }}><Notice>الطريقة الحالية: مبلغ شهري ثابت قدره {money(dep.fixedAmount)}.</Notice></div> : (
            <table className="table">
              <thead><tr><th>السيارة</th><th>الشهر من العمر الإنتاجي</th><th className="money">الإهلاك الشهري</th></tr></thead>
              <tbody>
                {depreciationBreakdown(db, month).map((d) => (
                  <tr key={d.vehicleId}><td><Link to={`/vehicles/${d.vehicleId}`}>{d.plate}</Link></td><td>{d.monthIndex} من {d.life}</td><td className="money num">{money(d.amount)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={2}>الإجمالي</td><td className="money num">{money(provisionFor(db, month))}</td></tr></tfoot>
            </table>
          )}
        </Card>
      )}

      {tab === 'reserve' && (
        <Card flush title="حساب مخصص الهالك (منفصل)" actions={<Button icon="plus" variant="ghost" onClick={() => setModal({ type: 'withdraw' })}>صرف من الحساب</Button>}>
          <div style={{ padding: '12px 20px 0' }}><Notice tone="ok">الرصيد الحالي: <strong>{money(balance)}</strong></Notice></div>
          {db.reserve.length === 0 ? <Empty>لا توجد حركات بعد</Empty> : (
            <table className="table">
              <thead><tr><th>التاريخ</th><th>البيان</th><th className="money">إيداع</th><th className="money">صرف</th><th className="money">الرصيد</th><th /></tr></thead>
              <tbody>
                {(() => {
                  let run = 0;
                  return [...db.reserve].sort((a, b) => (a.date + a.createdAt).localeCompare(b.date + b.createdAt)).map((r) => {
                    run = round2(run + (r.type === 'deposit' ? 1 : -1) * Number(r.amount));
                    return (
                      <tr key={r.id}>
                        <td>{fmtDate(r.date)}</td><td>{r.note}</td>
                        <td className="money num text-green">{r.type === 'deposit' ? money(r.amount) : ''}</td>
                        <td className="money num text-red">{r.type === 'withdrawal' ? money(r.amount) : ''}</td>
                        <td className="money num strong">{money(run)}</td>
                        <td>{r.type === 'withdrawal' && <IconButton icon="trash" tone="red" title="حذف" onClick={() => window.confirm('حذف عملية الصرف؟') && remove('reserve', r.id, `حذف صرف من حساب المخصص: ${r.note}`)} />}</td>
                      </tr>
                    );
                  }).reverse();
                })()}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === 'history' && (
        <Card flush>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>الشهر</th><th className="money">الإيرادات</th><th className="money">المصروفات</th><th className="money">الربح التشغيلي</th><th className="money">مخصص الهالك</th><th className="money">صافي الربح</th><th>الحالة</th></tr></thead>
              <tbody>
                {monthSeries(12, thisMonth()).reverse().map((m) => {
                  const x = profitFor(db, m);
                  if (!x.revenue && !x.expenses) return null;
                  return (
                    <tr key={m} className="clickable" onClick={() => { setMonth(m); setTab('pl'); }}>
                      <td>{monthLabel(m)}</td><td className="money num">{money(x.revenue)}</td><td className="money num">{money(x.expenses)}</td>
                      <td className="money num">{money(x.operatingProfit)}</td><td className="money num text-orange">{money(x.provision)}</td>
                      <td className={`money num strong ${x.net >= 0 ? 'text-green' : 'text-red'}`}>{money(x.net)}</td>
                      <td>{x.closed ? <Badge tone="teal">مقفل</Badge> : <Badge tone="orange">مفتوح</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {modal?.type === 'revenue' && <RevenueForm record={modal.record} month={month} onClose={() => setModal(null)} />}
      {modal?.type === 'withdraw' && <WithdrawForm balance={balance} onClose={() => setModal(null)} />}
    </>
  );
}

function RevenueForm({ record, month, onClose }) {
  const { values: v, bind } = useForm(record || { month, date: today(), amount: '', description: 'مستحقات الشركة الرئيسية عن الشحنات', source: 'الشركة الرئيسية' });
  const save = () => {
    if (!Number(v.amount)) return alert('أدخل المبلغ');
    if (isClosed(getState(), v.month)) return alert('الشهر المختار مُقفل.');
    const data = { ...v, amount: Number(v.amount) };
    if (record) update('revenues', record.id, data, `تعديل إيراد ${data.description} (${data.amount} ر.س)`);
    else insert('revenues', data, `إيراد ${data.description} (${data.amount} ر.س) لشهر ${data.month}`);
    onClose();
  };
  return (
    <Modal title={record ? 'تعديل إيراد' : 'تسجيل إيراد'} onClose={onClose}
      footer={<><Button icon="check" onClick={save}>حفظ</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <FormGrid cols={2}>
        <Field label="عن شهر" type="month" {...bind('month')} hint="الشهر الذي يُحتسب فيه الإيراد" />
        <Field label="تاريخ الاستلام" type="date" {...bind('date')} />
        <Field label="البيان" {...bind('description')} span={2} />
        <Field label="المصدر" {...bind('source')} />
        <Field label="المبلغ (ر.س) *" type="number" min="0" {...bind('amount')} />
      </FormGrid>
    </Modal>
  );
}

function WithdrawForm({ balance, onClose }) {
  const { values: v, bind } = useForm({ date: today(), amount: '', note: 'شراء سيارة بديلة' });
  const save = () => {
    const amount = Number(v.amount);
    if (!amount) return alert('أدخل المبلغ');
    if (amount > balance) return alert(`المبلغ أكبر من رصيد الحساب (${money(balance)})`);
    insert('reserve', { date: v.date, month: monthOf(v.date), type: 'withdrawal', amount, note: v.note }, `صرف من حساب مخصص الهالك: ${amount} ر.س — ${v.note}`);
    onClose();
  };
  return (
    <Modal title="صرف من حساب مخصص الهالك" onClose={onClose}
      footer={<><Button icon="check" onClick={save}>تسجيل الصرف</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <Notice>الرصيد المتاح: <strong>{money(balance)}</strong></Notice>
      <FormGrid cols={2}>
        <Field label="التاريخ" type="date" {...bind('date')} />
        <Field label="المبلغ (ر.س)" type="number" min="0" {...bind('amount')} />
        <Field label="الغرض" {...bind('note')} span={2} />
      </FormGrid>
    </Modal>
  );
}

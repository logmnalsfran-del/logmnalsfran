import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDb, insert, update, remove, getState } from '../lib/db';
import {
  PageHeader, Card, Button, Badge, MonthSelect, Stat, Tabs, Empty, IconButton, Modal, Field, FormGrid, useForm, Notice, Bar,
} from '../components/ui';
import {
  profitFor, revenueFor, expensesByCategory, provisionFor, recoveryBreakdown, reserveBalance, capitalStatus, suggestedRecoveryPct,
  isClosed, payrollFor, totalExpenses, monthSeries,
} from '../lib/calc';
import { thisMonth, monthLabel, money, fmtDate, round2, today, monthOf, fmt } from '../lib/format';
import { downloadCSV, printPage } from '../lib/export';

export default function Finance() {
  const db = useDb();
  const [month, setMonth] = useState(thisMonth());
  const [tab, setTab] = useState('pl');
  const [modal, setModal] = useState(null);
  const p = profitFor(db, month);
  const rev = revenueFor(db, month);
  const cats = expensesByCategory(db, month);
  const closed = isClosed(db, month);
  const balance = reserveBalance(db);
  const cap = capitalStatus(db);
  const breakdown = recoveryBreakdown(db, month);
  const monthRevenues = db.revenues.filter((r) => r.month === month);
  const avgPct = p.revenue > 0 ? round2((p.provision / p.revenue) * 100) : 0;

  const closeMonth = () => {
    const pay = payrollFor(db, month);
    const warn = [];
    if (!pay.approved) warn.push('• مسيّر رواتب الشهر غير معتمد (سيُعتمد تلقائياً بالأرقام الحالية).');
    if (!rev.total) warn.push('• لا توجد إيرادات مسجلة لهذا الشهر.');
    if (rev.total && !provisionFor(db, month)) warn.push('• نسبة استرداد رأس المال لإيرادات هذا الشهر = 0%.');
    if (month >= thisMonth()) warn.push('• الشهر لم ينتهِ بعد.');
    const provision = provisionFor(db, month);
    const msg = `إقفال شهر ${monthLabel(month)}؟\n\nصافي الربح: ${money(p.net)}\nسيُرحَّل مبلغ استرداد رأس المال (${money(provision)}) إلى الحساب المنفصل.\nبعد الإقفال لا يمكن تعديل حركات هذا الشهر.${warn.length ? `\n\nتنبيه:\n${warn.join('\n')}` : ''}`;
    if (!window.confirm(msg)) return;
    if (!pay.approved) {
      insert('payrollRuns', { month, approvedAt: new Date().toISOString(), approvedBy: 'المالك / المدير العام', rows: pay.rows, total: pay.total }, `اعتماد مسيّر رواتب ${monthLabel(month)} (عند الإقفال)`);
    }
    const s = getState();
    const revenue = revenueFor(s, month).total;
    const expenses = totalExpenses(s, month);
    const operatingProfit = round2(revenue - expenses);
    insert('closedMonths', { month, closedAt: new Date().toISOString(), revenue, expenses, operatingProfit, provision, net: round2(operatingProfit - provision) }, `إقفال شهر ${monthLabel(month)}`);
    if (provision > 0) insert('reserve', { date: today(), month, type: 'deposit', amount: provision, note: `استرداد رأس المال — ${monthLabel(month)}` }, `ترحيل ${provision} ر.س إلى حساب استرداد رأس المال عن ${monthLabel(month)}`);
  };
  const reopen = () => {
    const later = db.closedMonths.some((c) => c.month > month);
    if (later) return alert('لا يمكن إعادة فتح شهر تليه أشهر مقفلة. أعد فتح الأشهر اللاحقة أولاً.');
    if (!window.confirm(`إعادة فتح شهر ${monthLabel(month)}؟ سيُلغى ترحيل مبلغ استرداد رأس المال الخاص به من الحساب المنفصل.`)) return;
    const c = db.closedMonths.find((x) => x.month === month);
    remove('closedMonths', c.id, `إعادة فتح شهر ${monthLabel(month)}`);
    db.reserve.filter((r) => r.type === 'deposit' && r.month === month).forEach((r) => remove('reserve', r.id));
  };

  const exportPL = () => {
    const months = monthSeries(12, thisMonth());
    downloadCSV('الأرباح-12-شهراً', ['الشهر', 'الإيرادات', 'المصروفات', 'الربح التشغيلي', 'استرداد رأس المال', 'النسبة من الإيراد %', 'صافي الربح', 'الحالة'],
      months.map((m) => { const x = profitFor(db, m); return [monthLabel(m), x.revenue, x.expenses, x.operatingProfit, x.provision, x.revenue ? round2((x.provision / x.revenue) * 100) : 0, x.net, x.closed ? 'مقفل' : 'مفتوح']; }));
  };

  return (
    <>
      <PageHeader title="الأرباح واسترداد رأس المال" subtitle="الإيرادات − المصروفات = الربح التشغيلي، ثم تُستقطع نسبة استرداد رأس المال وتُرحَّل إلى حساب منفصل">
        <MonthSelect value={month} onChange={setMonth} />
        <Button variant="ghost" icon="download" onClick={exportPL}>تصدير 12 شهراً</Button>
        <Button variant="ghost" icon="printer" onClick={printPage}>طباعة / PDF</Button>
        {closed ? <Button variant="ghost" icon="lock" onClick={reopen}>إعادة فتح الشهر</Button>
          : <Button variant="accent" icon="lock" onClick={closeMonth}>إقفال الشهر وترحيل المبلغ</Button>}
      </PageHeader>
      <div className="print-only"><h2>{db.settings.companyName} — قائمة الأرباح {monthLabel(month)}</h2></div>
      {closed ? <Notice tone="ok">الشهر مُقفل — الأرقام مثبّتة منذ {fmtDate(db.closedMonths.find((c) => c.month === month).closedAt.slice(0, 10))}، ومبلغ استرداد رأس المال مُرحَّل إلى الحساب المنفصل.</Notice>
        : <Notice tone="warn">الشهر مفتوح — الأرقام تتحدّث مع كل حركة. عند نهاية الشهر اضغط «إقفال الشهر» لتثبيت الأرقام وترحيل المبلغ إلى حساب استرداد رأس المال.</Notice>}

      <div className="stats">
        <Stat icon="coins" tone="teal" label="الإيرادات" value={money(p.revenue)} />
        <Stat icon="receipt" tone="red" label="المصروفات" value={money(p.expenses)} />
        <Stat icon="chart" label="الربح التشغيلي" value={money(p.operatingProfit)} />
        <Stat icon="truck" tone="orange" label="استرداد رأس المال" value={money(p.provision)} hint={p.revenue ? `${fmt(avgPct)}% من إيراد الشهر` : 'حدّد النسبة عند تسجيل الإيراد'} />
        <Stat icon="wallet" tone={p.net >= 0 ? 'green' : 'red'} label="صافي الربح" value={money(p.net)} />
        <Stat icon="lock" tone="teal" label="رصيد حساب استرداد رأس المال" value={money(balance)} hint={cap.capital ? `استُرد ${fmt(round2(cap.pct))}% من رأس المال` : 'حساب منفصل'} />
      </div>

      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'pl', label: 'قائمة الأرباح' },
        { key: 'revenue', label: 'الإيرادات ونسبة الاستقطاع', count: monthRevenues.length },
        { key: 'reserve', label: 'حساب استرداد رأس المال', count: db.reserve.length },
        { key: 'history', label: 'آخر 12 شهراً' },
      ]} />

      {tab === 'pl' && (
        <div className="grid grid-2">
          <Card title={`قائمة الأرباح — ${monthLabel(month)}`}>
            <table className="statement"><tbody>
              <tr><td className="strong">الإيرادات</td><td className="text-green">{money(p.revenue)}</td></tr>
              {!closed && monthRevenues.map((r) => <tr key={r.id} className="sub"><td>{r.description}</td><td>{money(r.amount)}</td></tr>)}
              {!closed && rev.auto > 0 && <tr className="sub"><td>الشحنات × {db.settings.revenuePerShipment} ر.س (تلقائي)</td><td>{money(rev.auto)}</td></tr>}
              <tr><td className="strong">المصروفات التشغيلية</td><td className="text-red">({money(p.expenses)})</td></tr>
              {!closed && cats.map((c) => <tr key={c.categoryId} className="sub"><td>{c.name}</td><td>{money(c.amount)}</td></tr>)}
              <tr className="total"><td>الربح التشغيلي</td><td>{money(p.operatingProfit)}</td></tr>
              <tr className="provision"><td>(−) استرداد رأس المال{p.revenue ? ` (${fmt(avgPct)}% من الإيراد)` : ''} ← يُرحَّل للحساب المنفصل</td><td>({money(p.provision)})</td></tr>
              <tr className="total"><td>صافي الربح</td><td className={p.net >= 0 ? 'text-green' : 'text-red'}>{money(p.net)}</td></tr>
            </tbody></table>
          </Card>
          <Card title="كيف يعمل حساب استرداد رأس المال؟">
            <ol style={{ margin: 0, paddingInlineStart: 20, lineHeight: 2 }}>
              <li>عند <strong>تسجيل كل إيراد</strong> تحدّد نسبة منه تُستقطع لاسترداد رأس المال. النسبة تتغير من شهر لآخر كما تشاء.</li>
              <li>يُخصم المبلغ المستقطع من الربح التشغيلي، فيظهر صافي الربح بعد الاستقطاع.</li>
              <li>عند <strong>إقفال الشهر</strong> يُرحَّل المبلغ إلى <strong>حساب استرداد رأس المال</strong> المنفصل.</li>
              <li>يتابع النظام كم استُرد من رأس المال وكم بقي، ويمكن تسجيل أي صرف من الحساب.</li>
            </ol>
            <p className="small muted">النسبة الافتراضية ومبلغ رأس المال يُضبطان من <Link to="/settings">الإعدادات</Link>.</p>
          </Card>
        </div>
      )}

      {tab === 'revenue' && (
        <Card flush title={`إيرادات ${monthLabel(month)}`} actions={!closed && <Button icon="plus" onClick={() => setModal({ type: 'revenue' })}>تسجيل إيراد</Button>}>
          {breakdown.length === 0 ? <Empty>لا توجد إيرادات مسجلة لهذا الشهر</Empty> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>تاريخ الاستلام</th><th>البيان</th><th>المصدر</th><th className="money">المبلغ</th><th>نسبة الاستقطاع</th><th className="money">لحساب رأس المال</th><th className="money">الباقي</th><th /></tr></thead>
                <tbody>
                  {breakdown.map((b) => {
                    const r = monthRevenues.find((x) => x.id === b.id);
                    return (
                      <tr key={b.id}>
                        <td>{r ? fmtDate(r.date) : '—'}</td><td>{b.description}</td><td>{r?.source || 'تلقائي'}</td>
                        <td className="money num">{money(b.amount)}</td>
                        <td><Badge tone={b.pct > 0 ? 'orange' : 'gray'}>{fmt(b.pct)}%</Badge></td>
                        <td className="money num text-orange strong">{money(b.recovery)}</td>
                        <td className="money num">{money(b.amount - b.recovery)}</td>
                        <td>{r && !closed && <div className="actions">
                          <IconButton icon="edit" title="تعديل" onClick={() => setModal({ type: 'revenue', record: r })} />
                          <IconButton icon="trash" tone="red" title="حذف" onClick={() => window.confirm('حذف الإيراد؟') && remove('revenues', r.id, `حذف إيراد ${r.description}`)} />
                        </div>}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr><td colSpan={3}>الإجمالي</td><td className="money num">{money(rev.total)}</td><td>{fmt(avgPct)}%</td><td className="money num">{money(provisionFor(db, month))}</td><td className="money num">{money(rev.total - provisionFor(db, month))}</td><td /></tr></tfoot>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'reserve' && <>
        <Card title="استرداد رأس المال">
          <div className="stats" style={{ marginBottom: 12 }}>
            <Stat label={cap.manual ? 'رأس المال المستثمر (محدد يدوياً)' : 'رأس المال المستثمر (مجموع أسعار شراء السيارات)'} value={money(cap.capital)} />
            <Stat tone="teal" label="المُستردّ حتى الآن" value={money(cap.recovered)} hint={`${fmt(round2(cap.pct))}%`} />
            <Stat tone="orange" label="المتبقي للاسترداد" value={money(cap.remaining)} />
            <Stat tone="green" label="الرصيد الحالي في الحساب" value={money(balance)} hint="بعد أي صرف" />
          </div>
          <Bar value={cap.recovered} max={cap.capital} tone="teal" />
        </Card>
        <Card flush title="حركات الحساب" actions={<Button icon="plus" variant="ghost" onClick={() => setModal({ type: 'withdraw' })}>صرف من الحساب</Button>}>
          {db.reserve.length === 0 ? <Empty>لا توجد حركات بعد — تُضاف الإيداعات تلقائياً عند إقفال كل شهر</Empty> : (
            <div className="table-wrap">
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
                          <td>{r.type === 'withdrawal' && <IconButton icon="trash" tone="red" title="حذف" onClick={() => window.confirm('حذف عملية الصرف؟') && remove('reserve', r.id, `حذف صرف من حساب استرداد رأس المال: ${r.note}`)} />}</td>
                        </tr>
                      );
                    }).reverse();
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </>}

      {tab === 'history' && (
        <Card flush>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>الشهر</th><th className="money">الإيرادات</th><th className="money">المصروفات</th><th className="money">الربح التشغيلي</th><th>النسبة</th><th className="money">استرداد رأس المال</th><th className="money">صافي الربح</th><th>الحالة</th></tr></thead>
              <tbody>
                {monthSeries(12, thisMonth()).reverse().map((m) => {
                  const x = profitFor(db, m);
                  if (!x.revenue && !x.expenses) return null;
                  return (
                    <tr key={m} className="clickable" onClick={() => { setMonth(m); setTab('pl'); }}>
                      <td>{monthLabel(m)}</td><td className="money num">{money(x.revenue)}</td><td className="money num">{money(x.expenses)}</td>
                      <td className="money num">{money(x.operatingProfit)}</td>
                      <td>{x.revenue ? `${fmt(round2((x.provision / x.revenue) * 100))}%` : '—'}</td>
                      <td className="money num text-orange">{money(x.provision)}</td>
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
  const { values: v, bind } = useForm(record
    ? { recoveryPct: 0, ...record }
    : { month, date: today(), amount: '', description: 'مستحقات الشركة الرئيسية عن الشحنات', source: 'الشركة الرئيسية', recoveryPct: suggestedRecoveryPct(getState()) });
  const amount = Number(v.amount) || 0;
  const pct = Number(v.recoveryPct) || 0;
  const recovery = round2(amount * pct / 100);
  const save = () => {
    if (!amount) return alert('أدخل المبلغ');
    if (pct < 0 || pct > 100) return alert('النسبة بين 0 و 100');
    if (isClosed(getState(), v.month)) return alert('الشهر المختار مُقفل.');
    const data = { ...v, amount, recoveryPct: pct };
    if (record) update('revenues', record.id, data, `تعديل إيراد ${data.description} (${data.amount} ر.س، استقطاع ${pct}%)`);
    else insert('revenues', data, `إيراد ${data.description} (${data.amount} ر.س، استقطاع ${pct}%) لشهر ${data.month}`);
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
        <Field label="نسبة استرداد رأس المال (%)" type="number" min="0" max="100" step="0.5" {...bind('recoveryPct')} hint="تُستقطع من هذا الإيراد وتُرحَّل للحساب المنفصل عند إقفال الشهر" />
        <Field label="المبلغ المستقطع" as="custom">
          <div style={{ padding: '9px 0' }}><strong className="text-orange">{money(recovery)}</strong> <span className="muted small">· الباقي {money(amount - recovery)}</span></div>
        </Field>
      </FormGrid>
    </Modal>
  );
}

function WithdrawForm({ balance, onClose }) {
  const { values: v, bind } = useForm({ date: today(), amount: '', note: '' });
  const save = () => {
    const amount = Number(v.amount);
    if (!amount) return alert('أدخل المبلغ');
    if (!v.note.trim()) return alert('اكتب الغرض من الصرف');
    if (amount > balance) return alert(`المبلغ أكبر من رصيد الحساب (${money(balance)})`);
    insert('reserve', { date: v.date, month: monthOf(v.date), type: 'withdrawal', amount, note: v.note }, `صرف من حساب استرداد رأس المال: ${amount} ر.س — ${v.note}`);
    onClose();
  };
  return (
    <Modal title="صرف من حساب استرداد رأس المال" onClose={onClose}
      footer={<><Button icon="check" onClick={save}>تسجيل الصرف</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <Notice>الرصيد المتاح: <strong>{money(balance)}</strong></Notice>
      <FormGrid cols={2}>
        <Field label="التاريخ" type="date" {...bind('date')} />
        <Field label="المبلغ (ر.س)" type="number" min="0" {...bind('amount')} />
        <Field label="الغرض" {...bind('note')} span={2} placeholder="مثال: تسليم جزء من رأس المال للمالك" />
      </FormGrid>
    </Modal>
  );
}

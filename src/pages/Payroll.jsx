import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDb, insert, remove } from '../lib/db';
import {
  PageHeader, Card, Button, Badge, MonthSelect, Stat, Notice, Modal, Field, FormGrid, useForm, IconButton, Empty,
} from '../components/ui';
import { payrollFor, computePayroll, incentiveRuleFor, isClosed } from '../lib/calc';
import { thisMonth, monthLabel, money, fmtInt, round2, fmtDate } from '../lib/format';
import { JOBS } from '../lib/constants';
import { downloadCSV, printPage } from '../lib/export';

export default function Payroll() {
  const db = useDb();
  const [month, setMonth] = useState(thisMonth());
  const [adjFor, setAdjFor] = useState(null);
  const pay = payrollFor(db, month);
  const rule = incentiveRuleFor(db, month);
  const closed = isClosed(db, month);
  const sum = (k) => round2(pay.rows.reduce((s, r) => s + Number(r[k] || 0), 0));
  const driversOver = pay.rows.filter((r) => r.role === 'driver' && r.extra > 0).length;

  const approve = () => {
    if (!window.confirm(`اعتماد مسيّر رواتب ${monthLabel(month)} بإجمالي ${money(pay.total)}؟\nبعد الاعتماد تُثبَّت الأرقام ولا تتأثر بأي تعديل لاحق على الإعدادات.`)) return;
    const rows = computePayroll(db, month);
    insert('payrollRuns', { month, approvedAt: new Date().toISOString(), approvedBy: 'المالك / المدير العام', rows, total: round2(rows.reduce((s, r) => s + r.net, 0)) },
      `اعتماد مسيّر رواتب ${monthLabel(month)}`);
  };
  const unapprove = () => {
    if (closed) return alert('الشهر مُقفل مالياً. أعد فتحه من شاشة الأرباح أولاً.');
    if (!window.confirm('إلغاء اعتماد المسيّر وإعادته للحساب التلقائي؟')) return;
    remove('payrollRuns', pay.run.id, `إلغاء اعتماد مسيّر رواتب ${monthLabel(month)}`);
  };

  const exportCsv = () => downloadCSV(`مسير-الرواتب-${month}`,
    ['الموظف', 'الفئة', 'الراتب الأساسي', 'البدلات', 'الشحنات', 'الحد', 'الإضافية', 'قيمة الشحنة', 'الحافز', 'إضافات', 'خصومات', 'الصافي', 'الآيبان'],
    pay.rows.map((r) => [r.name, JOBS[r.role], r.base, r.allowances, r.role === 'driver' ? r.shipments : '', r.role === 'driver' ? r.threshold : '', r.role === 'driver' ? r.extra : '', r.role === 'driver' ? r.rate : '', r.incentive, r.additions, r.deductions, r.net,
      db.employees.find((e) => e.id === r.employeeId)?.iban || '']));

  return (
    <>
      <PageHeader title="مسيّر الرواتب" subtitle="الراتب الأساسي + البدلات + حافز الشحنات الإضافية + الإضافات − الخصومات">
        <MonthSelect value={month} onChange={setMonth} />
        <Button variant="ghost" icon="download" onClick={exportCsv}>تصدير Excel</Button>
        <Button variant="ghost" icon="printer" onClick={printPage}>طباعة / PDF</Button>
        {pay.approved
          ? <Button variant="ghost" icon="lock" onClick={unapprove}>إلغاء الاعتماد</Button>
          : <Button variant="accent" icon="check" onClick={approve} disabled={!pay.rows.length}>اعتماد المسيّر</Button>}
      </PageHeader>

      <div className="print-only"><h2>{db.settings.companyName} — مسيّر رواتب {monthLabel(month)}</h2></div>

      {pay.approved
        ? <Notice tone="ok">معتمد بتاريخ {fmtDate(pay.run.approvedAt.slice(0, 10))} — الأرقام مثبّتة.{closed && ' الشهر مُقفل مالياً.'}</Notice>
        : <Notice tone="warn">المسيّر تقديري ويتحدّث تلقائياً مع إدخال الشحنات. قاعدة الحافز لهذا الشهر: ما يزيد عن <strong>{fmtInt(rule.threshold)}</strong> شحنة × <strong>{rule.rate}</strong> ر.س.</Notice>}

      <div className="stats">
        <Stat icon="wallet" label="صافي الرواتب" value={money(pay.total)} hint={`${pay.rows.length} موظف`} />
        <Stat icon="coins" tone="teal" label="إجمالي الحوافز" value={money(sum('incentive'))} hint={`${driversOver} مندوب تجاوز الحد`} />
        <Stat icon="box" tone="orange" label="شحنات المناديب" value={fmtInt(sum('shipments'))} />
        <Stat icon="receipt" tone="red" label="الخصومات" value={money(sum('deductions'))} hint={`إضافات: ${money(sum('additions'))}`} />
      </div>

      <Card flush>
        {pay.rows.length === 0 ? <Empty /> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>الموظف</th><th className="money">الأساسي</th><th className="money">البدلات</th><th>الشحنات</th><th>الإضافية</th>
                  <th className="money">الحافز</th><th className="money">إضافات</th><th className="money">خصومات</th><th className="money">الصافي</th>
                  {!pay.approved && <th className="no-print" />}
                </tr>
              </thead>
              <tbody>
                {pay.rows.map((r) => (
                  <tr key={r.employeeId}>
                    <td><Link to={`/employees/${r.employeeId}`}>{r.name}</Link><div className="sub">{JOBS[r.role]}</div></td>
                    <td className="money num">{fmtInt(r.base)}</td>
                    <td className="money num">{fmtInt(r.allowances)}</td>
                    <td>{r.role === 'driver' ? <span className="num strong">{fmtInt(r.shipments)}</span> : '—'}</td>
                    <td>{r.role === 'driver' ? (r.extra > 0 ? <Badge tone="teal">{fmtInt(r.extra)} × {r.rate}</Badge> : <span className="small muted">تحت {fmtInt(r.threshold)}</span>) : '—'}{r.custom && <div className="sub">حافز خاص</div>}</td>
                    <td className="money num">{r.incentive ? money(r.incentive) : '—'}</td>
                    <td className="money num text-green">{r.additions ? fmtInt(r.additions) : '—'}</td>
                    <td className="money num text-red">{r.deductions ? fmtInt(r.deductions) : '—'}</td>
                    <td className="money num strong">{money(r.net)}</td>
                    {!pay.approved && <td className="no-print"><IconButton icon="plus" title="إضافة / خصم" onClick={() => setAdjFor(r)} /></td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>الإجمالي</td><td className="money num">{fmtInt(sum('base'))}</td><td className="money num">{fmtInt(sum('allowances'))}</td>
                  <td className="num">{fmtInt(sum('shipments'))}</td><td /><td className="money num">{money(sum('incentive'))}</td>
                  <td className="money num">{fmtInt(sum('additions'))}</td><td className="money num">{fmtInt(sum('deductions'))}</td>
                  <td className="money num">{money(pay.total)}</td>{!pay.approved && <td className="no-print" />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
      <p className="small muted">لا يوجد حد أدنى ولا احتساب بالتناسب للملتحقين خلال الشهر. المخالفات والحوادث تتحملها الشركة ولا تُخصم تلقائياً؛ أي خصم (مثل السلف) يُضاف يدوياً.</p>

      {adjFor && <AdjustmentsModal db={db} row={adjFor} month={month} onClose={() => setAdjFor(null)} />}
    </>
  );
}

function AdjustmentsModal({ db, row, month, onClose }) {
  const list = db.adjustments.filter((a) => a.employeeId === row.employeeId && a.month === month);
  const { values: v, bind, setValues } = useForm({ kind: 'deduction', label: 'سلفة', amount: '' });
  const add = () => {
    if (!Number(v.amount)) return alert('أدخل المبلغ');
    insert('adjustments', { employeeId: row.employeeId, month, kind: v.kind, label: v.label || (v.kind === 'deduction' ? 'خصم' : 'إضافة'), amount: Number(v.amount) },
      `${v.kind === 'deduction' ? 'خصم' : 'إضافة'} ${v.amount} ر.س (${v.label}) — ${row.name} — ${month}`);
    setValues({ ...v, amount: '' });
  };
  return (
    <Modal title={`الإضافات والخصومات — ${row.name} — ${monthLabel(month)}`} onClose={onClose}
      footer={<Button variant="ghost" onClick={onClose}>إغلاق</Button>}>
      <FormGrid cols={4}>
        <Field label="النوع" as="select" options={[{ value: 'deduction', label: 'خصم' }, { value: 'allowance', label: 'إضافة' }]} {...bind('kind')} />
        <Field label="البيان" {...bind('label')} placeholder="سلفة، غياب، مكافأة..." span={2} />
        <Field label="المبلغ" type="number" min="0" {...bind('amount')} />
      </FormGrid>
      <div style={{ margin: '12px 0 16px' }}><Button icon="plus" onClick={add}>إضافة</Button></div>
      {list.length === 0 ? <Empty>لا توجد إضافات أو خصومات لهذا الشهر</Empty> : (
        <table className="table compact">
          <tbody>
            {list.map((a) => (
              <tr key={a.id}>
                <td><Badge tone={a.kind === 'deduction' ? 'red' : 'green'}>{a.kind === 'deduction' ? 'خصم' : 'إضافة'}</Badge></td>
                <td>{a.label}</td><td className="money num">{money(a.amount)}</td>
                <td><IconButton icon="trash" tone="red" title="حذف" onClick={() => remove('adjustments', a.id, `حذف ${a.label} — ${row.name}`)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useDb, insert, update, remove, getState } from '../lib/db';
import {
  PageHeader, Card, Button, Badge, MonthSelect, Stat, Tabs, Empty, IconButton, Modal, Field, FormGrid, useForm, Notice, Bar,
} from '../components/ui';
import { monthExpenses, expensesByCategory, categoryName, installmentsInMonth, isClosed } from '../lib/calc';
import { thisMonth, monthLabel, money, fmtDate, round2, addMonths, today, monthOf } from '../lib/format';
import { SYSTEM_CATEGORIES } from '../lib/constants';
import { LookupField } from '../components/Lookup';
import { downloadCSV, printPage } from '../lib/export';

const SOURCES = {
  manual: { label: 'يدوي', tone: 'navy' },
  recurring: { label: 'متكرر', tone: 'teal' },
  payroll: { label: 'الرواتب', tone: 'orange', to: '/payroll' },
  maintenance: { label: 'الصيانة', tone: 'gray', to: '/operations' },
  fuel: { label: 'الوقود', tone: 'gray', to: '/operations' },
  incidents: { label: 'الحوادث', tone: 'red', to: '/operations' },
};

export default function Expenses() {
  const db = useDb();
  const [month, setMonth] = useState(thisMonth());
  const [tab, setTab] = useState('list');
  const [cat, setCat] = useState('');
  const [modal, setModal] = useState(null);
  const closed = isClosed(db, month);

  const items = monthExpenses(db, month);
  const shown = cat ? items.filter((i) => i.categoryId === cat) : items;
  const total = round2(items.reduce((s, i) => s + i.amount, 0));
  const prevTotal = round2(monthExpenses(db, addMonths(month, -1)).reduce((s, i) => s + i.amount, 0));
  const byCat = expensesByCategory(db, month);
  const prevByCat = Object.fromEntries(expensesByCategory(db, addMonths(month, -1)).map((c) => [c.categoryId, c.amount]));
  const inst = installmentsInMonth(db, month);
  const instTotal = round2(inst.reduce((s, i) => s + i.amount, 0));
  const autoTotal = round2(items.filter((i) => !['manual', 'recurring'].includes(i.source)).reduce((s, i) => s + i.amount, 0));
  const allCats = [...Object.entries(SYSTEM_CATEGORIES).map(([id, name]) => ({ id, name })), ...db.expenseCategories];

  const exportCsv = () => downloadCSV(`المصروفات-${month}`, ['التاريخ', 'الفئة', 'البيان', 'المصدر', 'المبلغ'],
    [...shown.map((i) => [i.date, categoryName(db, i.categoryId), i.description, SOURCES[i.source].label + (i.estimated ? ' (تقديري)' : ''), i.amount]), ['', '', 'الإجمالي', '', round2(shown.reduce((s, i) => s + i.amount, 0))]]);

  return (
    <>
      <PageHeader title="المصروفات الشهرية" subtitle="قائمة موحّدة لكل مصروفات الشهر: اليدوية والمتكررة وما يتولّد تلقائياً من الرواتب والصيانة والوقود والحوادث">
        <MonthSelect value={month} onChange={setMonth} />
        <Button variant="ghost" icon="download" onClick={exportCsv}>تصدير Excel</Button>
        <Button variant="ghost" icon="printer" onClick={printPage}>طباعة / PDF</Button>
        {!closed && <Button icon="plus" onClick={() => setModal({ type: 'expense' })}>إضافة مصروف</Button>}
      </PageHeader>
      <div className="print-only"><h2>{db.settings.companyName} — مصروفات {monthLabel(month)}</h2></div>
      {closed && <Notice tone="warn">شهر {monthLabel(month)} مُقفل مالياً — العرض فقط.</Notice>}

      <div className="stats">
        <Stat icon="receipt" tone="red" label="إجمالي مصروفات الشهر" value={money(total)}
          hint={prevTotal ? `${total >= prevTotal ? '▲' : '▼'} ${money(Math.abs(total - prevTotal))} عن الشهر السابق` : ''} />
        <Stat icon="wallet" tone="orange" label="من وحدات النظام (تلقائي)" value={money(autoTotal)} hint="رواتب، صيانة، وقود، حوادث" />
        <Stat icon="edit" label="يدوية ومتكررة" value={money(round2(total - autoTotal))} />
        <Stat icon="truck" tone="gray" label="أقساط السيارات (التزام نقدي)" value={money(instTotal)} hint="خارج المصروفات التشغيلية" />
      </div>

      <Tabs active={tab} onChange={setTab} tabs={[
        { key: 'list', label: 'قائمة الشهر', count: items.length },
        { key: 'cats', label: 'حسب الفئة' },
        { key: 'recurring', label: 'المصروفات المتكررة', count: db.recurring.length },
        { key: 'installments', label: 'أقساط السيارات', count: inst.length },
        { key: 'categories', label: 'إدارة الفئات' },
      ]} />

      {tab === 'list' && <>
        <div className="toolbar">
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="الفئة">
            <option value="">كل الفئات</option>
            {allCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <Card flush>
          {shown.length === 0 ? <Empty>لا توجد مصروفات</Empty> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>التاريخ</th><th>الفئة</th><th>البيان</th><th>المصدر</th><th className="money">المبلغ</th><th className="no-print" /></tr></thead>
                <tbody>
                  {shown.map((i) => {
                    const src = SOURCES[i.source];
                    return (
                      <tr key={i.key}>
                        <td className="nowrap">{fmtDate(i.date)}</td>
                        <td>{categoryName(db, i.categoryId)}</td>
                        <td>{i.description}</td>
                        <td><Badge tone={src.tone}>{src.label}</Badge>{i.estimated && <div className="sub">تقديري</div>}</td>
                        <td className="money num">{money(i.amount)}</td>
                        <td className="no-print"><div className="actions">
                          {i.source === 'manual' && !closed && <>
                            <IconButton icon="edit" title="تعديل" onClick={() => setModal({ type: 'expense', record: db.expenses.find((e) => e.id === i.refId) })} />
                            <IconButton icon="trash" tone="red" title="حذف" onClick={() => window.confirm('حذف المصروف؟') && remove('expenses', i.refId, `حذف مصروف ${i.description} (${i.amount} ر.س)`)} />
                          </>}
                          {i.source === 'recurring' && <IconButton icon="edit" title="تعديل القالب" onClick={() => setModal({ type: 'recurring', record: db.recurring.find((r) => r.id === i.refId) })} />}
                          {src.to && <Link to={src.to} className="small">فتح</Link>}
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr><td colSpan={4}>الإجمالي</td><td className="money num">{money(shown.reduce((s, i) => s + i.amount, 0))}</td><td className="no-print" /></tr></tfoot>
              </table>
            </div>
          )}
        </Card>
      </>}

      {tab === 'cats' && (
        <Card flush>
          <table className="table">
            <thead><tr><th>الفئة</th><th style={{ width: '30%' }}>النسبة</th><th className="money">الشهر السابق</th><th className="money">هذا الشهر</th><th>التغيّر</th></tr></thead>
            <tbody>
              {byCat.map((c) => {
                const prev = prevByCat[c.categoryId] || 0;
                const diff = round2(c.amount - prev);
                return (
                  <tr key={c.categoryId}>
                    <td>{c.name}</td>
                    <td><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Bar value={c.amount} max={total} tone="orange" /><span className="small num">{total ? Math.round((c.amount / total) * 100) : 0}%</span></div></td>
                    <td className="money num muted">{money(prev)}</td>
                    <td className="money num strong">{money(c.amount)}</td>
                    <td className={diff > 0 ? 'text-red' : diff < 0 ? 'text-green' : 'muted'}>{diff === 0 ? '—' : `${diff > 0 ? '▲' : '▼'} ${money(Math.abs(diff))}`}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td colSpan={2}>الإجمالي</td><td className="money num">{money(prevTotal)}</td><td className="money num">{money(total)}</td><td /></tr></tfoot>
          </table>
        </Card>
      )}

      {tab === 'recurring' && (
        <Card flush title="قوالب تتكرر تلقائياً كل شهر" actions={<Button icon="plus" onClick={() => setModal({ type: 'recurring' })}>إضافة مصروف متكرر</Button>}>
          {db.recurring.length === 0 ? <Empty /> : (
            <table className="table">
              <thead><tr><th>البيان</th><th>الفئة</th><th>يوم الاستحقاق</th><th>من</th><th>إلى</th><th className="money">المبلغ الشهري</th><th /></tr></thead>
              <tbody>
                {db.recurring.map((r) => (
                  <tr key={r.id}>
                    <td>{r.description}</td><td>{categoryName(db, r.categoryId)}</td><td>{r.day}</td>
                    <td>{monthLabel(r.startMonth)}</td><td>{r.endMonth ? monthLabel(r.endMonth) : <Badge tone="green">مستمر</Badge>}</td>
                    <td className="money num">{money(r.amount)}</td>
                    <td><div className="actions">
                      <IconButton icon="edit" title="تعديل" onClick={() => setModal({ type: 'recurring', record: r })} />
                      <IconButton icon="trash" tone="red" title="إيقاف" onClick={() => {
                        if (!window.confirm('إيقاف هذا المصروف المتكرر اعتباراً من الشهر القادم؟ (تبقى الأشهر السابقة كما هي)')) return;
                        update('recurring', r.id, { endMonth: thisMonth() }, `إيقاف المصروف المتكرر ${r.description}`);
                      }} />
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === 'installments' && (
        <Card flush>
          <div style={{ padding: '14px 20px 0' }}>
            <Notice>أقساط السيارات التزام نقدي لسداد ثمن السيارة، ولا تُحسب مصروفاً تشغيلياً؛ ثمن السيارات رأس مال يُسترد من الأرباح عبر <strong>حساب استرداد رأس المال</strong>.</Notice>
          </div>
          {inst.length === 0 ? <Empty>لا توجد أقساط مستحقة هذا الشهر</Empty> : (
            <table className="table">
              <thead><tr><th>السيارة</th><th>رقم القسط</th><th className="money">المبلغ</th></tr></thead>
              <tbody>{inst.map((i) => <tr key={i.vehicleId}><td><Link to={`/vehicles/${i.vehicleId}`}>{i.plate}</Link></td><td>{i.number} من {i.of}</td><td className="money num">{money(i.amount)}</td></tr>)}</tbody>
              <tfoot><tr><td colSpan={2}>الإجمالي</td><td className="money num">{money(instTotal)}</td></tr></tfoot>
            </table>
          )}
        </Card>
      )}

      {tab === 'categories' && <Categories db={db} />}

      {modal?.type === 'expense' && <ExpenseForm record={modal.record} month={month} onClose={() => setModal(null)} />}
      {modal?.type === 'recurring' && <RecurringForm record={modal.record} onClose={() => setModal(null)} />}
    </>
  );
}

const catOptions = (db) => db.expenseCategories.map((c) => ({ value: c.id, label: c.name }));

function ExpenseForm({ record, month, onClose }) {
  const db = getState();
  const defaultDate = month === thisMonth() ? today() : `${month}-01`;
  const { values: v, bind } = useForm(record || { date: defaultDate, categoryId: db.expenseCategories[0]?.id || '', amount: '', description: '', vehicleId: '', paymentMethod: 'cash' });
  const save = () => {
    if (!Number(v.amount) || !v.description) return alert('البيان والمبلغ مطلوبان');
    if (isClosed(db, monthOf(v.date))) return alert('الشهر المختار مُقفل مالياً.');
    const data = { ...v, amount: Number(v.amount) };
    if (record) update('expenses', record.id, data, `تعديل مصروف ${data.description} (${data.amount} ر.س)`);
    else insert('expenses', data, `مصروف ${data.description} (${data.amount} ر.س)`);
    onClose();
  };
  return (
    <Modal title={record ? 'تعديل مصروف' : 'إضافة مصروف'} onClose={onClose}
      footer={<><Button icon="check" onClick={save}>حفظ</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <FormGrid cols={2}>
        <Field label="التاريخ" type="date" {...bind('date')} />
        <Field label="الفئة" as="select" options={catOptions(db)} {...bind('categoryId')} />
        <Field label="البيان *" {...bind('description')} span={2} />
        <Field label="المبلغ (ر.س) *" type="number" min="0" {...bind('amount')} />
        <LookupField label="طريقة الدفع" list="payMethods" {...bind('paymentMethod')} />
        <Field label="مرتبط بسيارة (اختياري)" as="select" span={2} options={[{ value: '', label: '— لا —' }, ...db.vehicles.map((x) => ({ value: x.id, label: `${x.plate} — ${x.make} ${x.model}` }))]} {...bind('vehicleId')} />
      </FormGrid>
      <p className="small muted">الرواتب والصيانة والوقود والحوادث تُضاف تلقائياً من شاشاتها — لا تكررها هنا.</p>
    </Modal>
  );
}

function RecurringForm({ record, onClose }) {
  const db = getState();
  const { values: v, bind } = useForm(record || { categoryId: db.expenseCategories[0]?.id || '', amount: '', description: '', startMonth: thisMonth(), endMonth: '', day: 1 });
  const save = () => {
    if (!Number(v.amount) || !v.description) return alert('البيان والمبلغ مطلوبان');
    const data = { ...v, amount: Number(v.amount), day: Math.min(28, Math.max(1, Number(v.day) || 1)), endMonth: v.endMonth || null };
    if (record) update('recurring', record.id, data, `تعديل المصروف المتكرر ${data.description}`);
    else insert('recurring', data, `مصروف متكرر ${data.description} (${data.amount} ر.س شهرياً)`);
    onClose();
  };
  return (
    <Modal title={record ? 'تعديل مصروف متكرر' : 'إضافة مصروف متكرر'} onClose={onClose}
      footer={<><Button icon="check" onClick={save}>حفظ</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <FormGrid cols={2}>
        <Field label="البيان *" {...bind('description')} span={2} placeholder="مثال: إيجار سكن المناديب" />
        <Field label="الفئة" as="select" options={catOptions(db)} {...bind('categoryId')} />
        <Field label="المبلغ الشهري (ر.س) *" type="number" min="0" {...bind('amount')} />
        <Field label="يبدأ من شهر" type="month" {...bind('startMonth')} />
        <Field label="ينتهي في شهر (اختياري)" type="month" {...bind('endMonth')} />
        <Field label="يوم الاستحقاق" type="number" min="1" max="28" {...bind('day')} />
      </FormGrid>
      {record && <p className="small muted">تغيير المبلغ يؤثر على كل الأشهر غير المقفلة. لتغيير المبلغ من شهر معيّن: أوقف هذا القالب وأنشئ قالباً جديداً.</p>}
    </Modal>
  );
}

function Categories({ db }) {
  const [name, setName] = useState('');
  const used = (id) => db.expenses.some((e) => e.categoryId === id) || db.recurring.some((r) => r.categoryId === id);
  return (
    <Card title="فئات المصروفات">
      <div className="toolbar">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم فئة جديدة" style={{ maxWidth: 300 }} />
        <Button icon="plus" onClick={() => { if (name.trim()) { insert('expenseCategories', { name: name.trim() }, `إضافة فئة مصروفات ${name}`); setName(''); } }}>إضافة</Button>
      </div>
      <table className="table compact">
        <tbody>
          {Object.values(SYSTEM_CATEGORIES).map((n) => <tr key={n}><td>{n}</td><td><Badge tone="orange">تلقائية من النظام</Badge></td><td /></tr>)}
          {db.expenseCategories.map((c) => (
            <tr key={c.id}>
              <td><input defaultValue={c.name} onBlur={(e) => e.target.value.trim() && e.target.value !== c.name && update('expenseCategories', c.id, { name: e.target.value.trim() }, `إعادة تسمية فئة إلى ${e.target.value}`)} /></td>
              <td><Badge tone="navy">يدوية</Badge></td>
              <td><IconButton icon="trash" tone="red" title="حذف" onClick={() => {
                if (used(c.id)) return alert('الفئة مستخدمة في مصروفات مسجلة ولا يمكن حذفها.');
                if (window.confirm(`حذف فئة ${c.name}؟`)) remove('expenseCategories', c.id, `حذف فئة ${c.name}`);
              }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

import { useRef, useState } from 'react';
import { useDb, updateSettings, resetDemo, exportBackup, importBackup, log, isDatabaseEmpty, loadDemoIntoDatabase, reload } from '../lib/db';
import { isRemote } from '../lib/supabase';
import { PageHeader, Card, Button, Field, FormGrid, Badge, IconButton, Notice } from '../components/ui';
import { incentiveRuleFor } from '../lib/calc';
import { thisMonth, monthLabel, uid, today, fmtInt, money } from '../lib/format';
import { downloadBlob } from '../lib/export';
import { insert, update, remove } from '../lib/db';
import { LISTS, listOf } from '../lib/lookups';

export default function Settings() {
  const db = useDb();
  const s = db.settings;
  const [general, setGeneral] = useState({ companyName: s.companyName, alertDays: s.alertDays, revenuePerShipment: s.revenuePerShipment });
  const [cap, setCap] = useState({ defaultRecoveryPct: s.defaultRecoveryPct || 0, capitalAmount: s.capitalAmount || 0 });
  const [rule, setRule] = useState({ from: thisMonth(), threshold: incentiveRuleFor(db, thisMonth()).threshold, rate: incentiveRuleFor(db, thisMonth()).rate, note: '' });
  const fileRef = useRef();
  const [busy, setBusy] = useState(false);
  const empty = isDatabaseEmpty();
  const current = incentiveRuleFor(db, thisMonth());
  const rules = [...(s.incentiveRules || [])].sort((a, b) => b.from.localeCompare(a.from));
  const activeId = rules.find((x) => x.from <= thisMonth())?.id;
  const approvedMonths = new Set(db.payrollRuns.map((r) => r.month));

  const saveGeneral = () => {
    updateSettings({ companyName: general.companyName.trim() || 'الشركة اللوجستية', alertDays: Number(general.alertDays) || 30, revenuePerShipment: Number(general.revenuePerShipment) || 0 }, 'تحديث الإعدادات العامة');
    alert('تم الحفظ');
  };
  const saveCap = () => {
    const pct = Number(cap.defaultRecoveryPct) || 0;
    if (pct < 0 || pct > 100) return alert('النسبة بين 0 و 100');
    updateSettings({ defaultRecoveryPct: pct, capitalAmount: Number(cap.capitalAmount) || 0 }, `إعدادات استرداد رأس المال: النسبة الافتراضية ${pct}%`);
    alert('تم الحفظ. الإيرادات المسجلة سابقاً تحتفظ بنسبها.');
  };
  const addRule = () => {
    if (!rule.from || !(Number(rule.threshold) >= 0) || !(Number(rule.rate) >= 0)) return alert('أكمل الحقول');
    const next = [...(s.incentiveRules || []).filter((r) => r.from !== rule.from), { id: uid(), from: rule.from, threshold: Number(rule.threshold), rate: Number(rule.rate), note: rule.note }];
    updateSettings({ incentiveRules: next }, `قاعدة حافز جديدة من ${monthLabel(rule.from)}: فوق ${rule.threshold} شحنة × ${rule.rate} ر.س`);
    setRule({ ...rule, note: '' });
  };
  const delRule = (r) => {
    if ((s.incentiveRules || []).length <= 1) return alert('يجب أن تبقى قاعدة واحدة على الأقل.');
    if (!window.confirm(`حذف القاعدة السارية من ${monthLabel(r.from)}؟`)) return;
    updateSettings({ incentiveRules: s.incentiveRules.filter((x) => x.id !== r.id) }, `حذف قاعدة الحافز من ${monthLabel(r.from)}`);
  };

  const backup = () => {
    downloadBlob(`نسخة-احتياطية-${today()}.json`, new Blob([exportBackup()], { type: 'application/json' }));
    log('نسخ احتياطي', 'البيانات', 'تنزيل نسخة احتياطية');
  };
  const restore = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    f.text().then(async (t) => {
      if (!window.confirm(isRemote ? 'استيراد محتوى الملف إلى قاعدة البيانات؟' : 'استبدال كل البيانات الحالية بمحتوى الملف؟')) return;
      setBusy(true);
      try { await importBackup(t); if (!isRemote) log('استعادة', 'البيانات', `استعادة من ملف ${f.name}`); alert('تم الاستيراد'); } catch (err) { alert(`تعذّر الاستيراد: ${err.message}`); }
      setBusy(false);
    });
    e.target.value = '';
  };

  return (
    <>
      <PageHeader title="الإعدادات" subtitle="قيم الحافز، القوائم، استرداد رأس المال، التنبيهات، والنسخ الاحتياطي" />

      <Card title="حافز المناديب" actions={<Badge tone="teal">الساري الآن: فوق {fmtInt(current.threshold)} شحنة × {current.rate} ر.س</Badge>}>
        <Notice>كل قاعدة لها <strong>شهر سريان</strong>: تُطبَّق من ذلك الشهر فصاعداً حتى تحلّ محلها قاعدة أحدث، فلا يتغير حساب الأشهر السابقة. الأشهر المعتمدة رواتبها مثبّتة في كل الأحوال. يمكن أيضاً تحديد حافز خاص لمندوب معيّن من صفحة تعديل بياناته.</Notice>
        <FormGrid cols={4}>
          <Field label="يسري من شهر" type="month" value={rule.from} onChange={(e) => setRule({ ...rule, from: e.target.value })} />
          <Field label="الحد (عدد الشحنات)" type="number" min="0" value={rule.threshold} onChange={(e) => setRule({ ...rule, threshold: e.target.value })} />
          <Field label="قيمة كل شحنة إضافية (ر.س)" type="number" min="0" step="0.5" value={rule.rate} onChange={(e) => setRule({ ...rule, rate: e.target.value })} />
          <Field label="ملاحظة" value={rule.note} onChange={(e) => setRule({ ...rule, note: e.target.value })} />
        </FormGrid>
        <div style={{ margin: '12px 0 16px' }}><Button icon="plus" onClick={addRule}>حفظ القاعدة</Button></div>
        <table className="table compact">
          <thead><tr><th>يسري من</th><th>الحد</th><th>قيمة الشحنة</th><th>ملاحظة</th><th /></tr></thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <td>{monthLabel(r.from)} {activeId === r.id && <Badge tone="teal">سارية</Badge>}</td>
                <td className="num">{fmtInt(r.threshold)}</td><td>{r.rate} ر.س</td><td>{r.note}</td>
                <td>{!approvedMonths.has(r.from) && <IconButton icon="trash" tone="red" title="حذف" onClick={() => delRule(r)} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid grid-2">
        <Card title="عام">
          <FormGrid cols={1}>
            <Field label="اسم الشركة" value={general.companyName} onChange={(e) => setGeneral({ ...general, companyName: e.target.value })} />
            <Field label="التنبيه قبل انتهاء الوثائق بـ (يوم)" type="number" min="1" value={general.alertDays} onChange={(e) => setGeneral({ ...general, alertDays: e.target.value })} />
            <Field label="إيراد الشحنة الواحدة من الشركة الرئيسية (ر.س)" type="number" min="0" step="0.5" value={general.revenuePerShipment} onChange={(e) => setGeneral({ ...general, revenuePerShipment: e.target.value })}
              hint="اختياري: عند إدخال قيمة يُحسب الإيراد تلقائياً = عدد الشحنات × القيمة. اتركه 0 لتسجيل الإيرادات يدوياً." />
          </FormGrid>
          <div style={{ marginTop: 14 }}><Button icon="check" onClick={saveGeneral}>حفظ</Button></div>
        </Card>

        <Card title="استرداد رأس المال">
          <FormGrid cols={1}>
            <Field label="النسبة الافتراضية من الإيراد (%)" type="number" min="0" max="100" step="0.5" value={cap.defaultRecoveryPct} onChange={(e) => setCap({ ...cap, defaultRecoveryPct: e.target.value })}
              hint="تُقترح عند تسجيل أول إيراد، وبعدها تُقترح آخر نسبة استخدمتها. تستطيع تغيير النسبة مع كل إيراد." />
            <Field label="رأس المال المستثمر (ر.س)" type="number" min="0" value={cap.capitalAmount} onChange={(e) => setCap({ ...cap, capitalAmount: e.target.value })}
              hint="اتركه 0 ليُحسب تلقائياً من مجموع أسعار شراء السيارات." />
          </FormGrid>
          <p className="small muted">تُستقطع النسبة من الأرباح شهرياً وتُرحَّل عند إقفال الشهر إلى حساب استرداد رأس المال المنفصل.</p>
          <Button icon="check" onClick={saveCap}>حفظ</Button>
        </Card>
      </div>

      <ListsManager db={db} />

      <Card title="البيانات والنسخ الاحتياطي">
        <p className="muted">{isRemote
          ? 'البيانات محفوظة في قاعدة بيانات Supabase. يمكن تنزيل نسخة احتياطية بصيغة JSON في أي وقت. الاستيراد متاح فقط عندما تكون قاعدة البيانات فارغة (مثل نقل بيانات النسخة التجريبية).'
          : 'النسخة التجريبية تحفظ البيانات في هذا المتصفح. خذ نسخة احتياطية قبل مسح بيانات المتصفح أو للانتقال لجهاز آخر.'}</p>
        <div className="toolbar">
          <Button variant="ghost" icon="download" onClick={backup}>تنزيل نسخة احتياطية</Button>
          {(!isRemote || empty) && <Button variant="ghost" disabled={busy} onClick={() => fileRef.current.click()}>{isRemote ? 'استيراد من ملف' : 'استعادة من ملف'}</Button>}
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={restore} />
          {isRemote && <Button variant="ghost" onClick={reload}>تحديث البيانات من الخادم</Button>}
          <span className="spacer" />
          {!isRemote && <Button variant="danger" onClick={() => window.confirm('حذف كل البيانات الحالية وإعادة تحميل البيانات التجريبية؟') && resetDemo()}>إعادة ضبط البيانات التجريبية</Button>}
          {isRemote && empty && <Button variant="accent" disabled={busy} onClick={async () => {
            if (!window.confirm('تحميل بيانات تجريبية (12 مندوباً، 10 سيارات، 3 أشهر) إلى قاعدة البيانات للعرض؟ يمكن حذفها لاحقاً.')) return;
            setBusy(true);
            try { await loadDemoIntoDatabase(); alert('تم تحميل البيانات التجريبية'); } catch (e) { alert(`تعذّر التحميل: ${e.message}`); }
            setBusy(false);
          }}>{busy ? 'جارٍ التحميل…' : 'تحميل بيانات تجريبية للعرض'}</Button>}
        </div>
      </Card>
    </>
  );
}

// عدد مرات استخدام قيمة من قائمة — لمنع حذف قيمة مستخدمة
function usageOf(db, list, key) {
  if (list === 'jobTypes') return db.employees.filter((e) => e.role === key).length;
  if (list === 'empDocs') return db.employees.filter((e) => e.docs?.[key]?.number || e.docs?.[key]?.expiry).length;
  if (list === 'vehDocs') return db.vehicles.filter((v) => v.docs?.[key]?.number || v.docs?.[key]?.expiry).length;
  if (list === 'maintTypes') return db.maintenance.filter((m) => m.type === key).length;
  if (list === 'incidentKinds') return db.incidents.filter((i) => i.kind === key).length;
  if (list === 'payMethods') return db.expenses.filter((e) => e.paymentMethod === key).length;
  return 0;
}

function ListsManager({ db }) {
  const [list, setList] = useState('jobTypes');
  const [name, setName] = useState('');
  const items = listOf(list, db);
  const add = () => {
    const clean = name.trim();
    if (!clean) return;
    if (items.some((i) => i.name === clean)) return alert('موجودة مسبقاً');
    insert('lookups', { list, name: clean, meta: {} }, `إضافة «${clean}» إلى ${LISTS[list].label}`);
    setName('');
  };
  return (
    <Card title="القوائم (قابلة للإضافة)">
      <Notice>هذه القوائم تظهر في نماذج الإدخال. يمكن الإضافة من هنا أو مباشرة من أي نموذج عبر خيار «+ إضافة جديد…». القيم الأساسية ثابتة لأن حسابات النظام تعتمد عليها.</Notice>
      <div className="tabs">
        {Object.entries(LISTS).map(([k, l]) => <button key={k} type="button" className={list === k ? 'active' : ''} onClick={() => setList(k)}>{l.label}</button>)}
      </div>
      {LISTS[list].hint && <p className="small muted">{LISTS[list].hint}</p>}
      <div className="toolbar">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder={`إضافة إلى ${LISTS[list].label}`} style={{ maxWidth: 300 }} />
        <Button icon="plus" onClick={add}>إضافة</Button>
      </div>
      <table className="table compact">
        <tbody>
          {items.map((i) => {
            const used = usageOf(db, list, i.key);
            return (
              <tr key={i.key}>
                <td style={{ width: '40%' }}>{i.custom
                  ? <input defaultValue={i.name} key={i.name} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== i.name && update('lookups', i.key, { name: e.target.value.trim() }, `إعادة تسمية «${i.name}» إلى «${e.target.value.trim()}»`)} />
                  : i.name}</td>
                <td>{i.custom ? <Badge tone="navy">مضافة</Badge> : <Badge tone="gray">أساسية</Badge>}</td>
                {list === 'jobTypes' && (
                  <td>
                    <label className="check">
                      <input type="checkbox" checked={!!i.meta?.shipments} disabled={!i.custom}
                        onChange={(e) => update('lookups', i.key, { meta: { ...i.meta, shipments: e.target.checked } }, `${e.target.checked ? 'تفعيل' : 'إلغاء'} تسليم الشحنات لفئة «${i.name}»`)} />
                      <span className="small">يسلّم شحنات ويستحق الحافز</span>
                    </label>
                  </td>
                )}
                <td className="small muted">{used ? `مستخدمة في ${used} سجل` : ''}</td>
                <td>{i.custom && <IconButton icon="trash" tone="red" title="حذف" onClick={() => {
                  if (used) return alert('القيمة مستخدمة في سجلات ولا يمكن حذفها. يمكنك إعادة تسميتها.');
                  if (window.confirm(`حذف «${i.name}»؟`)) remove('lookups', i.key, `حذف «${i.name}» من ${LISTS[list].label}`);
                }} />}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

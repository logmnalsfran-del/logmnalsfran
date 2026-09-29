import { useRef, useState } from 'react';
import { useDb, updateSettings, resetDemo, exportBackup, importBackup, log, isDatabaseEmpty, loadDemoIntoDatabase, reload } from '../lib/db';
import { isRemote } from '../lib/supabase';
import { PageHeader, Card, Button, Field, FormGrid, Badge, IconButton, Notice } from '../components/ui';
import { incentiveRuleFor } from '../lib/calc';
import { thisMonth, monthLabel, uid, today, fmtInt, money } from '../lib/format';
import { downloadBlob } from '../lib/export';

export default function Settings() {
  const db = useDb();
  const s = db.settings;
  const [general, setGeneral] = useState({ companyName: s.companyName, alertDays: s.alertDays, revenuePerShipment: s.revenuePerShipment });
  const [dep, setDep] = useState(s.depreciation || { method: 'straight_line', fixedAmount: 0 });
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
  const saveDep = () => {
    updateSettings({ depreciation: { method: dep.method, fixedAmount: Number(dep.fixedAmount) || 0 } }, `تغيير طريقة مخصص الهالك إلى ${dep.method === 'fixed' ? `مبلغ ثابت ${dep.fixedAmount}` : 'القسط الثابت لكل سيارة'}`);
    alert('تم الحفظ. الأشهر المقفلة لا تتأثر.');
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
      <PageHeader title="الإعدادات" subtitle="قيم الحافز، التنبيهات، مخصص الهالك، والنسخ الاحتياطي" />

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

        <Card title="مخصص الهالك">
          <FormGrid cols={1}>
            <Field label="طريقة الاحتساب" as="select" value={dep.method} onChange={(e) => setDep({ ...dep, method: e.target.value })} options={[
              { value: 'straight_line', label: 'القسط الثابت لكل سيارة (سعر الشراء − القيمة المتبقية) ÷ العمر الإنتاجي' },
              { value: 'fixed', label: 'مبلغ شهري ثابت يحدده المالك' },
            ]} />
            {dep.method === 'fixed' && <Field label="المبلغ الشهري (ر.س)" type="number" min="0" value={dep.fixedAmount} onChange={(e) => setDep({ ...dep, fixedAmount: e.target.value })} hint={`الحالي: ${money(s.depreciation?.fixedAmount || 0)}`} />}
          </FormGrid>
          <p className="small muted">يُخصم المخصص من الأرباح شهرياً ويُرحَّل عند إقفال الشهر إلى حساب مخصص الهالك المنفصل.</p>
          <Button icon="check" onClick={saveDep}>حفظ</Button>
        </Card>
      </div>

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

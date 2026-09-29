import { Modal, Field, FormGrid, FormSection, Button, useForm } from './ui';
import { insert, update } from '../lib/db';
import { JOBS, EMP_STATUS, EMP_DOCS } from '../lib/constants';
import { today } from '../lib/format';

const blank = {
  name: '', role: 'driver', title: 'مندوب توصيل', nationalId: '', nationality: '', phone: '', birthDate: '',
  hireDate: today(), terminationDate: '', status: 'active', baseSalary: 3000, allowances: 0, iban: '', externalId: '',
  docs: { iqama: {}, passport: {}, license: {}, medical: {} },
  incentiveOverride: { enabled: false, threshold: 1000, rate: 2 }, notes: '',
};

export default function EmployeeForm({ employee, onClose, showMoney }) {
  const { values: v, bind } = useForm(employee
    ? { ...blank, ...employee, incentiveOverride: employee.incentiveOverride || blank.incentiveOverride }
    : blank);

  const save = () => {
    if (!v.name.trim()) return alert('الاسم مطلوب');
    const data = {
      ...v,
      baseSalary: Number(v.baseSalary) || 0,
      allowances: Number(v.allowances) || 0,
      incentiveOverride: v.role === 'driver' && v.incentiveOverride.enabled
        ? { enabled: true, threshold: Number(v.incentiveOverride.threshold), rate: Number(v.incentiveOverride.rate) }
        : null,
    };
    if (employee) update('employees', employee.id, data, `تعديل بيانات الموظف ${data.name}`);
    else insert('employees', data, `إضافة موظف جديد ${data.name}`);
    onClose();
  };

  return (
    <Modal wide title={employee ? `تعديل: ${employee.name}` : 'إضافة موظف'} onClose={onClose}
      footer={<><Button onClick={save} icon="check">حفظ</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <FormSection title="البيانات الأساسية">
        <FormGrid>
          <Field label="الاسم الكامل *" {...bind('name')} span={2} />
          <Field label="الفئة" as="select" options={Object.entries(JOBS).map(([value, label]) => ({ value, label }))} {...bind('role')} />
          <Field label="المسمى الوظيفي" {...bind('title')} />
          <Field label="رقم الهوية / الإقامة" {...bind('nationalId')} />
          <Field label="الجنسية" {...bind('nationality')} />
          <Field label="الجوال" type="tel" {...bind('phone')} />
          <Field label="تاريخ الميلاد" type="date" {...bind('birthDate')} />
          <Field label="تاريخ التعيين" type="date" {...bind('hireDate')} />
          <Field label="الحالة" as="select" options={Object.entries(EMP_STATUS).map(([value, s]) => ({ value, label: s.label }))} {...bind('status')} />
          {v.status === 'terminated' && <Field label="تاريخ انتهاء الخدمة" type="date" {...bind('terminationDate')} />}
          {v.role === 'driver' && <Field label="رقم المندوب في تطبيق الشركة الرئيسية" {...bind('externalId')} />}
        </FormGrid>
      </FormSection>

      {showMoney && (
        <FormSection title="الراتب">
          <FormGrid>
            <Field label="الراتب الأساسي (ر.س)" type="number" min="0" {...bind('baseSalary')} />
            <Field label="البدلات الشهرية (ر.س)" type="number" min="0" {...bind('allowances')} />
            <Field label="الآيبان" {...bind('iban')} />
          </FormGrid>
          {v.role === 'driver' && (
            <div style={{ marginTop: 14 }}>
              <label className="check"><input type="checkbox" {...bind('incentiveOverride.enabled')} checked={!!v.incentiveOverride.enabled} /> حافز خاص بهذا المندوب (بدلاً من الإعداد العام)</label>
              {v.incentiveOverride.enabled && (
                <FormGrid cols={3}>
                  <Field label="الحد (شحنة)" type="number" min="0" {...bind('incentiveOverride.threshold')} />
                  <Field label="قيمة الشحنة الإضافية (ر.س)" type="number" min="0" step="0.5" {...bind('incentiveOverride.rate')} />
                </FormGrid>
              )}
            </div>
          )}
        </FormSection>
      )}

      <FormSection title="الوثائق">
        <FormGrid cols={2}>
          {Object.entries(EMP_DOCS).map(([k, label]) => (
            <div key={k} className="form-grid cols-2" style={{ gap: 8 }}>
              <Field label={`${label} — الرقم`} {...bind(`docs.${k}.number`)} />
              <Field label="تاريخ الانتهاء" type="date" {...bind(`docs.${k}.expiry`)} />
            </div>
          ))}
        </FormGrid>
      </FormSection>
      <Field label="ملاحظات" as="textarea" {...bind('notes')} />
    </Modal>
  );
}

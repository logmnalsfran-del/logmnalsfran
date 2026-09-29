import { Modal, Field, FormGrid, FormSection, Button, useForm } from './ui';
import { insert, update } from '../lib/db';
import { VEH_STATUS, VEH_DOCS } from '../lib/constants';
import { today, addMonths, thisMonth, money, round2 } from '../lib/format';

const blank = {
  plate: '', vin: '', make: '', model: '', year: new Date().getFullYear(), color: '', purchaseDate: today(), price: '',
  vendor: '', paymentMethod: 'cash', downPayment: 0, installmentAmount: '', installmentCount: 36, installmentStart: addMonths(thisMonth(), 1),
  odometer: 0, status: 'active', docs: { registration: {}, insurance: {}, inspection: {}, operatingCard: {} },
  usefulLifeMonths: 60, residualValue: 20000, notes: '',
};

export default function VehicleForm({ vehicle, onClose, showMoney = true }) {
  const { values: v, bind, set } = useForm(vehicle ? { ...blank, ...vehicle } : blank);
  const monthlyDep = Number(v.usefulLifeMonths) > 0 ? (Number(v.price || 0) - Number(v.residualValue || 0)) / Number(v.usefulLifeMonths) : 0;

  const suggestInstallment = () => {
    const n = Number(v.installmentCount) || 0;
    if (n > 0) set('installmentAmount', round2((Number(v.price || 0) - Number(v.downPayment || 0)) / n));
  };

  const save = () => {
    if (!v.plate.trim()) return alert('رقم اللوحة مطلوب');
    const data = {
      ...v, year: Number(v.year) || '', price: Number(v.price) || 0, odometer: Number(v.odometer) || 0,
      downPayment: Number(v.downPayment) || 0, installmentAmount: Number(v.installmentAmount) || 0,
      installmentCount: Number(v.installmentCount) || 0, usefulLifeMonths: Number(v.usefulLifeMonths) || 0,
      residualValue: Number(v.residualValue) || 0,
    };
    if (data.paymentMethod === 'cash') Object.assign(data, { downPayment: 0, installmentAmount: 0, installmentCount: 0, installmentStart: '' });
    if (vehicle) update('vehicles', vehicle.id, data, `تعديل بيانات السيارة ${data.plate}`);
    else insert('vehicles', { ...data, disposal: null }, `إضافة سيارة ${data.plate}`);
    onClose();
  };

  return (
    <Modal wide title={vehicle ? `تعديل السيارة ${vehicle.plate}` : 'إضافة سيارة'} onClose={onClose}
      footer={<><Button onClick={save} icon="check">حفظ</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <FormSection title="بيانات السيارة">
        <FormGrid cols={4}>
          <Field label="رقم اللوحة *" {...bind('plate')} />
          <Field label="رقم الهيكل (VIN)" {...bind('vin')} span={2} />
          <Field label="اللون" {...bind('color')} />
          <Field label="الماركة" {...bind('make')} />
          <Field label="الموديل" {...bind('model')} />
          <Field label="سنة الصنع" type="number" {...bind('year')} />
          <Field label="قراءة العداد (كم)" type="number" min="0" {...bind('odometer')} />
          <Field label="الحالة" as="select" options={Object.entries(VEH_STATUS).filter(([k]) => k !== 'sold' || vehicle?.status === 'sold').map(([value, s]) => ({ value, label: s.label }))} {...bind('status')} />
        </FormGrid>
      </FormSection>

      {showMoney && (
        <FormSection title="الشراء والتمويل">
          <FormGrid cols={4}>
            <Field label="تاريخ الشراء" type="date" {...bind('purchaseDate')} />
            <Field label="سعر الشراء (ر.س)" type="number" min="0" {...bind('price')} />
            <Field label="البائع / الوكالة" {...bind('vendor')} span={2} />
            <Field label="طريقة الدفع" as="select" options={[{ value: 'cash', label: 'نقداً' }, { value: 'installments', label: 'أقساط' }]} {...bind('paymentMethod')} />
            {v.paymentMethod === 'installments' && <>
              <Field label="الدفعة الأولى" type="number" min="0" {...bind('downPayment')} />
              <Field label="عدد الأقساط (شهر)" type="number" min="1" {...bind('installmentCount')} />
              <Field label="بداية الأقساط" type="month" {...bind('installmentStart')} />
              <Field label="القسط الشهري" type="number" min="0" {...bind('installmentAmount')} hint={<button type="button" className="btn-link" onClick={suggestInstallment}>احسبه تلقائياً</button>} />
            </>}
          </FormGrid>
        </FormSection>
      )}

      {showMoney && (
        <FormSection title="مخصص الهالك (الإهلاك)">
          <FormGrid cols={3}>
            <Field label="العمر الإنتاجي (شهر)" type="number" min="0" {...bind('usefulLifeMonths')} />
            <Field label="القيمة المتبقية المتوقعة (ر.س)" type="number" min="0" {...bind('residualValue')} />
            <Field label="الإهلاك الشهري" as="custom"><div className="strong" style={{ padding: '9px 0' }}>{money(monthlyDep)}</div></Field>
          </FormGrid>
        </FormSection>
      )}

      <FormSection title="الوثائق">
        <FormGrid cols={2}>
          {Object.entries(VEH_DOCS).map(([k, label]) => (
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

// نماذج العمليات على السيارات: صيانة، وقود، حوادث، جداول صيانة، تسليم واستلام العهدة
import { Modal, Field, FormGrid, Button, useForm } from './ui';
import { insert, update, bumpOdometer, getState } from '../lib/db';
import { today } from '../lib/format';
import { currentCustody, isClosed } from '../lib/calc';
import { monthOf } from '../lib/format';
import { labelOf, isDriver } from '../lib/lookups';
import { LookupField, SuggestField } from './Lookup';

const vehicleOptions = (db, withEmpty) => [
  ...(withEmpty ? [{ value: '', label: '— اختر السيارة —' }] : []),
  ...db.vehicles.filter((v) => v.status !== 'sold').map((v) => ({ value: v.id, label: `${v.plate} — ${v.make} ${v.model}` })),
];
const driverOptions = (db, withEmpty = true) => [
  ...(withEmpty ? [{ value: '', label: '— غير محدد —' }] : []),
  ...db.employees.filter((e) => isDriver(e) && e.status !== 'terminated').map((e) => ({ value: e.id, label: e.name })),
];
const footer = (save, onClose) => <><Button onClick={save} icon="check">حفظ</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>;
function closedGuard(date) {
  if (isClosed(getState(), monthOf(date))) { alert('هذا الشهر مُقفل مالياً ولا يمكن إضافة أو تعديل حركات فيه.'); return true; }
  return false;
}
const plateOf = (id) => getState().vehicles.find((v) => v.id === id)?.plate || '';

export function MaintenanceForm({ record, vehicleId, onClose }) {
  const db = getState();
  const { values: v, bind } = useForm(record || { vehicleId: vehicleId || '', date: today(), type: 'periodic', workshop: '', description: '', parts: '', cost: '', odometer: '' });
  const save = () => {
    if (!v.vehicleId || !v.description) return alert('السيارة والوصف مطلوبان');
    if (closedGuard(v.date) || (record && closedGuard(record.date))) return;
    const data = { ...v, cost: Number(v.cost) || 0, odometer: Number(v.odometer) || 0 };
    if (record) update('maintenance', record.id, data, `تعديل صيانة ${plateOf(v.vehicleId)}`);
    else insert('maintenance', data, `صيانة ${data.description} — ${plateOf(v.vehicleId)} (${data.cost} ر.س)`);
    bumpOdometer(v.vehicleId, data.odometer);
    onClose();
  };
  return (
    <Modal title={record ? 'تعديل سجل صيانة' : 'تسجيل صيانة'} onClose={onClose} footer={footer(save, onClose)}>
      <FormGrid cols={2}>
        <Field label="السيارة *" as="select" options={vehicleOptions(db, true)} {...bind('vehicleId')} span={2} />
        <Field label="التاريخ" type="date" {...bind('date')} />
        <LookupField label="النوع" list="maintTypes" {...bind('type')} />
        <Field label="الوصف *" {...bind('description')} span={2} placeholder="مثال: غيار زيت وفلتر" />
        <SuggestField label="الورشة" col="maintenance" field="workshop" {...bind('workshop')} />
        <Field label="قطع الغيار" {...bind('parts')} />
        <Field label="التكلفة (ر.س)" type="number" min="0" {...bind('cost')} />
        <Field label="قراءة العداد (كم)" type="number" min="0" {...bind('odometer')} />
      </FormGrid>
    </Modal>
  );
}

export function FuelForm({ record, vehicleId, onClose }) {
  const db = getState();
  const { values: v, bind } = useForm(record || { vehicleId: vehicleId || '', date: today(), liters: '', cost: '', odometer: '' });
  const save = () => {
    if (!v.vehicleId || !v.cost) return alert('السيارة والتكلفة مطلوبتان');
    if (closedGuard(v.date) || (record && closedGuard(record.date))) return;
    const data = { ...v, liters: Number(v.liters) || 0, cost: Number(v.cost) || 0, odometer: Number(v.odometer) || 0 };
    if (record) update('fuel', record.id, data, `تعديل تعبئة وقود ${plateOf(v.vehicleId)}`);
    else insert('fuel', data, `تعبئة وقود ${plateOf(v.vehicleId)} (${data.cost} ر.س)`);
    bumpOdometer(v.vehicleId, data.odometer);
    onClose();
  };
  return (
    <Modal title={record ? 'تعديل تعبئة وقود' : 'تسجيل تعبئة وقود'} onClose={onClose} footer={footer(save, onClose)}>
      <FormGrid cols={2}>
        <Field label="السيارة *" as="select" options={vehicleOptions(db, true)} {...bind('vehicleId')} span={2} />
        <Field label="التاريخ" type="date" {...bind('date')} />
        <Field label="اللترات" type="number" min="0" {...bind('liters')} />
        <Field label="التكلفة (ر.س) *" type="number" min="0" {...bind('cost')} />
        <Field label="قراءة العداد (كم)" type="number" min="0" {...bind('odometer')} />
      </FormGrid>
    </Modal>
  );
}

export function IncidentForm({ record, vehicleId, onClose }) {
  const db = getState();
  const initial = record || (() => {
    const c = vehicleId && currentCustody(db, vehicleId);
    return { vehicleId: vehicleId || '', employeeId: c?.employeeId || '', date: today(), kind: 'violation', description: '', cost: '' };
  })();
  const { values: v, bind, set } = useForm(initial);
  const onVehicle = (e) => {
    const id = e.target.value;
    set('vehicleId', id);
    const c = id && currentCustody(db, id);
    if (c) set('employeeId', c.employeeId);
  };
  const save = () => {
    if (!v.vehicleId) return alert('السيارة مطلوبة');
    if (closedGuard(v.date) || (record && closedGuard(record.date))) return;
    const data = { ...v, cost: Number(v.cost) || 0 };
    if (record) update('incidents', record.id, data, `تعديل ${labelOf('incidentKinds', v.kind)} — ${plateOf(v.vehicleId)}`);
    else insert('incidents', data, `${labelOf('incidentKinds', v.kind)} — ${plateOf(v.vehicleId)} (${data.cost} ر.س)`);
    onClose();
  };
  return (
    <Modal title={record ? 'تعديل حادث / مخالفة' : 'تسجيل حادث / مخالفة'} onClose={onClose} footer={footer(save, onClose)}>
      <FormGrid cols={2}>
        <Field label="السيارة *" as="select" options={vehicleOptions(db, true)} value={v.vehicleId} onChange={onVehicle} span={2} />
        <Field label="السائق المسؤول" as="select" options={driverOptions(db)} {...bind('employeeId')} hint="يُقترح تلقائياً من العهدة الحالية" />
        <LookupField label="النوع" list="incidentKinds" {...bind('kind')} />
        <Field label="التاريخ" type="date" {...bind('date')} />
        <Field label="التكلفة على الشركة (ر.س)" type="number" min="0" {...bind('cost')} hint="لا تُخصم من المندوب (قرار الإدارة)" />
        <Field label="الوصف" as="textarea" {...bind('description')} span={2} />
      </FormGrid>
    </Modal>
  );
}

export function ScheduleForm({ record, vehicleId, onClose }) {
  const db = getState();
  const veh = db.vehicles.find((x) => x.id === (record?.vehicleId || vehicleId));
  const { values: v, bind } = useForm(record || { vehicleId: vehicleId || '', name: 'غيار زيت وفلتر', everyKm: 5000, everyDays: 90, lastKm: veh?.odometer || 0, lastDate: today() });
  const save = () => {
    if (!v.vehicleId || !v.name) return alert('السيارة والاسم مطلوبان');
    const data = { ...v, everyKm: Number(v.everyKm) || 0, everyDays: Number(v.everyDays) || 0, lastKm: Number(v.lastKm) || 0 };
    if (record) update('schedules', record.id, data, `تعديل جدول صيانة ${data.name} — ${plateOf(v.vehicleId)}`);
    else insert('schedules', data, `جدول صيانة ${data.name} — ${plateOf(v.vehicleId)}`);
    onClose();
  };
  return (
    <Modal title={record ? 'تعديل صيانة مجدولة' : 'إضافة صيانة مجدولة'} onClose={onClose} footer={footer(save, onClose)}>
      <FormGrid cols={2}>
        <Field label="السيارة *" as="select" options={vehicleOptions(db, true)} {...bind('vehicleId')} span={2} />
        <Field label="اسم الصيانة *" {...bind('name')} span={2} />
        <Field label="كل (كم)" type="number" min="0" {...bind('everyKm')} hint="0 = لا يعتمد على المسافة" />
        <Field label="أو كل (يوم)" type="number" min="0" {...bind('everyDays')} hint="0 = لا يعتمد على المدة" />
        <Field label="آخر تنفيذ عند (كم)" type="number" min="0" {...bind('lastKm')} />
        <Field label="تاريخ آخر تنفيذ" type="date" {...bind('lastDate')} />
      </FormGrid>
    </Modal>
  );
}

export function HandoverForm({ vehicle, onClose }) {
  const db = getState();
  const busy = new Set(db.custody.filter((c) => !c.toDate).map((c) => c.employeeId));
  const options = [{ value: '', label: '— اختر المندوب —' }, ...db.employees
    .filter((e) => isDriver(e) && e.status === 'active')
    .map((e) => ({ value: e.id, label: `${e.name}${busy.has(e.id) ? ' (لديه سيارة)' : ''}` }))];
  const { values: v, bind } = useForm({ employeeId: '', fromDate: today(), odometerOut: vehicle.odometer, conditionOut: 'سليمة' });
  const save = () => {
    if (!v.employeeId) return alert('اختر المندوب');
    if (busy.has(v.employeeId) && !window.confirm('هذا المندوب لديه سيارة حالياً. متابعة التسليم؟')) return;
    const emp = db.employees.find((e) => e.id === v.employeeId);
    insert('custody', { vehicleId: vehicle.id, ...v, odometerOut: Number(v.odometerOut) || 0, toDate: null, odometerIn: null, conditionIn: '' },
      `تسليم السيارة ${vehicle.plate} إلى ${emp.name}`);
    bumpOdometer(vehicle.id, v.odometerOut);
    onClose();
  };
  return (
    <Modal title={`تسليم السيارة ${vehicle.plate}`} onClose={onClose} footer={footer(save, onClose)}>
      <FormGrid cols={2}>
        <Field label="المندوب المستلم *" as="select" options={options} {...bind('employeeId')} span={2} />
        <Field label="تاريخ التسليم" type="date" {...bind('fromDate')} />
        <Field label="قراءة العداد عند التسليم" type="number" min="0" {...bind('odometerOut')} />
        <Field label="حالة السيارة عند التسليم" as="textarea" {...bind('conditionOut')} span={2} />
      </FormGrid>
    </Modal>
  );
}

export function ReturnForm({ custody, vehicle, onClose }) {
  const db = getState();
  const emp = db.employees.find((e) => e.id === custody.employeeId);
  const { values: v, bind } = useForm({ toDate: today(), odometerIn: vehicle.odometer, conditionIn: 'سليمة' });
  const save = () => {
    if (v.toDate < custody.fromDate) return alert('تاريخ الاستلام قبل تاريخ التسليم');
    update('custody', custody.id, { ...v, odometerIn: Number(v.odometerIn) || 0 }, `استلام السيارة ${vehicle.plate} من ${emp?.name}`);
    bumpOdometer(vehicle.id, v.odometerIn);
    onClose();
  };
  return (
    <Modal title={`استلام السيارة ${vehicle.plate} من ${emp?.name || ''}`} onClose={onClose} footer={footer(save, onClose)}>
      <FormGrid cols={2}>
        <Field label="تاريخ الاستلام" type="date" {...bind('toDate')} />
        <Field label="قراءة العداد عند الاستلام" type="number" min="0" {...bind('odometerIn')} />
        <Field label="حالة السيارة عند الاستلام" as="textarea" {...bind('conditionIn')} span={2} />
      </FormGrid>
    </Modal>
  );
}

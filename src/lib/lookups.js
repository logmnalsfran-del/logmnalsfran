// القوائم المرنة: قيم أساسية ثابتة + قيم يضيفها المستخدم (مجموعة lookups)
// القيمة المضافة مفتاحها هو معرّف الصف (id)، والأساسية مفتاحها نص ثابت يعتمد عليه منطق النظام.
import { getState } from './db';

export const LISTS = {
  jobTypes: { label: 'أنواع العمالة', hint: 'فئات الموظفين. فعّل «يسلّم شحنات» للفئات التي تُدخل لها شحنات وتستحق الحافز.' },
  empDocs: { label: 'وثائق الموظفين', hint: 'أنواع الوثائق التي تُتابع تواريخ انتهائها لكل موظف.' },
  vehDocs: { label: 'وثائق السيارات', hint: 'أنواع الوثائق التي تُتابع تواريخ انتهائها لكل سيارة.' },
  maintTypes: { label: 'أنواع الصيانة' },
  incidentKinds: { label: 'أنواع الحوادث والمخالفات' },
  payMethods: { label: 'طرق الدفع' },
};

const BUILTIN = {
  jobTypes: [
    { key: 'driver', name: 'مندوب توصيل', meta: { shipments: true } },
    { key: 'supervisor', name: 'مشرف' },
    { key: 'maintenance', name: 'مسؤول صيانة' },
    { key: 'other', name: 'أخرى' },
  ],
  empDocs: [
    { key: 'iqama', name: 'الإقامة / الهوية' },
    { key: 'passport', name: 'جواز السفر' },
    { key: 'license', name: 'رخصة القيادة' },
    { key: 'medical', name: 'التأمين الطبي' },
  ],
  vehDocs: [
    { key: 'registration', name: 'الاستمارة' },
    { key: 'insurance', name: 'التأمين' },
    { key: 'inspection', name: 'الفحص الدوري' },
    { key: 'operatingCard', name: 'بطاقة التشغيل' },
  ],
  maintTypes: [{ key: 'periodic', name: 'دورية' }, { key: 'emergency', name: 'طارئة' }],
  incidentKinds: [{ key: 'accident', name: 'حادث' }, { key: 'violation', name: 'مخالفة مرورية' }],
  payMethods: [{ key: 'cash', name: 'نقداً' }, { key: 'transfer', name: 'تحويل بنكي' }, { key: 'card', name: 'بطاقة' }],
};

export function listOf(list, db = getState()) {
  const custom = (db.lookups || []).filter((l) => l.list === list)
    .map((l) => ({ key: l.id, name: l.name, meta: l.meta || {}, custom: true }));
  return [...BUILTIN[list].map((b) => ({ meta: {}, ...b })), ...custom];
}
export const entriesOf = (list, db) => listOf(list, db).map((o) => [o.key, o.name]);
export const optionsOf = (list, db) => listOf(list, db).map((o) => ({ value: o.key, label: o.name }));
export function labelOf(list, key, db) {
  return listOf(list, db).find((o) => o.key === key)?.name || (key ? 'غير معرّف' : '—');
}

// الفئات التي تسلّم شحنات (تظهر في إدخال الشحنات وتستحق الحافز)
export function shipmentRoles(db = getState()) {
  return new Set(listOf('jobTypes', db).filter((o) => o.meta?.shipments).map((o) => o.key));
}
export const isDriver = (emp, db) => shipmentRoles(db).has(emp.role);
// صفوف المسيّر المعتمدة قديماً لا تحمل الحقل driver
export const rowIsDriver = (r) => r.driver ?? r.role === 'driver';

// قيم سبق إدخالها في حقل نصي حر — تُعرض كاقتراحات
export function suggestions(col, field, db = getState()) {
  return [...new Set((db[col] || []).map((r) => r[field]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'ar'));
}

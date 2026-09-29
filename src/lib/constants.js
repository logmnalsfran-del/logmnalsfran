// القوائم الثابتة والتسميات

export const ROLES = {
  owner: { label: 'المالك / المدير العام', short: 'المالك' },
  supervisor: { label: 'المشرف', short: 'المشرف' },
  maintenance: { label: 'مسؤول الصيانة', short: 'الصيانة' },
};

export const JOBS = {
  driver: 'مندوب توصيل',
  supervisor: 'مشرف',
  maintenance: 'مسؤول صيانة',
  other: 'أخرى',
};

export const EMP_STATUS = {
  active: { label: 'على رأس العمل', tone: 'green' },
  leave: { label: 'إجازة', tone: 'orange' },
  suspended: { label: 'موقوف', tone: 'red' },
  terminated: { label: 'منتهية خدماته', tone: 'gray' },
};

export const EMP_DOCS = {
  iqama: 'الإقامة / الهوية',
  passport: 'جواز السفر',
  license: 'رخصة القيادة',
  medical: 'التأمين الطبي',
};

export const VEH_STATUS = {
  active: { label: 'في الخدمة', tone: 'green' },
  workshop: { label: 'في الورشة', tone: 'orange' },
  stopped: { label: 'متوقفة', tone: 'gray' },
  sold: { label: 'مباعة / مشطوبة', tone: 'navy' },
};

export const VEH_DOCS = {
  registration: 'الاستمارة',
  insurance: 'التأمين',
  inspection: 'الفحص الدوري',
  operatingCard: 'بطاقة التشغيل',
};

export const MAINT_TYPES = { periodic: 'دورية', emergency: 'طارئة' };
export const INCIDENT_KINDS = { accident: 'حادث', violation: 'مخالفة مرورية' };
export const PAY_METHODS = { cash: 'نقداً', transfer: 'تحويل بنكي', card: 'بطاقة' };

// فئات المصروفات التي تُغذّى تلقائياً من وحدات النظام
export const SYSTEM_CATEGORIES = {
  payroll: 'الرواتب والحوافز',
  maintenance: 'صيانة السيارات',
  fuel: 'الوقود',
  incidents: 'الحوادث والمخالفات',
};

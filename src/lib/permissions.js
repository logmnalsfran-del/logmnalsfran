// صلاحيات الأدوار على الشاشات
// view: يرى الشاشة، edit: يعدّل فيها
const MATRIX = {
  dashboard: { owner: 'edit', supervisor: 'view', maintenance: 'view' },
  employees: { owner: 'edit', supervisor: 'edit' },
  vehicles: { owner: 'edit', supervisor: 'view', maintenance: 'edit' },
  operations: { owner: 'edit', maintenance: 'edit', supervisor: 'view' },
  shipments: { owner: 'edit', supervisor: 'edit' },
  payroll: { owner: 'edit' },
  expenses: { owner: 'edit' },
  finance: { owner: 'edit' },
  reports: { owner: 'edit', supervisor: 'view', maintenance: 'view' },
  settings: { owner: 'edit' },
  audit: { owner: 'view' },
  users: { owner: 'edit' },
};

export const canView = (role, page) => !!MATRIX[page]?.[role];
export const canEdit = (role, page) => MATRIX[page]?.[role] === 'edit';
// الاطلاع على الرواتب والبيانات المالية للمالك فقط
export const seesMoney = (role) => role === 'owner';
// تسليم/استلام العهدة متاح للمشرف أيضاً
export const canCustody = (role) => role === 'owner' || role === 'supervisor' || role === 'maintenance';

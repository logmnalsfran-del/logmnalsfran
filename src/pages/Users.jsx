import { useEffect, useState } from 'react';
import { PageHeader, Card, Button, Badge, Modal, Field, FormGrid, useForm, Notice, Empty } from '../components/ui';
import { isRemote, createSignupClient } from '../lib/supabase';
import { listProfiles, updateProfile } from '../lib/remote';
import { log, useSession } from '../lib/db';
import { ROLES } from '../lib/constants';

const ROLE_OPTIONS = [
  { value: 'owner', label: ROLES.owner.label },
  { value: 'supervisor', label: ROLES.supervisor.label },
  { value: 'maintenance', label: ROLES.maintenance.label },
  { value: 'pending', label: 'بدون صلاحية (بانتظار التفعيل)' },
];

export default function Users() {
  const session = useSession();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const load = () => listProfiles().then(setRows).catch((e) => setError(e.message));
  useEffect(() => { if (isRemote) load(); }, []);

  if (!isRemote) {
    return (
      <>
        <PageHeader title="المستخدمون" />
        <Notice>إدارة المستخدمين متاحة بعد ربط التطبيق بـ Supabase. في الوضع التجريبي يتم الدخول باختيار الدور.</Notice>
      </>
    );
  }

  const change = async (p, patch, text) => {
    try {
      await updateProfile(p.id, patch);
      log('تعديل', 'المستخدمون', text);
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <>
      <PageHeader title="المستخدمون" subtitle="حسابات الدخول وأدوارها">
        <Button icon="plus" onClick={() => setAdding(true)}>إضافة مستخدم</Button>
      </PageHeader>
      {error && <Notice tone="danger">{error}</Notice>}
      <Card flush>
        {!rows ? <Empty>جارٍ التحميل…</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>الاسم</th><th>البريد</th><th>الدور</th><th>الحالة</th></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.full_name || '—'}</strong>{p.id === session.userId && <div className="sub">أنت</div>}</td>
                    <td dir="ltr" style={{ textAlign: 'right' }}>{p.email}</td>
                    <td>
                      <select value={p.role} onChange={(e) => change(p, { role: e.target.value }, `تغيير دور ${p.email} إلى ${e.target.value}`)} style={{ width: 'auto' }}>
                        {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td>
                      <label className="check">
                        <input type="checkbox" checked={p.active} onChange={(e) => change(p, { active: e.target.checked }, `${e.target.checked ? 'تفعيل' : 'إيقاف'} حساب ${p.email}`)} />
                        {p.active ? <Badge tone="green">مفعّل</Badge> : <Badge tone="gray">موقوف</Badge>}
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="small muted">المستخدم الجديد يدخل بالبريد وكلمة المرور التي تحددها له. إن كان «تأكيد البريد» مفعّلاً في Supabase فعليه تأكيد بريده أولاً.</p>
      {adding && <AddUser onClose={() => setAdding(false)} onDone={load} />}
    </>
  );
}

function AddUser({ onClose, onDone }) {
  const { values: v, bind } = useForm({ fullName: '', email: '', password: '', role: 'supervisor' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!v.fullName || !v.email || v.password.length < 8) return alert('أكمل الاسم والبريد، وكلمة مرور من 8 أحرف على الأقل');
    setBusy(true);
    try {
      const { data, error } = await createSignupClient().auth.signUp({ email: v.email.trim(), password: v.password, options: { data: { full_name: v.fullName } } });
      if (error) throw error;
      if (!data.user?.id || data.user.identities?.length === 0) throw new Error('هذا البريد مسجّل مسبقاً');
      await updateProfile(data.user.id, { role: v.role, full_name: v.fullName });
      log('إضافة', 'المستخدمون', `إنشاء حساب ${v.email} بدور ${ROLES[v.role]?.label || v.role}`);
      onDone();
      onClose();
    } catch (e) {
      alert(`تعذّر إنشاء الحساب: ${e.message}`);
    }
    setBusy(false);
  };
  return (
    <Modal title="إضافة مستخدم" onClose={onClose}
      footer={<><Button icon="check" onClick={save} disabled={busy}>{busy ? 'جارٍ الإنشاء…' : 'إنشاء الحساب'}</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button></>}>
      <FormGrid cols={2}>
        <Field label="الاسم" {...bind('fullName')} span={2} />
        <Field label="البريد الإلكتروني" type="email" dir="ltr" {...bind('email')} />
        <Field label="كلمة المرور المؤقتة" type="text" dir="ltr" {...bind('password')} hint="8 أحرف على الأقل" />
        <Field label="الدور" as="select" options={ROLE_OPTIONS.filter((o) => o.value !== 'pending')} {...bind('role')} span={2} />
      </FormGrid>
    </Modal>
  );
}

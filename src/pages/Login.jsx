import { useState } from 'react';
import { Icon, Button } from '../components/ui';
import { signIn, signInWithPassword, getState, signOut, useStatus, useSession } from '../lib/db';
import { isRemote } from '../lib/supabase';

const OPTIONS = [
  { role: 'owner', icon: 'coins', title: 'المالك / المدير العام', desc: 'صلاحيات كاملة: الرواتب، المصروفات، الأرباح، الإعدادات' },
  { role: 'supervisor', icon: 'users', title: 'المشرف', desc: 'الموظفون، إدخال الشحنات اليومية، عهدة السيارات' },
  { role: 'maintenance', icon: 'wrench', title: 'مسؤول الصيانة', desc: 'السيارات، الصيانة، الوقود، الحوادث' },
];

function Shell({ children }) {
  const name = getState().settings.companyName;
  return (
    <div className="login">
      <div className="login-card">
        <div className="brand-mark" style={{ color: 'var(--navy)', marginBottom: 18 }}>
          <span className="logo"><Icon name="truck" size={20} /></span>{name}
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Login() {
  return isRemote ? <RemoteLogin /> : <DemoLogin />;
}

function DemoLogin() {
  return (
    <Shell>
      <h1>نظام إدارة <span className="accent">الشركة اللوجستية</span></h1>
      <p className="muted">الموظفون، أسطول السيارات، الرواتب والحوافز، المصروفات والأرباح.</p>
      <div className="role-list">
        {OPTIONS.map((o) => (
          <button key={o.role} type="button" className="role-btn" onClick={() => signIn(o.role)}>
            <span className="ic"><Icon name={o.icon} size={20} /></span>
            <span><strong>الدخول كـ {o.title}</strong><small>{o.desc}</small></span>
          </button>
        ))}
      </div>
      <p className="muted small" style={{ marginTop: 18 }}>نسخة تجريبية محلية: الدخول باختيار الدور دون كلمة مرور.</p>
    </Shell>
  );
}

function RemoteLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await signInWithPassword(email, password); } catch (err) { setError(err.message); }
    setBusy(false);
  };
  return (
    <Shell>
      <h1>تسجيل <span className="accent">الدخول</span></h1>
      <p className="muted">نظام إدارة الموظفين والأسطول والرواتب</p>
      <form onSubmit={submit} style={{ display: 'grid', gap: 14, marginTop: 18 }}>
        <label className="field"><span className="field-label">البريد الإلكتروني</span>
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
        </label>
        <label className="field"><span className="field-label">كلمة المرور</span>
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
        </label>
        {error && <div className="notice n-danger" style={{ margin: 0 }}>{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={busy} style={{ justifyContent: 'center' }}>{busy ? 'جارٍ الدخول…' : 'دخول'}</button>
      </form>
      <p className="muted small" style={{ marginTop: 18 }}>الحسابات يُنشئها المالك من شاشة «المستخدمون». أول حساب يُسجَّل في النظام يصبح المالك.</p>
    </Shell>
  );
}

export function StatusScreen() {
  const status = useStatus();
  const session = useSession();
  if (status.phase === 'pending') {
    return (
      <Shell>
        <h1>الحساب بانتظار التفعيل</h1>
        <p className="muted">سجّلت الدخول باسم <strong dir="ltr">{session?.email}</strong>، لكن لم يُحدَّد لك دور بعد. اطلب من المالك تفعيل حسابك من شاشة «المستخدمون».</p>
        <Button variant="ghost" icon="logout" onClick={signOut}>تسجيل الخروج</Button>
      </Shell>
    );
  }
  if (status.phase === 'error') {
    return (
      <Shell>
        <h1>تعذّر تحميل البيانات</h1>
        <div className="notice n-danger">{status.error}</div>
        <div className="toolbar">
          <Button onClick={() => window.location.reload()}>إعادة المحاولة</Button>
          <Button variant="ghost" icon="logout" onClick={signOut}>تسجيل الخروج</Button>
        </div>
      </Shell>
    );
  }
  return (
    <div className="login">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div className="spinner" />
        <p className="muted">جارٍ تحميل البيانات…</p>
      </div>
    </div>
  );
}

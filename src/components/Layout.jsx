import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon, IconButton } from './ui';
import { useDb, useSession, useStatus, signOut } from '../lib/db';
import { isRemote } from '../lib/supabase';
import { canView } from '../lib/permissions';
import { alerts } from '../lib/calc';
import { ROLES } from '../lib/constants';

const NAV = [
  { group: 'عام' },
  { to: '/', page: 'dashboard', label: 'لوحة التحكم', icon: 'home', end: true },
  { group: 'الموارد' },
  { to: '/employees', page: 'employees', label: 'الموظفون', icon: 'users' },
  { to: '/vehicles', page: 'vehicles', label: 'السيارات', icon: 'truck' },
  { to: '/operations', page: 'operations', label: 'الصيانة والتشغيل', icon: 'wrench' },
  { group: 'العمليات والرواتب' },
  { to: '/shipments', page: 'shipments', label: 'الشحنات اليومية', icon: 'box' },
  { to: '/payroll', page: 'payroll', label: 'مسيّر الرواتب', icon: 'wallet' },
  { group: 'المالية' },
  { to: '/expenses', page: 'expenses', label: 'المصروفات الشهرية', icon: 'receipt' },
  { to: '/finance', page: 'finance', label: 'الأرباح ومخصص الهالك', icon: 'coins' },
  { to: '/reports', page: 'reports', label: 'التقارير', icon: 'chart' },
  { group: 'النظام' },
  { to: '/users', page: 'users', label: 'المستخدمون', icon: 'lock' },
  { to: '/settings', page: 'settings', label: 'الإعدادات', icon: 'settings' },
  { to: '/audit', page: 'audit', label: 'سجل العمليات', icon: 'log' },
];

export default function Layout() {
  const db = useDb();
  const session = useSession();
  const status = useStatus();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const role = session.role;
  const alertCount = alerts(db).length;

  const items = NAV.filter((n, i) => {
    if (n.group) {
      // أظهر عنوان المجموعة فقط إن كان تحتها عنصر مسموح
      for (let j = i + 1; j < NAV.length && !NAV[j].group; j++) if (canView(role, NAV[j].page)) return true;
      return false;
    }
    return canView(role, n.page);
  });

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><span className="logo"><Icon name="truck" size={20} /></span>{db.settings.companyName}</div>
          <small>نظام إدارة الموظفين والأسطول والرواتب</small>
        </div>
        <nav className="nav" onClick={() => setOpen(false)}>
          {items.map((n, i) => n.group
            ? <div key={`g${i}`} className="nav-group">{n.group}</div>
            : (
              <NavLink key={n.to} to={n.to} end={n.end}>
                <Icon name={n.icon} />{n.label}
                {n.page === 'dashboard' && alertCount > 0 && <span className="count">{alertCount}</span>}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-foot">
          <div className="user-chip">
            <span className="avatar">{(session.name || ROLES[role].short)[0]}</span>
            <span className="who">{session.name}<small>{isRemote ? (status.syncing ? 'جارٍ الحفظ…' : ROLES[role].label) : 'دخول تجريبي'}</small></span>
            <IconButton icon="logout" title={isRemote ? 'تسجيل الخروج' : 'تبديل المستخدم'} onClick={signOut} />
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <IconButton icon="menu" title="القائمة" onClick={() => setOpen(true)} />
          <strong>{db.settings.companyName}</strong>
        </header>
        {!isRemote && <div className="demo-ribbon">نسخة تجريبية محلية — البيانات محفوظة في هذا المتصفح فقط.</div>}
        <main className="content" key={location.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { daysUntil, fmtDate, monthLabel, monthsBack } from '../lib/format';

// ---------- أيقونات خطية بسيطة ----------
const P = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  users: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 19v-1a4 4 0 0 0-3-3.9M15.5 3.2a3.5 3.5 0 0 1 0 6.6',
  truck: 'M3 6h11v10H3zM14 9h4l3 3v4h-7M7.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8V21h3.2l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.5 2.5-2.5-.7-.7-2.5z',
  box: 'M21 8l-9-5-9 5 9 5 9-5zM3 8v8l9 5 9-5V8M12 13v8',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2-3h11l1 3M16 13.5h2',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  coins: 'M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3zM4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 10h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1z',
  log: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  plus: 'M12 5v14M5 12h14',
  edit: 'M11 4H4v16h16v-7M18.5 2.5a2.1 2.1 0 1 1 3 3L12 15l-4 1 1-4z',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
  x: 'M18 6L6 18M6 6l12 12',
  menu: 'M3 6h18M3 12h18M3 18h18',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
  check: 'M20 6L9 17l-5-5',
  arrow: 'M15 18l-6-6 6-6',
  back: 'M9 18l6-6-6-6',
  swap: 'M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4',
};
export function Icon({ name, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className = '', flush }) {
  return (
    <section className={`card ${flush ? 'flush' : ''} ${className}`}>
      {(title || actions) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {actions && <div className="card-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = 'navy', icon }) {
  return (
    <div className={`stat tone-${tone}`}>
      {icon && <span className="stat-icon"><Icon name={icon} size={20} /></span>}
      <div>
        <div className="stat-label">{label}</div>
        <div className="stat-value">{value}</div>
        {hint && <div className="stat-hint">{hint}</div>}
      </div>
    </div>
  );
}

export const Badge = ({ tone = 'gray', children }) => <span className={`badge b-${tone}`}>{children}</span>;

export function ExpiryBadge({ date }) {
  if (!date) return <span className="muted">—</span>;
  const left = daysUntil(date);
  const tone = left < 0 ? 'red' : left <= 30 ? 'orange' : 'green';
  const text = left < 0 ? `منتهية منذ ${-left} يوم` : left === 0 ? 'تنتهي اليوم' : left <= 30 ? `باقي ${left} يوم` : fmtDate(date);
  return <Badge tone={tone}>{text}</Badge>;
}

export function Button({ variant = 'primary', icon, children, ...rest }) {
  return (
    <button type="button" className={`btn btn-${variant}`} {...rest}>
      {icon && <Icon name={icon} size={16} />}
      {children && <span>{children}</span>}
    </button>
  );
}

export function IconButton({ icon, title, tone, ...rest }) {
  return (
    <button type="button" className={`icon-btn ${tone ? `tone-${tone}` : ''}`} title={title} aria-label={title} {...rest}>
      <Icon name={icon} size={16} />
    </button>
  );
}

export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>{title}</h3>
          <IconButton icon="x" title="إغلاق" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// حقل نموذج موحّد: input / select / textarea
export function Field({ label, as = 'input', options, span, hint, children, ...rest }) {
  let control;
  if (as === 'select') {
    control = (
      <select {...rest}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  } else if (as === 'textarea') control = <textarea rows={3} {...rest} />;
  else if (as === 'custom') control = children;
  else control = <input {...rest} />;
  return (
    <label className={`field ${span ? `span-${span}` : ''}`}>
      <span className="field-label">{label}</span>
      {control}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export const FormGrid = ({ children, cols = 3 }) => <div className={`form-grid cols-${cols}`}>{children}</div>;
export const FormSection = ({ title, children }) => (
  <fieldset className="form-section"><legend>{title}</legend>{children}</fieldset>
);

export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const bind = (name, parse) => ({
    name,
    value: getPath(values, name) ?? '',
    onChange: (e) => {
      const raw = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      setValues((v) => setPath(v, name, parse ? parse(raw) : raw));
    },
  });
  const set = (name, value) => setValues((v) => setPath(v, name, value));
  return { values, setValues, bind, set };
}
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function setPath(obj, path, value) {
  const [k, ...rest] = path.split('.');
  if (!rest.length) return { ...obj, [k]: value };
  return { ...obj, [k]: setPath(obj?.[k] || {}, rest.join('.'), value) };
}

export function Empty({ children = 'لا توجد بيانات' }) {
  return <div className="empty">{children}</div>;
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={active === t.key} className={active === t.key ? 'active' : ''} onClick={() => onChange(t.key)}>
          {t.label}{t.count !== undefined && <span className="tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function MonthSelect({ value, onChange, count = 18 }) {
  return (
    <select className="month-select" value={value} onChange={(e) => onChange(e.target.value)} aria-label="الشهر">
      {monthsBack(count).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
    </select>
  );
}

export function SearchBox({ value, onChange, placeholder = 'بحث...' }) {
  return <input className="search" type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
}

export function Notice({ tone = 'info', children }) {
  return <div className={`notice n-${tone}`}>{children}</div>;
}

// شريط أفقي بسيط للرسوم
export function Bar({ value, max, tone = 'navy', label }) {
  const pct = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="bar" title={label}>
      <div className={`bar-fill tone-${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function confirmAction(message) {
  return window.confirm(message);
}

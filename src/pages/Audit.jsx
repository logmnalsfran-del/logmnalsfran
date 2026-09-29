import { useState } from 'react';
import { useDb } from '../lib/db';
import { PageHeader, Card, Badge, SearchBox, Empty, Button } from '../components/ui';
import { downloadCSV } from '../lib/export';

const TONES = { إضافة: 'green', تعديل: 'navy', حذف: 'red', إعدادات: 'orange' };

export default function Audit() {
  const db = useDb();
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(100);
  const rows = db.audit.filter((a) => !q || `${a.action} ${a.details} ${a.user}`.includes(q));
  const at = (iso) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
  return (
    <>
      <PageHeader title="سجل العمليات" subtitle="من أضاف أو عدّل أو حذف، ومتى">
        <Button variant="ghost" icon="download" onClick={() => downloadCSV('سجل-العمليات', ['الوقت', 'المستخدم', 'العملية', 'التفاصيل'], rows.map((a) => [at(a.at), a.user, a.action, a.details]))}>تصدير Excel</Button>
      </PageHeader>
      <div className="toolbar"><SearchBox value={q} onChange={setQ} placeholder="بحث في السجل" /></div>
      <Card flush>
        {rows.length === 0 ? <Empty /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>التفاصيل</th></tr></thead>
              <tbody>
                {rows.slice(0, limit).map((a) => (
                  <tr key={a.id}><td className="num nowrap">{at(a.at)}</td><td>{a.user}</td><td><Badge tone={TONES[a.action] || 'gray'}>{a.action}</Badge></td><td>{a.details}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {rows.length > limit && <Button variant="ghost" onClick={() => setLimit(limit + 200)}>عرض المزيد</Button>}
    </>
  );
}

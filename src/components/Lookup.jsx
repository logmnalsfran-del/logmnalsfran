import { useId } from 'react';
import { Field } from './ui';
import { insert, useDb } from '../lib/db';
import { LISTS, optionsOf, suggestions } from '../lib/lookups';

const ADD = '__add__';

// قائمة منسدلة مرنة: آخر خيار «+ إضافة جديد…» يضيف قيمة للقائمة ويختارها مباشرة
export function LookupField({ list, value, onChange, name, ...rest }) {
  const db = useDb();
  const options = [...optionsOf(list, db), { value: ADD, label: '+ إضافة جديد…' }];
  const handle = (e) => {
    if (e.target.value !== ADD) return onChange(e);
    const text = window.prompt(`إضافة إلى «${LISTS[list].label}» — اكتب الاسم:`);
    const clean = text?.trim();
    if (!clean) return undefined;
    const exists = optionsOf(list, db).find((o) => o.label === clean);
    if (exists) return onChange({ target: { value: exists.value } });
    const meta = list === 'jobTypes'
      ? { shipments: window.confirm(`هل فئة «${clean}» تسلّم شحنات (تُدخل لها شحنات وتستحق الحافز)؟\n\nموافق = نعم، إلغاء = لا`) }
      : {};
    const row = insert('lookups', { list, name: clean, meta }, `إضافة «${clean}» إلى ${LISTS[list].label}`);
    return onChange({ target: { value: row.id } });
  };
  return <Field as="select" options={options} name={name} value={value} onChange={handle} {...rest} />;
}

// حقل نصي حر مع اقتراحات مما أُدخل سابقاً (يقبل أي قيمة جديدة)
export function SuggestField({ col, field, ...rest }) {
  const db = useDb();
  const id = useId();
  return (
    <>
      <Field list={id} autoComplete="off" {...rest} />
      <datalist id={id}>{suggestions(col, field, db).map((s) => <option key={s} value={s} />)}</datalist>
    </>
  );
}

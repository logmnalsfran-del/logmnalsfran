import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// بدون متغيرات البيئة يعمل التطبيق في الوضع التجريبي المحلي (localStorage)
export const isRemote = Boolean(url && key);
export const supabase = isRemote ? createClient(url, key) : null;

// عميل ثانوي لإنشاء مستخدمين جدد دون قطع جلسة المالك الحالية
export function createSignupClient() {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'logistics-signup' } });
}

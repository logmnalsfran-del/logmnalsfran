// بيانات تجريبية للعرض على صاحب المصلحة (12 مندوباً، 10 سيارات، آخر 3 أشهر)
// التواريخ نسبية لتاريخ اليوم حتى تبقى التنبيهات والأشهر منطقية متى فُتح التطبيق.
import {
  uid, today, thisMonth, addMonths, addDays, daysInMonth, monthEnd, weekdayAr, round2,
} from './format';
import { computePayroll, provisionFor, revenueFor, totalExpenses } from './calc';

// مولّد أرقام شبه عشوائية ثابت حتى تتكرر نفس البيانات في كل إعادة ضبط
function rng(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

export function buildSeed() {
  const rand = rng(20260929);
  const between = (a, b) => Math.round(a + rand() * (b - a));
  const T = today();
  const M = thisMonth();
  const months = [addMonths(M, -2), addMonths(M, -1), M];
  const rel = (days) => addDays(T, days);

  const settings = {
    companyName: 'الشركة اللوجستية',
    alertDays: 30,
    incentiveRules: [{ id: uid(), from: addMonths(M, -12), threshold: 1000, rate: 2, note: 'القاعدة الأساسية' }],
    revenuePerShipment: 0,
    defaultRecoveryPct: 10,
    capitalAmount: 0,
  };

  // ---------- الموظفون ----------
  const doc = (n, d) => ({ number: n, expiry: rel(d) });
  const drivers = [
    ['محمد عارف خان', 'باكستاني'], ['عبدالله سعيد اليامي', 'سعودي'], ['راجيش كومار', 'هندي'],
    ['أحمد محمود فتحي', 'مصري'], ['سليم عبدالرحمن', 'يمني'], ['إمران حسين', 'بنغلاديشي'],
    ['عمر الطيب بشير', 'سوداني'], ['فيصل ناصر القحطاني', 'سعودي'], ['شاهد إقبال', 'باكستاني'],
    ['مصطفى علي حسن', 'مصري'], ['أنور الحق', 'بنغلاديشي'], ['يوسف مبارك الشهري', 'سعودي'],
  ];
  const expiries = [200, 18, 340, 95, 5, 260, 150, -3, 410, 60, 290, 25];
  const employees = [
    {
      id: uid(), name: 'خالد مسفر العتيبي', role: 'supervisor', title: 'مشرف العمليات', nationalId: '1087654321',
      nationality: 'سعودي', phone: '0551234501', birthDate: '1988-04-12', hireDate: '2023-02-01', status: 'active',
      baseSalary: 6500, allowances: 1500, iban: 'SA0380000000608010167519', externalId: '',
      docs: { iqama: doc('1087654321', 900), passport: doc('A1234567', 1200), license: doc('1087654321', 700), medical: doc('MD-1001', 120) },
      incentiveOverride: null, notes: '',
    },
    {
      id: uid(), name: 'محمد رفيق الدين', role: 'maintenance', title: 'مسؤول صيانة الأسطول', nationalId: '2398765412',
      nationality: 'هندي', phone: '0551234502', birthDate: '1985-09-30', hireDate: '2023-05-15', status: 'active',
      baseSalary: 4500, allowances: 800, iban: 'SA4420000001234567891234', externalId: '',
      docs: { iqama: doc('2398765412', 45), passport: doc('P9876543', 800), license: doc('2398765412', 500), medical: doc('MD-1002', 12) },
      incentiveOverride: null, notes: '',
    },
    ...drivers.map(([name, nat], i) => ({
      id: uid(), name, role: 'driver', title: 'مندوب توصيل', nationalId: String(2400000000 + i * 7919),
      nationality: nat, phone: `05512345${String(10 + i)}`, birthDate: `${1990 + (i % 8)}-0${1 + (i % 9)}-15`,
      hireDate: i === 11 ? addDays(`${months[1]}-01`, 9) : `202${4 + (i % 2)}-0${1 + (i % 9)}-01`,
      status: i === 10 ? 'leave' : 'active',
      baseSalary: 3000, allowances: 400, iban: `SA${10 + i}8000000${String(1000000000 + i * 12345).padStart(13, '0')}`,
      externalId: `DRV-${1040 + i}`,
      docs: {
        iqama: doc(String(2400000000 + i * 7919), expiries[i]),
        passport: doc(`P${7000000 + i * 311}`, expiries[(i + 3) % 12] + 300),
        license: doc(String(2400000000 + i * 7919), expiries[(i + 5) % 12] + 40),
        medical: doc(`MD-${2000 + i}`, expiries[(i + 7) % 12] + 10),
      },
      incentiveOverride: null, notes: '',
    })),
  ];
  const driverList = employees.filter((e) => e.role === 'driver');

  // ---------- السيارات ----------
  const models = [
    ['تويوتا', 'هايس', 2024, 'أبيض', 118000], ['تويوتا', 'هايس', 2024, 'أبيض', 118000],
    ['هيونداي', 'H1 فان', 2023, 'فضي', 96000], ['هيونداي', 'H1 فان', 2024, 'أبيض', 99000],
    ['نيسان', 'أورفان', 2023, 'أبيض', 104000], ['إيسوزو', 'D-Max', 2024, 'أبيض', 89000],
    ['تويوتا', 'هايلكس', 2025, 'أبيض', 97000], ['هيونداي', 'ستاريا كارجو', 2025, 'رمادي', 112000],
    ['كيا', 'K2700', 2023, 'أزرق', 82000], ['تويوتا', 'هايس', 2025, 'أبيض', 121000],
  ];
  const letters = ['أ ب ج', 'ر س ص', 'ط ع ق', 'ك ل م', 'ن هـ و', 'ب د ر', 'س ط ك', 'ل ن ي', 'ح د ب', 'ع ق ل'];
  const vehicles = models.map(([make, model, year, color, price], i) => {
    const purchase = `${year === 2025 ? 2025 : 2024}-${String(1 + (i % 9)).padStart(2, '0')}-10`;
    const inst = i % 3 === 0;
    return {
      id: uid(), plate: `${letters[i]} ${4100 + i * 37}`, vin: `JTF${String(100000000000 + i * 7777777).slice(0, 12)}${i}`,
      make, model, year, color, purchaseDate: purchase, price, vendor: ['عبداللطيف جميل', 'الوعلان للسيارات', 'المجدوعي', 'الجبر'][i % 4],
      paymentMethod: inst ? 'installments' : 'cash', downPayment: inst ? 20000 : 0,
      installmentAmount: inst ? round2((price - 20000) / 36) : 0, installmentCount: inst ? 36 : 0,
      installmentStart: inst ? addMonths(purchase.slice(0, 7), 1) : '',
      odometer: between(38000, 96000), status: i === 4 ? 'workshop' : 'active',
      docs: {
        registration: { number: `REG-${5500 + i}`, expiry: rel([400, 22, 300, 180, 90, 610, 11, 250, 520, 130][i]) },
        insurance: { number: `INS-${8800 + i}`, expiry: rel([28, 210, 160, 45, 330, 9, 290, 120, 70, 350][i]) },
        inspection: { number: `FAH-${300 + i}`, expiry: rel([150, 95, -6, 260, 40, 190, 75, 310, 16, 220][i]) },
        operatingCard: { number: `OP-${1200 + i}`, expiry: rel([240, 330, 110, 19, 280, 150, 360, 60, 200, 100][i]) },
      },
      disposal: null, notes: '',
    };
  });

  // ---------- العهدة: 10 سيارات على أول 10 مناديب ----------
  const custody = vehicles.map((v, i) => ({
    id: uid(), vehicleId: v.id, employeeId: driverList[i].id, fromDate: addMonths(M, -5) + '-01', toDate: null,
    odometerOut: v.odometer - between(9000, 15000), odometerIn: null, conditionOut: 'سليمة', conditionIn: '',
  }));
  // سجل سابق: السيارة الأولى كانت مع المندوب الحادي عشر
  custody.push({
    id: uid(), vehicleId: vehicles[0].id, employeeId: driverList[10].id, fromDate: addMonths(M, -9) + '-01',
    toDate: addMonths(M, -5) + '-01', odometerOut: vehicles[0].odometer - 30000, odometerIn: vehicles[0].odometer - 15000,
    conditionOut: 'سليمة', conditionIn: 'خدش بسيط بالباب الخلفي',
  });

  // ---------- الشحنات اليومية ----------
  const shipments = [];
  const skill = driverList.map(() => between(36, 47));
  months.forEach((m) => {
    const last = m === M ? Number(T.slice(8, 10)) - 1 : daysInMonth(m);
    for (let d = 1; d <= last; d++) {
      const date = `${m}-${String(d).padStart(2, '0')}`;
      if (weekdayAr(date) === 'الجمعة') continue;
      driverList.forEach((e, i) => {
        if (e.status === 'leave' && m === M) return;
        if (e.hireDate > date) return;
        if (rand() < 0.04) return; // غياب عارض
        shipments.push({ id: uid(), employeeId: e.id, date, count: Math.max(0, skill[i] + between(-8, 8)) });
      });
    }
  });

  // ---------- الصيانة والجداول والوقود والحوادث ----------
  const maintenance = [];
  const fuel = [];
  const schedules = [];
  vehicles.forEach((v, i) => {
    schedules.push({ id: uid(), vehicleId: v.id, name: 'غيار زيت وفلتر', everyKm: 5000, everyDays: 90, lastKm: v.odometer - [4800, 1200, 3000, 4650, 500, 2500, 3900, 800, 4950, 2000][i], lastDate: rel(-between(20, 80)) });
    schedules.push({ id: uid(), vehicleId: v.id, name: 'فحص الإطارات والفرامل', everyKm: 20000, everyDays: 180, lastKm: v.odometer - between(2000, 19000), lastDate: rel(-between(30, 170)) });
    months.forEach((m, mi) => {
      const lastDay = m === M ? Number(T.slice(8, 10)) - 1 : daysInMonth(m);
      [5, 12, 19, 26].filter((d) => d <= lastDay).forEach((d, k) => fuel.push({
        id: uid(), vehicleId: v.id, date: `${m}-${String(d).padStart(2, '0')}`, liters: between(45, 70),
        cost: between(105, 160) * 2, odometer: v.odometer - (2 - mi) * 3200 - (3 - k) * 800,
      }));
      if ((i + mi) % 3 === 0) maintenance.push({
        id: uid(), vehicleId: v.id, date: `${m}-${String(between(3, Math.max(3, lastDay))).padStart(2, '0')}`, type: 'periodic',
        workshop: ['مركز بترومين', 'ورشة الأمانة', 'توكيل عبداللطيف جميل'][i % 3], description: 'غيار زيت وفلتر',
        parts: 'زيت 5W-30، فلتر زيت', cost: between(280, 420), odometer: v.odometer - (2 - mi) * 3200,
      });
    });
  });
  maintenance.push({ id: uid(), vehicleId: vehicles[4].id, date: `${M}-${String(Math.max(1, Number(T.slice(8, 10)) - 3)).padStart(2, '0')}`, type: 'emergency', workshop: 'ورشة الأمانة', description: 'إصلاح ناقل الحركة', parts: 'طقم كلتش، زيت قير', cost: 3850, odometer: vehicles[4].odometer });
  maintenance.push({ id: uid(), vehicleId: vehicles[2].id, date: `${months[1]}-14`, type: 'emergency', workshop: 'مركز بترومين', description: 'تغيير بطارية', parts: 'بطارية 70 أمبير', cost: 520, odometer: vehicles[2].odometer - 2500 });
  maintenance.push({ id: uid(), vehicleId: vehicles[7].id, date: `${months[0]}-21`, type: 'emergency', workshop: 'الجبر للإطارات', description: 'تغيير 4 إطارات', parts: 'إطارات 195R15', cost: 2200, odometer: vehicles[7].odometer - 6000 });

  const incidents = [
    { id: uid(), vehicleId: vehicles[3].id, employeeId: driverList[3].id, date: `${months[0]}-09`, kind: 'violation', description: 'تجاوز السرعة', cost: 300 },
    { id: uid(), vehicleId: vehicles[6].id, employeeId: driverList[6].id, date: `${months[1]}-17`, kind: 'accident', description: 'صدمة خفيفة بالصدام الأمامي', cost: 1450 },
    { id: uid(), vehicleId: vehicles[1].id, employeeId: driverList[1].id, date: `${M}-${String(Math.max(1, Number(T.slice(8, 10)) - 8)).padStart(2, '0')}`, kind: 'violation', description: 'وقوف خاطئ', cost: 150 },
  ];

  // ---------- المصروفات ----------
  const cat = (name) => ({ id: uid(), name });
  const expenseCategories = [
    cat('إيجار المقر والسكن'), cat('الكهرباء والماء'), cat('الاتصالات والإنترنت'), cat('تأمين السيارات'),
    cat('تجديد الوثائق والرسوم الحكومية'), cat('مصاريف إدارية ونثرية'), cat('أخرى'),
  ];
  const C = Object.fromEntries(expenseCategories.map((c) => [c.name, c.id]));
  const recurring = [
    { id: uid(), categoryId: C['إيجار المقر والسكن'], amount: 6500, description: 'إيجار سكن المناديب', startMonth: addMonths(M, -12), endMonth: null, day: 1 },
    { id: uid(), categoryId: C['إيجار المقر والسكن'], amount: 2500, description: 'إيجار المكتب والموقف', startMonth: addMonths(M, -12), endMonth: null, day: 1 },
    { id: uid(), categoryId: C['الاتصالات والإنترنت'], amount: 950, description: 'باقات جوال المناديب والإنترنت', startMonth: addMonths(M, -12), endMonth: null, day: 5 },
    { id: uid(), categoryId: C['الكهرباء والماء'], amount: 1100, description: 'فاتورة الكهرباء والماء (تقديرية)', startMonth: addMonths(M, -12), endMonth: null, day: 10 },
  ];
  const expenses = [
    { id: uid(), date: `${months[0]}-12`, categoryId: C['تجديد الوثائق والرسوم الحكومية'], amount: 1900, description: 'تجديد إقامتين ورسوم مكتب العمل', vehicleId: '', paymentMethod: 'transfer' },
    { id: uid(), date: `${months[1]}-03`, categoryId: C['تأمين السيارات'], amount: 4200, description: `تجديد تأمين سيارة ${vehicles[5].plate}`, vehicleId: vehicles[5].id, paymentMethod: 'transfer' },
    { id: uid(), date: `${months[1]}-20`, categoryId: C['مصاريف إدارية ونثرية'], amount: 640, description: 'قرطاسية وأدوات مكتبية', vehicleId: '', paymentMethod: 'cash' },
    { id: uid(), date: `${M}-${String(Math.min(6, Number(T.slice(8, 10)))).padStart(2, '0')}`, categoryId: C['تجديد الوثائق والرسوم الحكومية'], amount: 850, description: `تجديد استمارة سيارة ${vehicles[2].plate} والفحص الدوري`, vehicleId: vehicles[2].id, paymentMethod: 'card' },
    { id: uid(), date: `${M}-${String(Math.min(9, Number(T.slice(8, 10)))).padStart(2, '0')}`, categoryId: C['مصاريف إدارية ونثرية'], amount: 380, description: 'مياه وضيافة للمكتب', vehicleId: '', paymentMethod: 'cash' },
  ];

  const adjustments = [
    { id: uid(), employeeId: driverList[2].id, month: M, kind: 'deduction', label: 'سلفة', amount: 500 },
    { id: uid(), employeeId: driverList[7].id, month: M, kind: 'allowance', label: 'بدل عمل إضافي', amount: 250 },
  ];

  const db = {
    settings, employees, vehicles, custody, maintenance, schedules, fuel, incidents, shipments, adjustments,
    payrollRuns: [], lookups: [], expenseCategories, expenses, recurring, revenues: [], reserve: [], closedMonths: [], audit: [],
  };

  // إيرادات الأشهر: ما تدفعه الشركة الكبرى (أرقام توضيحية ≈ 9.5 ريال للشحنة)
  months.slice(0, 2).forEach((m, mi) => {
    const count = shipments.filter((s) => s.date.startsWith(m)).reduce((s, x) => s + x.count, 0);
    db.revenues.push({ id: uid(), month: m, date: `${addMonths(m, 1)}-05`, amount: Math.round(count * 9.5 / 100) * 100, description: 'مستحقات الشركة الرئيسية عن الشحنات', source: 'الشركة الرئيسية', recoveryPct: [10, 12][mi] });
  });

  // اعتماد رواتب الشهرين السابقين وإقفالهما وترحيل نسبة استرداد رأس المال
  months.slice(0, 2).forEach((m) => {
    const rows = computePayroll(db, m);
    db.payrollRuns.push({ id: uid(), month: m, approvedAt: `${monthEnd(m)}T18:00:00.000Z`, approvedBy: 'المالك / المدير العام', rows, total: round2(rows.reduce((s, r) => s + r.net, 0)) });
  });
  months.slice(0, 2).forEach((m) => {
    const revenue = revenueFor(db, m).total;
    const expensesTotal = totalExpenses(db, m);
    const provision = provisionFor(db, m);
    const operatingProfit = round2(revenue - expensesTotal);
    db.closedMonths.push({ id: uid(), month: m, closedAt: `${addMonths(m, 1)}-06T10:00:00.000Z`, revenue, expenses: expensesTotal, operatingProfit, provision, net: round2(operatingProfit - provision) });
    db.reserve.push({ id: uid(), date: `${addMonths(m, 1)}-06`, month: m, type: 'deposit', amount: provision, note: `استرداد رأس المال — شهر ${m}` });
  });

  db.audit.push({ id: uid(), at: new Date().toISOString(), user: 'النظام', action: 'تهيئة', entity: 'البيانات', details: 'تحميل البيانات التجريبية' });
  return db;
}

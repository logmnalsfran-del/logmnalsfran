import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { useSession, useStatus } from './lib/db';
import { isRemote } from './lib/supabase';
import { canView } from './lib/permissions';
import Login, { StatusScreen } from './pages/Login';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import EmployeeDetail from './pages/EmployeeDetail';
import Vehicles from './pages/Vehicles';
import VehicleDetail from './pages/VehicleDetail';
import Operations from './pages/Operations';
import Shipments from './pages/Shipments';
import Payroll from './pages/Payroll';
import Expenses from './pages/Expenses';
import Finance from './pages/Finance';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import Audit from './pages/Audit';
import Users from './pages/Users';

function Guard({ page, children }) {
  const session = useSession();
  if (!canView(session.role, page)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const session = useSession();
  const status = useStatus();
  if (isRemote) {
    if (status.phase === 'login') return <Login />;
    if (status.phase !== 'ready') return <StatusScreen />;
  } else if (!session) return <Login />;
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="employees" element={<Guard page="employees"><Employees /></Guard>} />
          <Route path="employees/:id" element={<Guard page="employees"><EmployeeDetail /></Guard>} />
          <Route path="vehicles" element={<Guard page="vehicles"><Vehicles /></Guard>} />
          <Route path="vehicles/:id" element={<Guard page="vehicles"><VehicleDetail /></Guard>} />
          <Route path="operations" element={<Guard page="operations"><Operations /></Guard>} />
          <Route path="shipments" element={<Guard page="shipments"><Shipments /></Guard>} />
          <Route path="payroll" element={<Guard page="payroll"><Payroll /></Guard>} />
          <Route path="expenses" element={<Guard page="expenses"><Expenses /></Guard>} />
          <Route path="finance" element={<Guard page="finance"><Finance /></Guard>} />
          <Route path="reports" element={<Guard page="reports"><Reports /></Guard>} />
          <Route path="settings" element={<Guard page="settings"><Settings /></Guard>} />
          <Route path="audit" element={<Guard page="audit"><Audit /></Guard>} />
          <Route path="users" element={<Guard page="users"><Users /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

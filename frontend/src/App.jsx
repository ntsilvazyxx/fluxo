import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import { AppShell } from './layout/AppShell.jsx';
import { CalendarPage } from './pages/CalendarPage.jsx';
import { KanbanPage } from './pages/KanbanPage.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { MyTasksPage } from './pages/MyTasksPage.jsx';
import { TaskDetailPage } from './pages/TaskDetailPage.jsx';
import { TaskFormPage } from './pages/TaskFormPage.jsx';
import { NotificationsPage } from './pages/NotificationsPage.jsx';
import { TaskHistoryPage } from './pages/TaskHistoryPage.jsx';
import { TeamsPage } from './pages/TeamsPage.jsx';
import { UsersPage } from './pages/UsersPage.jsx';

const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx').then((module) => ({ default: module.DashboardPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx').then((module) => ({ default: module.ReportsPage })));

function Protected({ children }) {
  const { status } = useAuth();
  if (status === 'loading') return <div className="grid min-h-screen place-items-center">Carregando sessão…</div>;
  return status === 'authenticated' ? children : <Navigate to="/login" replace />;
}

function Roles({ allowed, children }) {
  const { user } = useAuth();
  return allowed.includes(user.role.code) ? children : <Navigate to="/minhas-tarefas" replace />;
}

const managers = ['ADMIN_MASTER', 'SECRETARY', 'MANAGER'];
const analysts = ['SECRETARY', 'MANAGER'];
const LoadingPage = ({ children }) => <Suspense fallback={<p className="text-muted">Carregando\u2026</p>}>{children}</Suspense>;

function AppRoutes() {
  const { status } = useAuth();
  return <Routes>
    <Route path="/login" element={status === 'authenticated' ? <Navigate to="/" replace /> : <LoginPage />} />
    <Route path="/" element={<Protected><AppShell /></Protected>}>
      <Route index element={<Roles allowed={analysts}><LoadingPage><DashboardPage /></LoadingPage></Roles>} />
      <Route path="dashboard" element={<Roles allowed={analysts}><LoadingPage><DashboardPage /></LoadingPage></Roles>} />
      <Route path="relatorios" element={<Roles allowed={analysts}><LoadingPage><ReportsPage /></LoadingPage></Roles>} />
      <Route path="kanban" element={<Roles allowed={managers}><KanbanPage /></Roles>} />
      <Route path="minhas-tarefas" element={<MyTasksPage />} />
      <Route path="historico" element={<TaskHistoryPage />} />
      <Route path="tarefas/nova" element={<Roles allowed={managers}><TaskFormPage /></Roles>} />
      <Route path="tarefas/:id" element={<TaskDetailPage />} />
      <Route path="usuarios" element={<Roles allowed={['ADMIN_MASTER', 'SECRETARY']}><UsersPage /></Roles>} />
      <Route path="equipes" element={<TeamsPage />} />
      <Route path="calendarios" element={<Roles allowed={managers}><CalendarPage /></Roles>} />
      <Route path="notificacoes" element={<NotificationsPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}

export function App() {
  return <AuthProvider><AppRoutes /></AuthProvider>;
}

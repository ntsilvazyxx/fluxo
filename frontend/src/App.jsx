import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import { AppShell } from './layout/AppShell.jsx';
const CalendarPage = lazy(() => import('./pages/CalendarPage.jsx').then((module) => ({ default: module.CalendarPage })));
const KanbanPage = lazy(() => import('./pages/KanbanPage.jsx').then((module) => ({ default: module.KanbanPage })));
import { LoginPage } from './pages/LoginPage.jsx';
const TaskDetailPage = lazy(() => import('./pages/TaskDetailPage.jsx').then((module) => ({ default: module.TaskDetailPage })));
const TaskFormPage = lazy(() => import('./pages/TaskFormPage.jsx').then((module) => ({ default: module.TaskFormPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage.jsx').then((module) => ({ default: module.NotificationsPage })));
const TaskHistoryPage = lazy(() => import('./pages/TaskHistoryPage.jsx').then((module) => ({ default: module.TaskHistoryPage })));
const TeamsPage = lazy(() => import('./pages/TeamsPage.jsx').then((module) => ({ default: module.TeamsPage })));
const UsersPage = lazy(() => import('./pages/UsersPage.jsx').then((module) => ({ default: module.UsersPage })));

const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx').then((module) => ({ default: module.DashboardPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx').then((module) => ({ default: module.ReportsPage })));
const PasswordRecoveryPage = lazy(() => import('./pages/PasswordRecoveryPage.jsx').then((module) => ({ default: module.PasswordRecoveryPage })));

function Protected({ children }) {
  const { status } = useAuth();
  if (status === 'loading') return <div className="grid min-h-screen place-items-center">Carregando sessão…</div>;
  return status === 'authenticated' ? children : <Navigate to="/login" replace />;
}

function Roles({ allowed, children }) {
  const { user } = useAuth();
  return allowed.includes(user.role.code) ? children : <Navigate to="/kanban" replace />;
}

function LegacyTask() {
  const { id } = useParams(); const location = useLocation();
  return <Navigate to={`/kanban/tarefas/${id}${location.search}${location.hash}`} replace />;
}
function LegacyMyTasks() {
  const location = useLocation();
  return <Navigate to={`/kanban${location.search}${location.hash}`} replace />;
}

const managers = ['ADMIN_MASTER', 'SECRETARY', 'MANAGER'];
const analysts = ['SECRETARY', 'MANAGER'];
const LoadingPage = ({ children }) => <Suspense fallback={<p className="text-muted">Carregando…</p>}>{children}</Suspense>;

function AppRoutes() {
  const { status } = useAuth();
  return <Routes>
    <Route path="/recuperar-senha" element={<PasswordRecoveryPage />} />
    <Route path="/login" element={status === 'authenticated' ? <Navigate to="/" replace /> : <LoginPage />} />
    <Route path="/" element={<Protected><AppShell /></Protected>}>
      <Route index element={<Roles allowed={analysts}><LoadingPage><DashboardPage /></LoadingPage></Roles>} />
      <Route path="dashboard" element={<Roles allowed={analysts}><LoadingPage><DashboardPage /></LoadingPage></Roles>} />
      <Route path="relatorios" element={<Roles allowed={analysts}><LoadingPage><ReportsPage /></LoadingPage></Roles>} />
      <Route path="kanban" element={<KanbanPage />} />
      <Route path="kanban/tarefas/:id" element={<TaskDetailPage />} />
      <Route path="minhas-tarefas" element={<LegacyMyTasks />} />
      <Route path="historico" element={<TaskHistoryPage />} />
      <Route path="tarefas/nova" element={<Roles allowed={managers}><TaskFormPage /></Roles>} />
      <Route path="tarefas/:id" element={<LegacyTask />} />
      <Route path="usuarios" element={<Roles allowed={['ADMIN_MASTER', 'SECRETARY']}><UsersPage /></Roles>} />
      <Route path="equipes" element={<TeamsPage />} />
      <Route path="calendarios" element={<Roles allowed={managers}><CalendarPage /></Roles>} />
      <Route path="notificacoes" element={<NotificationsPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}

export function App() {
  return <AuthProvider><Suspense fallback={<p role="status">Carregando página…</p>}><AppRoutes /></Suspense></AuthProvider>;
}

import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext.tsx';
import { AppShell } from './layout/AppShell.tsx';
const KanbanPage = lazy(() => import('./pages/KanbanPage.tsx').then((module) => ({ default: module.KanbanPage })));
import { LoginPage } from './pages/LoginPage.tsx';
const TaskDetailPage = lazy(() => import('./pages/TaskDetailPage.tsx').then((module) => ({ default: module.TaskDetailPage })));
const TaskFormPage = lazy(() => import('./pages/TaskFormPage.tsx').then((module) => ({ default: module.TaskFormPage })));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage.tsx').then((module) => ({ default: module.NotificationsPage })));
const TaskHistoryPage = lazy(() => import('./pages/TaskHistoryPage.tsx').then((module) => ({ default: module.TaskHistoryPage })));
const TeamsPage = lazy(() => import('./pages/TeamsPage.tsx').then((module) => ({ default: module.TeamsPage })));
const UsersPage = lazy(() => import('./pages/UsersPage.tsx').then((module) => ({ default: module.UsersPage })));

const DashboardPage = lazy(() => import('./pages/DashboardPage.tsx').then((module) => ({ default: module.DashboardPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage.tsx').then((module) => ({ default: module.ReportsPage })));
const PasswordRecoveryPage = lazy(() => import('./pages/PasswordRecoveryPage.tsx').then((module) => ({ default: module.PasswordRecoveryPage })));

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

function TaskCreation({ children }) {
  const { user, features } = useAuth();
  const allowed = user.role.code === 'ADMIN_MASTER' ? features.adminTaskCreation : ['SECRETARY', 'MANAGER'].includes(user.role.code);
  return allowed ? children : <Navigate to="/kanban" replace />;
}

const analysts = ['ADMIN_MASTER', 'SECRETARY', 'MANAGER'];
const LoadingPage = ({ children }) => <Suspense fallback={<p className="text-muted">Carregando…</p>}>{children}</Suspense>;

function AppRoutes() {
  const { status } = useAuth();
  return <Routes>
    <Route path="/recuperar-senha" element={<PasswordRecoveryPage />} />
    <Route path="/login" element={status === 'authenticated' ? <Navigate to="/kanban" replace /> : <LoginPage />} />
    <Route path="/" element={<Protected><AppShell /></Protected>}>
      <Route index element={<Navigate to="/kanban" replace />} />
      <Route path="dashboard" element={<Roles allowed={analysts}><LoadingPage><DashboardPage /></LoadingPage></Roles>} />
      <Route path="relatorios" element={<Roles allowed={analysts}><LoadingPage><ReportsPage /></LoadingPage></Roles>} />
      <Route path="kanban" element={<KanbanPage />} />
      <Route path="kanban/tarefas/:id" element={<TaskDetailPage />} />
      <Route path="minhas-tarefas" element={<LegacyMyTasks />} />
      <Route path="historico" element={<TaskHistoryPage />} />
      <Route path="tarefas/nova" element={<TaskCreation><TaskFormPage /></TaskCreation>} />
      <Route path="tarefas/:id" element={<LegacyTask />} />
      <Route path="usuarios" element={<Roles allowed={['ADMIN_MASTER', 'SECRETARY']}><UsersPage /></Roles>} />
      <Route path="equipes" element={<TeamsPage />} />
      <Route path="notificacoes" element={<NotificationsPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}

export function App() {
  return <AuthProvider><Suspense fallback={<p role="status">Carregando página…</p>}><AppRoutes /></Suspense></AuthProvider>;
}

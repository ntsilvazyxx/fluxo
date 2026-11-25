import { useNavigate } from 'react-router-dom';
import { TaskCreateForm } from '../tasks/TaskCreateModal.tsx';

export function TaskFormPage() {
  const navigate = useNavigate();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <p className="seaf-eyebrow text-brand-700">Nova tarefa</p>
      <h1 className="mt-1 seaf-page-title">Criar e encaminhar tarefa</h1>
      <TaskCreateForm
        onSuccess={(task) => navigate(`/kanban/tarefas/${task.id}`)}
        onCancel={() => navigate('/kanban')}
      />
    </div>
  );
}

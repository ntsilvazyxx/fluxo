# SDD 05 — Frontend React.js + JavaScript (mobile-first)

## Stack e estrutura
React.js com JSX, Vite, React Router, Tailwind CSS, biblioteca de componentes acessíveis compatível com JS (ex.: shadcn/ui), Lucide React. Dados remotos via TanStack Query (proposta), formulários validados (proposta: React Hook Form + Zod), estados de sessão em provider/contexto. Não introduzir TypeScript.

## Rotas/telas
- `/login`: autenticação, recuperação de acesso conforme política.
- `/dashboard`: indicadores por escopo (não disponível a técnico sem autorização).
- `/kanban`: Secretário global, Gestor equipes geridas; 3 colunas operacionais.
- `/minhas-tarefas`: todos os perfis executores, especialmente Técnico.
- `/tarefas/:id`: detalhe, histórico, atribuição, subtarefas, solicitações, evidências, ações permitidas.
- `/tarefas/nova`: Secretário/Gestor.
- `/historico`: concluídas/canceladas com filtros.
- `/equipes`, `/usuarios`: administração conforme perfil.
- `/calendarios`: gestor autorizado/secretário.
- `/notificacoes`, `/perfil`, `/configuracoes`: acesso escopado.

## Mobile-first
- Larguras alvo de verificação: 320, 375, 390, 430, 768, 1024 e 1440 px; sem overflow horizontal da página.
- Navegação compacta: cabeçalho e menu móvel acessível; desktop com sidebar. Área de toque mínima recomendada 44×44 CSS px.
- Kanban mobile: seletor de coluna por status ou rolagem horizontal de colunas com indicadores claros; cards legíveis e acionáveis sem hover.
- Formulários em uma coluna no mobile; modais complexos viram drawers/sheets ou páginas; campos de data/hora com timezone visível.
- Histórico e tabelas: cards responsivos ou tabela com rolagem interna, nunca conteúdo cortado.
- Acessibilidade: contraste WCAG AA, foco visível, navegação por teclado, labels e mensagens ARIA, `prefers-reduced-motion`.
- Rede lenta: skeleton, estados vazios/erro, feedback de carregamento, impedir duplo clique; cache invalidado após mutações; 409 exige recarga/reconciliação sem sobrescrever dados.

## Componentes
`AppShell`, `RoleGuard` (somente UX, não segurança), `TaskCard`, `TaskStatusBadge`, `PriorityBadge`, `DeadlineIndicator`, `KanbanBoard`, `TaskTimeline`, `AssignmentPanel`, `RequestDecisionPanel`, `SubtaskList`, `TaskForm`, `ImageUploader`, `FilterBar`, `NotificationCenter`, `ConfirmActionDialog`, `ConflictAlert`, `ResponsiveDataList`.

## Comportamento dos cartões
Card mostra título/ID, equipe, responsável, prioridade, prazo, atraso, quantidade de subtarefas, solicitações pendentes. Ao abrir: histórico e ações contextuais. Técnico em aguardando aceite vê aceitar/rejeitar; em andamento vê concluir, solicitar devolução e solicitar prorrogação conforme restrições. Não usar ações ambíguas "Aceitar/Devolver" no mesmo botão: cada ação tem nome claro e justificativa quando necessária.

## Regras de UX
Não mostrar botão que o usuário não pode usar; backend ainda valida tudo. Confirmar ações irreversíveis; exibir motivo e histórico. No mobile, preservar contexto de filtro e rolagem ao voltar da tarefa. Utilizar design system do SDD 06.

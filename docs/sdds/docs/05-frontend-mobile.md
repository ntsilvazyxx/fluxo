# SDD 05 — Frontend React.js + JavaScript (mobile-first)

## Stack e estrutura
React.js com JSX, Vite, React Router, Tailwind CSS, biblioteca de componentes acessíveis compatível com JS (ex.: shadcn/ui), Lucide React. Dados remotos via TanStack Query (proposta), formulários validados (proposta: React Hook Form + Zod), estados de sessão em provider/contexto. Não introduzir TypeScript.

## Rotas/telas
- `/login`: autenticação, recuperação de acesso conforme política.
- `/dashboard`: indicadores por escopo (não disponível a técnico sem autorização).
- `/kanban`: Secretário/Gestor: Minhas tarefas + Pendente + Aguardando aceite + Em andamento; Técnico/ADMIN MASTER: quadro pessoal Aguardando aceite + Em andamento + Concluídas. Nenhum acesso gerencial adicional para esses dois últimos perfis; serviços pessoais mantêm autorização backend.
- `/minhas-tarefas`: somente redirecionamento compatível para `/kanban`, preservando parâmetros; sem item independente no menu.
- `/kanban/tarefas/:id`: componentes existentes de detalhe, histórico, atribuição, subtarefas, solicitações, evidências e ações permitidas. `/tarefas/:id` redireciona para esta rota; notificações abrem diretamente a rota integrada. Filtros e paginação da consulta são preservados ao voltar ao quadro.
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

Reformulação UI autorizada: cartões compactos verticais em colunas lado a lado, rolagem horizontal interna no mobile/tablet, barra de busca e botão Filtros com contagem/limpeza. Filtros avançados só aparecem por ação do usuário; equipe/responsável apenas para perfis gerenciais e com opções escopadas pelo backend. Menu do cartão abre detalhes/histórico e execução pessoal no componente existente, sem duplicar transições. Paginação pessoal e gerencial independente; contagens indicam a página atual. Contexto do quadro usa URL e offset horizontal em sessionStorage, sem guardar tokens.
`AppShell`, `RoleGuard` (somente UX, não segurança), `TaskCard`, `TaskStatusBadge`, `PriorityBadge`, `DeadlineIndicator`, `KanbanBoard`, `TaskTimeline`, `AssignmentPanel`, `RequestDecisionPanel`, `SubtaskList`, `TaskForm`, `ImageUploader`, `FilterBar`, `NotificationCenter`, `ConfirmActionDialog`, `ConflictAlert`, `ResponsiveDataList`.

## Comportamento dos cartões
Card mostra título/ID, equipe, responsável, prioridade, prazo, atraso, quantidade de subtarefas, solicitações pendentes. Ao abrir: histórico e ações contextuais. Técnico em aguardando aceite vê aceitar/rejeitar; em andamento vê concluir, solicitar devolução e solicitar prorrogação conforme restrições. Não usar ações ambíguas "Aceitar/Devolver" no mesmo botão: cada ação tem nome claro e justificativa quando necessária.

## Regras de UX
Não mostrar botão que o usuário não pode usar; backend ainda valida tudo. Confirmar ações irreversíveis; exibir motivo e histórico. No mobile, preservar contexto de filtro e rolagem ao voltar da tarefa. Utilizar design system do SDD 06.

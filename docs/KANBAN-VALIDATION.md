# Reformulação do Kanban — validação técnica e aceite visual pendente

Data: 2026-11-12 (America/Cuiaba). Base: `ad43216080a7343f6ee56c7c94a213265b49bb7d`.

## Escopo entregue

Acompanhamento e execução foram centralizados no Kanban, sem novo status, cópia de tarefa ou mudança nas transições de negócio. Cartões compactos mostram número/título, equipe, prioridade, responsável, prazo e atraso. O menu leva a detalhes/histórico e, na visualização pessoal ativa, à execução existente. Operações críticas continuam nos componentes atuais, com suas validações, justificativas, expectedVersion, Idempotency-Key, transações e auditoria.

| Perfil | Colunas e fontes | Restrições preservadas |
| --- | --- | --- |
| Secretário | Minhas tarefas (`/my-tasks`), Pendente, Aguardando aceite, Em andamento (`/kanban`) | Equipes autorizadas pelo backend; criação e gestão existentes |
| Gestor | Mesmas quatro colunas | Somente equipes geridas e responsabilidade pessoal disponível no serviço existente |
| Técnico | Aguardando aceite, Em andamento, Concluídas (`/my-tasks`) | Só próprias atribuições/entregas, sem coluna Pendente, criação ou gestão alheia; endpoint gerencial continua 403 |
| ADMIN MASTER | Quadro pessoal com três colunas, via `/my-tasks` | Nenhuma consulta gerencial do Kanban na interface, nenhum botão de criação no quadro; funções técnicas/excepcionais anteriores preservadas |

A coluna Minhas tarefas do Secretário/Gestor é uma visualização pessoal, incluindo entregas que o serviço pessoal já disponibilizava; badges deixam claro o estado. Uma atribuição própria ativa pode aparecer na coluna pessoal e na coluna de status com o **mesmo ID e link**, sem gravação. Os terminais continuam disponíveis no histórico existente. Não se concedeu acesso a dashboard/relatórios a Técnico ou ADMIN MASTER.

**API/ADMIN:** não se alterou a matriz de autorização dos endpoints existentes nem se criou autorização alternativa. O endpoint gerencial `/kanban` mantém as autorizações técnicas anteriores; a nova tela de ADMIN MASTER utiliza exclusivamente o endpoint pessoal. Seus acessos técnicos/excepcionais anteriores não se transformam em consulta gerencial pela interface.

## Navegação e componentes reutilizados

- Removido o item independente Minhas tarefas do menu e o componente `MyTasksPage.jsx`; preservados o endpoint `/my-tasks`, seus serviços e os dados.
- `/minhas-tarefas` redireciona com `replace` para `/kanban`, mantendo parâmetros/hash. Links antigos `/tarefas/:id` redirecionam para `/kanban/tarefas/:id`.
- Detalhes são a mesma `TaskDetailPage`, com `TaskLifecyclePanel`, `ImageGalleryPanel`, atribuição, aceite/rejeição, solicitações, conclusão, reabertura/restauração e histórico existentes. Não se implementou outro fluxo paralelo.
- Notificações abrem `/kanban/tarefas/:id`; o backend continua autorizando o recurso. Após rejeição, o usuário volta ao quadro sem tentar reler a tarefa que deixou de estar no seu escopo.
- `TaskCard`, badges, `EmptyTasks`, `useTasks`, `AppShell`, `AuthContext` e APIs atuais foram reaproveitados. Busca/filtros e paginação ficam na URL e acompanham os links de detalhes/volta; o deslocamento horizontal fica em sessionStorage por usuário/consulta, sem tokens.

## Filtros, paginação e responsividade

Barra compacta com busca por número público ou título, botão Filtros, contagem de filtros ativos e Limpar filtros. Avançados recolhidos inicialmente; equipe/responsável só para Secretário/Gestor, com opções carregadas sob demanda pelas APIs escopadas. Prioridade, estado, atraso e prazo continuam disponíveis conforme o perfil. Limpar atualiza também os valores visíveis dos campos. O dia final selecionado usa 23:59:59.999 local, convertido para ISO UTC.

Dados são paginados pelo backend, até 100 por página, com controles separados para fonte pessoal e gerencial. Contadores indicam cartões **da página atual**, não totais globais por status. Assim não há truncamento silencioso em 100 registros nem agregação enganosa. Respostas antigas de busca não substituem a consulta mais recente.

Desktop: quatro/três colunas lado a lado e largura útil ampliada somente nas rotas do Kanban. Tablet/mobile: colunas de pelo menos 260 px, rolagem horizontal **dentro do quadro**, sem overflow horizontal da página. Foco e teclado, Escape no menu, regiões/labels e movimento reduzido foram preservados. Não há drag-and-drop nem alteração de estado por movimento visual.

## Correções backend diretamente relacionadas

1. `task.service.list`: condições de escopo, modo, responsável, estado, atraso e prazo agora se combinam por interseção, sem sobrescrever umas às outras. Filtro de responsável usa vínculo ativo ou encerrado por conclusão; um vínculo rejeitado/reatribuído não devolve acesso à tarefa. Mine não aceita ampliar o escopo por outro responsável. Nenhuma matriz de papéis foi ampliada.
2. O teste de notificação com evento **real** revelou incompatibilidade preexistente: atribuição/reatribuição/aceite/rejeição produziam payload sem `assignmentId`, exigido pelo consumidor existente. Acrescentado esse ID no produtor transacional. Não se alteraram tipos/destinatários, deduplicação, auditoria nem regras de notificações. E2E usa agora o evento real e integração processa os eventos reais duas vezes para comprovar idempotência.

Eventos antigos incompatíveis permanecem preservados; não houve backfill, replay em massa ou limpeza. Sua análise/reexecução operacional é pendência separada e depende de autorização. Não se realizou envio externo de e-mail.

## Validações executadas

| Verificação | Resultado final |
| --- | --- |
| Backend sem banco | 42 testes aprovados |
| Frontend | 13 testes aprovados, incluindo seis cenários novos do quadro |
| MariaDB 10.11.16, `seaf_gestao_test` | 90 testes aprovados, incluindo seis cenários novos de Kanban/notificações reais |
| E2E Chromium | 37 testes aprovados, incluindo nove cenários novos de Kanban |
| ESLint backend/frontend | Aprovado |
| ESLint ferramentas/E2E | Aprovado |
| Build Vite de produção | Aprovado; principal 462,69 kB, sem aviso acima de 500 kB |
| Prisma Validate | Aprovado; schema não alterado |
| `git diff --check` | Aprovado |

Comandos: `npm.cmd run check`, `npm.cmd run test --workspace frontend`, `RUN_DATABASE_INTEGRATION=1 npm.cmd run test:integration`, `npm.cmd run test:e2e`, `npm.cmd run test --workspace backend`, `npm.cmd run lint`, `npm.cmd run lint:quality` e `git diff --check`. Após corrigir o payload, integração/backend/lint foram repetidos e a suíte E2E completa foi repetida. Sem a flag, onze suítes MariaDB aparecem explicitamente ignoradas e não são contadas como aprovação; seus testes foram executados em separado.

Os primeiros testes frontend mostraram falta de cleanup entre renders na nova fixture; corrigido o isolamento e repetidos os seis casos. A primeira E2E teve 36 aprovados/uma falha no processamento da notificação real, reproduzindo o payload ausente; corrigido o produtor e repetida a suíte. Resultados preliminares não são contabilizados como aprovação final.

### Cobertura dos critérios solicitados

| Critério | Evidência |
| --- | --- |
| Secretário/Gestor | Quatro colunas na ordem solicitada, fonte pessoal e fluxo por escopo, integração e navegador |
| Técnico | Três colunas, entregas próprias, aceite por menu/detalhe, nenhuma tarefa alheia/criação; endpoint gerencial 403 |
| ADMIN MASTER | Quadro pessoal vazio quando não há atribuições, sem consultas gerenciais nem controles indevidos; funções técnicas anteriores na regressão |
| Equipes/IDOR | Secretário autorizado global, Gestor sem equipe externa, Técnico sem acesso por ID ou filtro a tarefa reatribuída |
| Coluna pessoal/duplicação | Mesmo registro em duas visualizações, contagens de tarefas/ciclos/auditoria inalteradas após leituras repetidas |
| Aceite, rejeição e conclusão | E2E real novo e regressões existentes; retorno da rejeição no Kanban |
| Devolução/prorrogação e decisões | Regressões E2E/MariaDB existentes aprovadas, incluindo bloqueios e encerramento de pedido pendente |
| Histórico, subtarefas e imagens | Mesmos componentes de detalhe, regressões reais aprovadas |
| Notificações | Evento real da atribuição processado, acesso pela notificação até a rota integrada e autorização do detalhe |
| Filtros combinados | Busca + equipe + responsável + prioridade + estado + atraso + prazo; combinações incompatíveis vazias; limpeza/retorno preservados |
| Responsividade/acessibilidade | Novos cenários 320/768/1440 px: colunas alinhadas, rolagem interna, menu por teclado/Escape e Axe WCAG A/AA sem violações detectadas; regressões 320/375/390/430/768/1024/1440 px aprovadas |

Screenshots e resultados locais ignorados pelo Git: `.artifacts/screenshots/kanban-unified-320.png`, `kanban-unified-768.png`, `kanban-unified-1440.png`, `.artifacts/e2e-results.json`. Houve inspeção das capturas desktop e mobile; elas usam dados sintéticos, não dados operacionais de desenvolvimento. Artefatos/traces podem conter sessões de teste e não devem ser versionados.

## Arquivos modificados

- Backend: `backend/src/modules/tasks/task.service.js`; novo `backend/test/integration/kanban.test.js`.
- Navegação: `frontend/src/App.jsx`, `frontend/src/layout/AppShell.jsx`, `frontend/src/pages/TaskDetailPage.jsx`, `frontend/src/pages/NotificationsPage.jsx`.
- Quadro/componentes: `frontend/src/pages/KanbanPage.jsx`, novo `KanbanPage.test.jsx`, `frontend/src/tasks/task-ui.jsx`, `useTasks.js`, novo `kanban.js`, `frontend/src/styles/index.css`; removido `frontend/src/pages/MyTasksPage.jsx`.
- E2E: novo `quality/e2e/kanban.spec.js` e atualização dos destinos/estados de carregamento em `quality/e2e/system.spec.js`.
- Documentação: `README.md`, `docs/IMPLEMENTATION-DECISIONS.md`, este relatório e SDDs 02/05/07 nas duas cópias.

## Banco e pendências

Nenhuma alteração estrutural, migração, exclusão de tabela/coluna/registro ou operação em `seaf_gestao_dev`. Testes e fixtures atuaram somente em `seaf_gestao_test`, preservando históricos. Não se alterou `.env` nem se utilizou `bdseaf.sql`. Nenhuma nova dependência foi instalada.

Aceite visual/funcional do responsável **pendente**, antes de qualquer commit. Testes locais não substituem homologação nos navegadores institucionais; Chromium foi o navegador automatizado utilizado. Eventos históricos da outbox sem ID requerem investigação operacional autorizada, sem reescrita automática.

A classificação institucional da Fase 9 permanece **NÃO APTO para produção**, com exceção de MFA, SMTP/HTTPS, custódia de chaves e recuperação completa de backups com imagens ainda pendentes. Não houve commit, push, implantação ou avanço para outra fase. Aguardar validação do usuário.

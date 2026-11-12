# Decisões de implementação

## 2026-11-12 — Fase 4: solicitações, calendários e controle de tempo

- O usuário definiu que feriado prevalece sobre qualquer período excepcional: a data local inteira contabiliza zero tempo. Um período `WORKING_PERIOD`, quando não há feriado, substitui o expediente semanal daquela data.
- O usuário confirmou que versões futuras permanecem como rascunho; a publicação é manual e somente ocorre quando `effectiveFrom` tiver sido alcançado.
- Datas são persistidas em UTC. O cálculo converte os intervalos para o timezone IANA do calendário histórico da atribuição com Luxon.
- Espera é tempo corrido até aceite/encerramento. Responsabilidade é tempo corrido desde o aceite; tempo efetivo intersecta a responsabilidade com o expediente e desconta pausas.
- Devolução cria pausa transacional; aprovação encerra atribuição, limpa responsável/prazo e retorna a `PENDING`; negativa fecha a pausa. Prorrogação não pausa e, quando aprovada, cria `DeadlineChange`.
- Solicitações e decisões usam locks, `expectedVersion`, idempotência, auditoria e outbox transacionais. Uma solicitação pendente bloqueia outra incompatível no ciclo.
- A migração `20261112110000_calendar_history_guards` protege versões publicadas, horários e exceções, e adiciona unicidade de feriado por data local.
- ADMIN MASTER consulta calendários; configuração permanece restrita a Secretário e Gestor autorizado no escopo da equipe.

## 2026-11-12 — Fase 5: subtarefas e ciclos de execução

- A criação de subtarefa exige responsável e prazo e cria, atomicamente, a identidade, o ciclo 1 em `AWAITING_ACCEPTANCE`, a atribuição e o histórico inicial. Isso concretiza o requisito atual de que cada subtarefa tenha execução própria desde a criação.
- Reabertura/restauração copiam título, descrição e prioridade do ciclo terminal anterior. Responsável, prazo, atribuições, solicitações e subtarefas não são copiados.
- Uma subtarefa pode ser reaberta/restaurada manualmente apenas enquanto o ciclo principal ao qual está vinculada permanecer aberto. Subtarefas antigas nunca são reativadas pela reabertura da principal.
- Secretário opera globalmente, Gestor no escopo da equipe e ADMIN MASTER somente com justificativa. Técnico não reabre, restaura ou cria subtarefas.
- A criação de subtarefa incrementa a versão do ciclo principal, serializando-a com conclusão e cancelamento. Reabertura/restauração usam a versão do ciclo terminal e a unicidade já existente de ciclo ativo.
- Operações sobre subtarefas resolvem primeiro a tarefa principal e seguem a ordem de locks principal → subtarefas por ID → ciclos → atribuições → solicitações, inclusive ao reutilizar devolução e prorrogação.
- O schema da Fase 1 já possui FK de `parentCycleId`, trigger de apenas um nível, unicidade de ciclo ativo e triggers de imutabilidade dos ciclos encerrados. Nenhuma nova migração foi necessária.

Este registro contém somente decisões técnicas reversíveis. Regras de negócio permanecem definidas pelos SDDs.

## 2026-11-12 — Fase 8: dashboard e relatórios gerenciais

- Dashboard e relatórios são autorizados somente para `SECRETARY` e `MANAGER`. O backend bloqueia diretamente `TECHNICIAN` e `ADMIN_MASTER`; o último permanece desabilitado por padrão até existir autorização administrativa formal prevista nos SDDs.
- A situação atual agrega somente tarefas principais (`parentCycleId = null`) por sua identidade permanente e ciclo atual. Subtarefas não são somadas aos indicadores da tarefa principal; permanecem visíveis como registros independentes no relatório detalhado.
- Indicadores históricos usam ciclos: criação por `openedAt` e conclusão/cancelamento por `closedAt`, ambos dentro do período filtrado. A taxa de conclusão é `ciclos concluídos / (ciclos concluídos + cancelados)`, sem misturar esses números com as contagens atuais.
- Atraso e prazo próximo são derivados no instante da consulta; tempo médio reaproveita o cálculo de expediente, pausas e versão histórica de calendário da Fase 4.
- Na revisão da Fase 8, os filtros de estado e situação de prazo passaram a ser combinados por interseção, inclusive quando incompatíveis (resultado vazio), sem sobrescrever o estado solicitado.
- Filtros históricos são aplicados ao próprio ciclo consultado, não ao ciclo atual da tarefa. O filtro de responsável histórico considera vínculos daquele ciclo, inclusive encerrados; na situação atual e no relatório, considera somente a atribuição vigente. Isso preserva a pesquisa dos ciclos concluídos após o encerramento da atribuição.
- A verificação adicional MariaDB usa dados isolados em transação revertida ao final, sem necessidade de migração de schema para esta revisão.
- Consultas atuais e relatório excluem tarefas sem `currentCycleId` antes da contagem e paginação. A suíte de integridade cria identidades sem ciclo para testar constraints; esses registros não devem provocar erro 500 no relatório.

## 2026-11-12 — Provisionamento local autorizado

- Após confirmar que não havia bancos `seaf*` nesta instalação do XAMPP, o usuário autorizou criar e inicializar `seaf_gestao_dev` e `seaf_gestao_test`.
- Ambos foram criados com `utf8mb4` e collation `utf8mb4_unicode_ci`, receberam as três migrações versionadas via `db:migrate:deploy` e o seed dos quatro perfis. Nenhum banco existente foi apagado ou recriado.
- O arquivo local `bdseaf.sql` não foi importado. Não foram criados usuários administrativos nem tarefas no desenvolvimento; dados automatizados foram gravados somente em `seaf_gestao_test`.

## 2026-11-11 — Fase 0: base

- Organização em workspaces npm com `frontend/` e `backend/`, preservando a documentação em `docs/sdds/`.
- Backend em JavaScript ESM, Express e monólito modular. O módulo `health` é apenas infraestrutura operacional.
- API versionada em `/api/v1` e contrato inicial de resposta conforme SDD 04.
- Prisma 7.10.1 fixado junto ao `@prisma/client` para manter compatibilidade entre CLI e client. A configuração usa `prisma.config.js`, formato JavaScript oficialmente suportado, sem introduzir TypeScript. Nenhuma entidade de domínio foi criada nesta fase.
- Frontend em React, Vite e Tailwind CSS 4, com tokens SEAF declarados via `@theme` no CSS.
- Configuração local centralizada em `.env` na raiz. Vite usa `envDir` e o backend carrega esse arquivo por caminho explícito.
- Testes básicos com `node:test`/Supertest no backend e Vitest/Testing Library no frontend.
- Docker Compose não foi incluído porque o SDD 11 condiciona sua adoção a aprovação e esta fase não exige banco em execução.

## 2026-11-11 — Fase 1: persistência

- IDs de domínio usam UUID em `CHAR(36)` e eventos usam `DATETIME(3)`. A aplicação persiste timestamps em UTC; o timezone IANA permanece no calendário para apresentação e cálculo futuro.
- O gerador `prisma-client-js` foi escolhido para o Prisma 7 porque o gerador padrão `prisma-client` emite código-fonte TypeScript. O gerador legado continua suportado no Prisma 7 e mantém o backend integralmente em JavaScript, embora esteja depreciado para remoção futura.
- O runtime do Prisma 7 usa `@prisma/adapter-mariadb`, adaptador oficial do Prisma para MySQL/MariaDB, conectado a um datasource `provider = "mysql"`.
- Dias da semana em `work_schedules.weekday` seguem ISO-8601: 1 (segunda-feira) a 7 (domingo).
- Códigos de encerramento de atribuição e solicitação são enums técnicos derivados dos resultados descritos nos SDDs. Eles não adicionam transições de negócio.
- Colunas geradas com valor `NULL` fora do estado ativo implementam unicidade de vínculo ativo, gestor ativo, ciclo aberto, atribuição atual, pausa aberta e solicitação pendente por tipo.
- FKs compostas garantem que o ciclo atual pertença à tarefa, a versão ativa pertença ao calendário, o calendário pertença à equipe e a solicitação pertença à mesma atribuição/ciclo.
- `publishedAt` distingue rascunhos de versões de calendário publicadas. Depois de publicada, a versão é imutável, exceto pelo fechamento único de `effectiveTo` para encerrar sua vigência.
- Triggers MySQL limitam subtarefas a uma camada, impedem sobreposição de versões/horários e protegem estruturas append-only.
- O limite de arquivo individual foi fixado em 10 MiB e MIME em JPEG/PNG/WEBP conforme SDD 02. O limite de dez imagens ativas por ciclo não foi codificado porque a granularidade ainda está pendente no SDD 12 e pertence ao fluxo de evidências da Fase 5.
- A precedência exata entre feriado e expediente excepcional permanece pendente; nesta fase a constraint valida apenas a forma de cada exceção, sem inventar precedência funcional.
- Testes MySQL exigem banco descartável cujo nome contenha `test`, flag explícita e servidor MySQL 8. O servidor local encontrado em 11/11/2026 é MariaDB 10.11.16; nenhuma migração foi aplicada nele.
- Transações críticas usam `READ COMMITTED`, retry limitado somente para deadlock/lock timeout e ordem fixa de locks: tarefa raiz, subtarefas por ID, ciclos, atribuições e solicitações.

## 2026-11-11 — Alteração autorizada do banco de desenvolvimento

- Por autorização explícita do usuário, MariaDB 10.11.16 do XAMPP substitui MySQL 8 como banco homologado do projeto.
- O datasource Prisma permanece `provider = "mysql"`, pois este é o conector Prisma utilizado para MySQL e MariaDB; URLs também mantêm o protocolo `mysql://`.
- Os bancos isolados do projeto são `seaf_gestao_dev` e `seaf_gestao_test`. Nenhum schema preexistente do XAMPP pode ser alterado.
- As migrações complementares passam a ser validadas diretamente no MariaDB 10.11.16 antes de aplicação no banco de desenvolvimento.

## 2026-11-11 — Fase 2: autenticação, usuários e permissões

- Senhas usam Argon2id; não há credencial administrativa fixa. O bootstrap inicial recebe dados somente do ambiente e recusa uma segunda conta ADMIN MASTER.
- Access tokens JWT HS256 têm vida curta e ficam somente em memória no React. Refresh tokens opacos ficam em cookie HttpOnly/SameSite Strict e apenas seu SHA-256 é persistido.
- A rotação bloqueia a sessão com `SELECT ... FOR UPDATE`, permitindo somente um consumidor concorrente do token anterior.
- Logout, inativação e redefinição de senha revogam sessões. A recuperação responde genericamente para não enumerar contas.
- ADMIN MASTER administra todos os perfis. Secretário cria apenas Gestor e Técnico. Gestor e Técnico recebem consultas filtradas por vínculos ativos; recursos fora do escopo retornam 404.
- Usuários não são excluídos fisicamente. Alterações geram auditoria na mesma transação.
- O schema da Fase 1 já continha as estruturas necessárias; nenhuma migração adicional foi necessária.
- MFA para perfis críticos permanece pendente de definição operacional aprovada.

## 2026-11-11 — Fase 3: tarefas e Kanban

- O usuário confirmou que a rejeição antes do aceite encerra a atribuição, limpa o prazo ativo e retorna o ciclo para `PENDING`. Necessidade de mais tempo após o aceite continua sendo prorrogação e permanece fora desta fase.
- O usuário autorizou intervenções excepcionais do ADMIN MASTER nesta fase. Criação, edição, atribuição, reatribuição e cancelamento exigem justificativa auditada; conclusão continua exclusiva do responsável atual.
- Tarefas usam as estruturas já homologadas na Fase 1; nenhuma migração adicional foi necessária.
- Criação e transições críticas exigem `Idempotency-Key` persistida. Edições usam CAS por `version`; transições usam locks na ordem tarefa raiz, subtarefas, ciclos, atribuições e solicitações.
- Toda mutação de tarefa registra auditoria e evento de outbox na mesma transação. O worker e o envio externo permanecem para a Fase 6.
- Uma atribuição exige calendário e versão ativa da equipe, pois `calendarVersionId` é histórico obrigatório. A API retorna regra explícita quando a equipe ainda não foi configurada, sem criar calendário implícito.
- Secretário tem escopo global; Gestor opera equipes sob gestão; Técnico acessa somente tarefas próprias. Recursos fora do escopo retornam 404 e os filtros nunca ampliam o escopo do ator.
- O Kanban mantém somente `PENDING`, `AWAITING_ACCEPTANCE` e `IN_PROGRESS`; `COMPLETED` e `CANCELLED` são apresentados no histórico separado.


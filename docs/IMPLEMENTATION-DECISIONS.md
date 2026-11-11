# Decisões de implementação

Este registro contém somente decisões técnicas reversíveis. Regras de negócio permanecem definidas pelos SDDs.

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


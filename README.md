# SEAF — Sistema de Gestão e Acompanhamento de Tarefas

Base técnica do sistema institucional para gestão de tarefas administrativas da Secretaria de Estado de Agricultura Familiar de Mato Grosso.

> Estado atual: **Fase 9 — Homologação final e preparação para implantação**. Consulte `docs/PHASE-9-VALIDATION.md` para resultados e bloqueios operacionais. A implantação não está autorizada.

## Stack

- Frontend: React + Vite, JavaScript/JSX e Tailwind CSS, com abordagem mobile-first.
- Backend: Node.js + Express, JavaScript ESM e arquitetura de monólito modular.
- Persistência em MariaDB 10.11 + Prisma ORM.
- Workspaces npm para executar e validar as duas aplicações pela raiz.

## Pré-requisitos

- Node.js 22.12 ou superior (ambiente validado: Node.js 24.16).
- npm 10 ou superior.
- MariaDB 10.11 ou superior.

## Instalação

Na raiz do repositório:

```bash
npm install
```

Crie o arquivo de ambiente local a partir do exemplo:

PowerShell:

```powershell
Copy-Item .env.example .env
```

Linux/macOS:

```bash
cp .env.example .env
```

O valor de `DATABASE_URL` no exemplo é fictício. Ajuste-o somente no `.env` local, que é ignorado pelo Git. Nenhuma credencial real deve ser adicionada ao `.env.example`.

## Desenvolvimento

Inicie frontend e backend em paralelo:

```bash
npm run dev
```

Serviços locais:

- Interface: `http://localhost:5173`
- API: `http://localhost:3001/api/v1`
- Health check: `http://localhost:3001/api/v1/health`

Também é possível iniciar cada aplicação separadamente:

```bash
npm run dev:frontend
npm run dev:backend
```

## Validações

Execute todas as verificações que não exigem conexão MySQL:

```bash
npm run check
```

Ou execute cada etapa isoladamente:

```bash
npm run lint
npm run test
npm run build
npm run prisma:validate
```

### Homologação isolada da Fase 9

Configure `TEST_DATABASE_URL` exclusivamente para `seaf_gestao_test`. Não execute carga ou testes contra desenvolvimento. Com o schema de testes já migrado e os perfis disponíveis:

```powershell
npm.cmd ci
npm.cmd exec -- playwright install chromium
npm.cmd run test:e2e
npm.cmd run test:performance
```

O Playwright inicia API em `127.0.0.1:3109` e Vite em `127.0.0.1:4179`, recusa reutilizar serviços existentes e usa credenciais aleatórias de teste. Screenshots, traces, relatório JSON e métricas ficam em `.artifacts/`, ignorado pelo Git. Traces contêm tráfego autenticado: acesso restrito e descarte após análise. As fixtures têm UUID por execução; históricos não são removidos e o banco acumula dados de teste.

Consulte `docs/DEPLOYMENT-RUNBOOK.md` para preparação operacional. Não use Vite dev server ou root sem senha em produção.

O Prisma está configurado para MariaDB 10.11 e possui migrações versionadas. O datasource Prisma continua usando `provider = "mysql"`, como previsto pelo conector oficial.

## Persistência e migrações

Configure no `.env` um banco de desenvolvimento MariaDB 10.11 vazio ou já controlado pelo projeto. Antes de aplicar, confira o nome do banco e faça backup quando houver dados existentes.

```bash
npm run prisma:validate
npm run prisma:generate
npm run db:check
npm run db:migrate:deploy
npm run db:seed
```

O seed é idempotente e contém somente os perfis `ADMIN_MASTER`, `SECRETARY`, `MANAGER` e `TECHNICIAN`.

Nunca use `prisma db push` como substituto das migrações. Os scripts não executam reset automático.

### Testes MariaDB reais

Use exclusivamente `seaf_gestao_test`, com as migrações e o seed já aplicados, e então habilite explicitamente a suíte:

```powershell
$env:RUN_DATABASE_INTEGRATION='1'
$env:TEST_DATABASE_URL='mysql://usuario:senha@127.0.0.1:3306/seaf_gestao_test'
npm run test:integration
```

A suíte exige MariaDB 10.11.x. O comando dedicado `test:integration` recusa flag ausente ou banco diferente de `seaf_gestao_test`. Em `npm test`, sem a flag ativa, as suítes de banco aparecem como ignoradas, nunca como aprovadas.

## Scripts principais

| Script | Finalidade |
|---|---|
| `npm run dev` | Executa API e interface com recarga automática. |
| `npm run build` | Gera a versão de produção do frontend. |
| `npm run lint` | Verifica JavaScript e JSX dos dois workspaces. |
| `npm run test` | Executa testes da API, interface e persistência sem banco real. |
| `npm run prisma:validate` | Valida a configuração e o schema Prisma. |
| `npm run prisma:generate` | Gera o Prisma Client quando houver modelos. |
| `npm run check` | Executa lint, testes, build e validação Prisma. |
| `npm run db:migrate:deploy` | Aplica somente migrações versionadas no banco configurado. |
| `npm run db:check` | Lê versão/destino e confirma MariaDB 10.11 sem alterar dados. |
| `npm run db:seed` | Sincroniza os quatro perfis institucionais. |
| `npm run test:integration` | Executa integridade e concorrência em MariaDB 10.11 real. |

## Estrutura

```text
.
├── backend/
│   ├── prisma/                 # configuração inicial do Prisma
│   │   ├── migrations/         # migrações Prisma e SQL complementar
│   │   └── seed.js             # seed idempotente de perfis
│   ├── src/
│   │   ├── config/             # ambiente da API
│   │   ├── infrastructure/     # client Prisma e transações
│   │   ├── middlewares/        # tratamento HTTP transversal
│   │   ├── modules/health/     # módulo operacional de saúde
│   │   └── routes/             # composição das rotas /api/v1
│   └── test/                   # testes unitários e integração MariaDB
├── frontend/
│   └── src/
│       ├── styles/             # Tailwind e tokens do Design System SEAF
│       └── test/               # configuração de testes da interface
├── docs/
│   ├── IMPLEMENTATION-DECISIONS.md
│   ├── PERSISTENCE-ERD.md
│   └── sdds/                   # contratos de arquitetura e negócio
├── .env.example
└── package.json                # workspaces e scripts do projeto
```

## Contratos do projeto

- Os SDDs em `docs/sdds/docs/` são contratos e devem ser lidos na ordem 01–12 antes das próximas fases.
- Decisões técnicas reversíveis são registradas em `docs/IMPLEMENTATION-DECISIONS.md`.
- A logomarca original em `docs/sdds/assets/logomarca-seaf-original.png` é utilizada sem modificação.
- Não executar deploy, introduzir TypeScript ou antecipar regras de negócio sem autorização.

## Fase 2 — Autenticação e acesso

O access token permanece somente em memória no frontend. O refresh token usa cookie `HttpOnly` e `SameSite=Strict`. Gere um valor aleatório forte para `JWT_ACCESS_SECRET` no `.env` local.

Não existe senha administrativa padrão. Na primeira instalação, defina temporariamente `SEAF_BOOTSTRAP_ADMIN_NAME`, `SEAF_BOOTSTRAP_ADMIN_EMAIL` e `SEAF_BOOTSTRAP_ADMIN_PASSWORD` e execute `npm run admin:bootstrap`. O comando recusa uma segunda conta ADMIN MASTER.

Rotas da fase: `/api/v1/auth/*`, `/api/v1/users/*` e `/api/v1/teams/*`. Usuários e equipes exigem Bearer token e autorização obrigatória no backend.

## Fase 3 — Tarefas e Kanban

O módulo operacional oferece criação e edição controladas, atribuição e reatribuição, aceite, rejeição, conclusão, cancelamento, Kanban, Minhas Tarefas e histórico. Atraso é calculado a partir do prazo; não é persistido como estado.

Mutações críticas exigem `Idempotency-Key`. Edições e transições recebem `expectedVersion`; conflitos retornam HTTP 409 sem sobrescrever alterações concorrentes.

Principais rotas: `/api/v1/tasks`, `/api/v1/tasks/:id`, `/api/v1/tasks/:id/assignments`, `/api/v1/assignments/:id/accept`, `/api/v1/assignments/:id/reject`, `/api/v1/tasks/:id/complete`, `/api/v1/tasks/:id/cancel`, `/api/v1/kanban`, `/api/v1/my-tasks` e `/api/v1/task-history`.

## Fase 4 — Solicitações, calendários e controle de tempo

O responsável atual pode solicitar devolução ou prorrogação de uma tarefa em andamento. A devolução abre uma pausa no tempo de responsabilidade até a decisão; a prorrogação mantém a contagem e, quando aprovada, registra a alteração de prazo. Decisões usam locks, `expectedVersion`, `Idempotency-Key`, auditoria e outbox na mesma transação.

Cada equipe possui um calendário versionado com timezone IANA, períodos semanais e exceções. Versões futuras permanecem como rascunho e exigem publicação manual quando a vigência chegar. Versões publicadas e seus períodos são historicamente imutáveis. Um feriado prevalece sobre qualquer período excepcional e zera todo o dia local.

Principais rotas: `/api/v1/tasks/:id/requests`, `/api/v1/requests/:id/approve`, `/api/v1/requests/:id/deny`, `/api/v1/calendars`, `/api/v1/calendars/:id`, `/api/v1/calendars/:id/versions` e `/api/v1/calendars/:id/versions/:versionId/publish`.

Os testes automatizados com banco devem continuar usando exclusivamente `seaf_gestao_test`. A migração da Fase 4 é aplicada com `npm run db:migrate:deploy`; nunca use `prisma db push` ou `prisma migrate reset`.

## Fase 5 — Subtarefas e ciclos de execução

Subtarefas são tarefas completas vinculadas ao ciclo específico da principal. Elas nascem atribuídas, com prazo e estado `AWAITING_ACCEPTANCE`, e reutilizam aceite, rejeição, devolução, prorrogação, conclusão e cancelamento. Apenas um nível é permitido. A principal não pode ser concluída com subtarefas ativas e seu cancelamento encerra atomicamente as subtarefas abertas.

Reabertura de tarefa concluída e restauração de tarefa cancelada criam um novo ciclo `PENDING`, sem responsável e sem prazo. O ciclo anterior permanece imutável e as subtarefas antigas não são reativadas.

Principais rotas: `GET/POST /api/v1/tasks/:id/subtasks`, `POST /api/v1/tasks/:id/reopen` e `POST /api/v1/tasks/:id/restore`.

## Estabilização da Fase 9

Por solicitação do responsável, todos os perfis, inclusive ADMIN MASTER, entram somente por e-mail e senha. TOTP e códigos de segundo fator foram retirados. Trata-se de mudança de requisito com exceção de segurança **pendente de aprovação institucional**, não de cumprimento de MFA. A prontidão permanece **NÃO APTO para produção**. Consulte a [proposta e os controles preservados](docs/AUTHENTICATION-SECURITY.md).

A recuperação de senha por e-mail continua usando outbox, SMTP configurável e `AUTH_DATA_ENCRYPTION_KEY` independente. A migração histórica `20261112233000_auth_mfa_sessions` foi preservada e a compensatória `20261113001000_retire_mfa_preserve_history` arquiva seus dados sem descartá-los. Ambas foram aplicadas somente em `seaf_gestao_test`; desenvolvimento não foi migrado nesta revisão. Consulte o [runbook](docs/DEPLOYMENT-RUNBOOK.md) e a seção 14 de [PHASE-9-VALIDATION.md](docs/PHASE-9-VALIDATION.md).

## Fase 8 — Dashboard e relatórios gerenciais

O dashboard e o relatório são disponibilizados exclusivamente a Secretários e Gestores, sempre no escopo organizacional autorizado. Técnicos e ADMIN MASTER recebem `403` mesmo em acesso direto à API nesta fase.

`GET /api/v1/dashboard` fornece situação atual por tarefa principal e séries históricas por ciclo. No período informado, ciclos criados são filtrados por `openedAt`; ciclos concluídos ou cancelados, por `closedAt`. Por isso, os totais atuais não devem ser comparados diretamente a totais históricos. Os filtros de equipe, responsável, status, prioridade e situação de prazo são aplicados no backend antes da agregação.

`GET /api/v1/reports` oferece lista paginada e ordenável de tarefas e subtarefas dentro do escopo do ator. A interface fica em `/dashboard` e `/relatorios`; suas páginas são carregadas sob demanda.


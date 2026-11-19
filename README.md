# SEAF — Sistema de Gestão e Acompanhamento de Tarefas

Base técnica e operacional do sistema institucional para gestão e acompanhamento de tarefas administrativas da Secretaria de Estado de Agricultura Familiar de Mato Grosso (SEAF-MT).

> **Estado da Versão:** **Homologação Final Concluída (Fim do Plano Emergencial de 3 Dias)**.  
> Sistema estabilizado, integrado de ponta a ponta, seguro e validado em ambiente funcional com banco MariaDB real (`seaf_gestao_functional`) e interface real no Google Chrome.

---

## Sumário das Entregas (Plano Emergencial de 3 Dias)

### Dia 1 — Central de Notificações e Operação Estabilizada
- **Central de Notificações:** Notificações em tempo real com polling controlado de 30s (com verificação de aba visível e suspensão automática quando inativa).
- **Outbox Worker:** Mapeamento de eventos de ciclo de vida (`RETURN_REQUESTED`, `EXTENSION_REQUESTED`, atribuições e decisões) com deep-link direto para `/kanban/tarefas/:id`.
- **Subtarefas (Decisão Opção B):** Criação de novas subtarefas aposentada nesta entrega (`HTTP 410 GONE`); integridade histórica e consulta de subtarefas legadas 100% preservadas.

### Dia 2 — Calendário Visual e Exportações de Relatórios
- **Calendário Visual de Tarefas:** Nova rota `/calendario` e endpoint `GET /api/v1/tasks/calendar`. Alternância entre visualizações Mensal e Semanal, filtros dinâmicos por status e prioridade, marcação de feriados/pontos facultativos de Mato Grosso e integração total com `TaskDetailModal`.
- **Exportação Excel e PDF:**
  - **Excel:** Exportação em formato CSV com UTF-8 BOM (`\uFEFF`) e delimitador `;`, compatível diretamente com o Microsoft Excel em português do Brasil sem telas de assistente de importação. Proteção contra injeção de fórmulas (escape de `=`, `+`, `-`, `@`, `\t`, `\r`).
  - **PDF:** Impressão institucional otimizada com `@media print`, incluindo cabeçalho institucional SEAF-MT, dados da auditoria e remoção automática de menus e botões.

### Dia 3 — Homologação Completa, Segurança e Backup
- **Homologação dos 4 Perfis RBAC:** Sessões independentes validadas (`ADMIN_MASTER`, `SECRETARY`, `MANAGER`, `TECHNICIAN`). Isolamento rigoroso de permissões e escopo de tarefas.
- **Ciclo de Vida Ponta a Ponta:** Criação com número SIGADOC, reatribuição, aceite, solicitação/aprovação de prorrogação, conclusão com texto e reabertura em novo ciclo com auditoria imutável.
- **Kanban e Paleta Avançada:** Arraste de cartões pelo corpo inteiro via `@dnd-kit`, paleta compacta com prévia, matriz de saturação/brilho, barra de matiz, input HEX e contraste dinâmico de texto (preto/branco) de acordo com luminância WCAG.
- **Backup e Restauração Isolada:** Procedimento validado via `mysqldump` com restauração teste e verificação de integridade linha por linha.

---

## Perfis de Usuário e Matriz de Permissões (RBAC)

| Perfil | Acesso ao Kanban / Tarefas | Criação com SIGADOC | Aprovar Prorrogação / Devolução | Relatórios & Exportação | Gestão de Usuários |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **ADMIN_MASTER** | Visão do sistema / Pessoal | Não (perfil administrativo puro) | Não | Acesso restrito | Sim (com justificativa de auditoria) |
| **SECRETARY** | Visão global da Secretaria | Sim (todas as equipes) | Sim (qualquer equipe) | Sim (Global) | Visualização (criação e edição restrita ao Admin) |
| **MANAGER** | Visão da Equipe sob sua gestão | Sim (equipe gerenciada) | Sim (sua equipe) | Sim (apenas sua equipe) | Bloqueado (`HTTP 403`) |
| **TECHNICIAN** | Visão estrita das tarefas atribuídas | Bloqueado (`HTTP 403`) | Bloqueado (`HTTP 403`) | Bloqueado (`HTTP 403`) | Bloqueado (`HTTP 403`) |

---

## Procedimento de Inicialização e Operação

### Pré-requisitos
- **Node.js:** versão 22.12 ou superior (validado em Node.js 24.16).
- **MariaDB / MySQL:** versão 10.11 ou superior (rodando na porta 3306).
- **Navegador Moderno:** Google Chrome, Microsoft Edge ou Firefox.

### 1. Inicialização dos Serviços em Desenvolvimento
Na raiz do projeto (`C:\Projetos\Fluxo`):

```powershell
# Execução paralela de Frontend e Backend
npm run dev
```

Ou em terminais separados:
```powershell
# Terminal 1 - Backend API (porta 3001)
npm run dev:backend

# Terminal 2 - Frontend Vite (porta 5173)
npm run dev:frontend
```

Serviços disponíveis:
- **Interface Web:** `http://localhost:5173`
- **API REST v1:** `http://localhost:3001/api/v1`
- **Health Check:** `http://localhost:3001/api/v1/health`

---

## Procedimento Homologado de Backup e Restauração

O procedimento de backup do banco de dados institucional preserva triggers de auditoria (`trg_audit_events_append_only_update`), rotinas, chaves estrangeiras e integridade referencial.

### 1. Gerar Backup (Dump)
```powershell
# Exemplo com utilitário mysqldump
mysqldump -h 127.0.0.1 -P 3306 -u root --single-transaction --routines --triggers seaf_gestao_functional > "C:\Projetos\Fluxo\banco\backup_homologacao_$(Get-Date -Format 'yyyyMMdd').sql"
```

### 2. Restaurar Banco a partir de Backup
```powershell
# 1. Criar o banco de destino caso não exista
mysql -h 127.0.0.1 -P 3306 -u root -e "CREATE DATABASE IF NOT EXISTS seaf_gestao_functional CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 2. Restaurar conteúdo
mysql -h 127.0.0.1 -P 3306 -u root seaf_gestao_functional < "C:\Projetos\Fluxo\banco\backup_homologacao_20261119.sql"
```

> **Evidência de Homologação:** O script automatizado `scratch/backup_and_test_restore.mjs` testou a restauração em banco isolado temporário (`seaf_gestao_test_restore`), confirmando paridade exata de todas as 33 tabelas e registros (19 tarefas e 9 usuários restaurados sem divergências).

---

## Suíte de Testes e Validação de Qualidade

Para executar a validação estática e os testes automatizados da aplicação:

```powershell
# Validação completa (lint, testes e build)
npm run check

# Execução individual de testes
npm run test --workspace backend    # 223 testes automatizados
npm run test --workspace frontend   # 139 testes automatizados
npm run build --workspace frontend  # Build de produção Vite (0 erros)
```

---

## Stack Tecnológica

- **Frontend:** React 19, TypeScript/TSX, Vite, Tailwind CSS, `@dnd-kit`, Lucide React.
- **Backend:** Node.js (ESM), Express, Prisma ORM, Zod, Helmet, CORS, Rate Limit.
- **Banco de Dados:** MariaDB 10.11 / MySQL.
- **Arquitetura de Segurança:** Autenticação via JWT, Refresh Token em cookies HttpOnly/SameSite, RBAC por perfil, trilha de auditoria append-only imutável.

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

Na preparação da segunda campanha (Fase 4C.9), o guard reconhece exatamente `seaf_gestao_integration` e `seaf_gestao_integration_2`, em `127.0.0.1:3306`, com seleção obrigatória em `INTEGRATION_DATABASE_NAME`. O primeiro banco é evidência preservada: runner e factories recusam sua reutilização com escrita. A execução futura aceita somente `_2`. Os bancos `seaf_gestao_dev`, `seaf_gestao_test` e `seaf_gestao_recovery` também são recusados. O novo banco ainda não foi criado nesta etapa; provisionamento e campanha exigem autorizações separadas. Consulte [PHASE-4C9-PREPARATION.md](docs/PHASE-4C9-PREPARATION.md).

Somente depois de provisionar as seis migrações e uma conta limitada a SELECT/INSERT/UPDATE/DELETE nesse banco, configure as duas URLs **no processo**, sem alterar `.env`. O exemplo abaixo usa valores fictícios e não deve ser executado antes dessa autorização:

```powershell
$env:RUN_DATABASE_INTEGRATION='1'
$env:INTEGRATION_DATABASE_NAME='seaf_gestao_integration_2'
$env:DATABASE_URL='mysql://conta_integration_2:senha_ficticia@127.0.0.1:3306/seaf_gestao_integration_2'
$env:TEST_DATABASE_URL=$env:DATABASE_URL
npm.cmd run test:integration
```

A suíte exige MariaDB 10.11.x, destino efetivo confirmado por SQL de leitura, histórico/checksums das seis migrações e privilégios restritos. Contas administrativas globais são recusadas. O contexto cria somente os quatro perfis sintéticos necessários, após o guard; não executa o seed administrativo de produção. As integrações não executadas não contam como aprovadas. Mantenha `RUN_DATABASE_INTEGRATION=0` nas validações sem banco. Os comandos de E2E/carga da seção anterior não fazem parte desta campanha isolada e não devem ser executados nos bancos preservados.

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

As validações históricas desta fase utilizaram `seaf_gestao_test`. Na continuidade da nova máquina (Fase 4C.5), esse banco deve ser preservado; novas integrações com escrita usarão exclusivamente `seaf_gestao_integration`, após autorização de provisionamento e campanha. Nunca use `prisma db push` ou `prisma migrate reset`.

## Fase 5 — Subtarefas e ciclos de execução

Subtarefas são tarefas completas vinculadas ao ciclo específico da principal. Elas nascem atribuídas, com prazo e estado `AWAITING_ACCEPTANCE`, e reutilizam aceite, rejeição, devolução, prorrogação, conclusão e cancelamento. Apenas um nível é permitido. A principal não pode ser concluída com subtarefas ativas e seu cancelamento encerra atomicamente as subtarefas abertas.

Reabertura de tarefa concluída e restauração de tarefa cancelada criam um novo ciclo `PENDING`, sem responsável e sem prazo. O ciclo anterior permanece imutável e as subtarefas antigas não são reativadas.

Principais rotas: `GET/POST /api/v1/tasks/:id/subtasks`, `POST /api/v1/tasks/:id/reopen` e `POST /api/v1/tasks/:id/restore`.

## Estabilização da Fase 9

Por solicitação do responsável, todos os perfis, inclusive ADMIN MASTER, entram somente por e-mail e senha. TOTP e códigos de segundo fator foram retirados. Trata-se de mudança de requisito com exceção de segurança **pendente de aprovação institucional**, não de cumprimento de MFA. A prontidão permanece **NÃO APTO para produção**. Consulte a [proposta e os controles preservados](docs/AUTHENTICATION-SECURITY.md).

A recuperação de senha por e-mail continua usando outbox, SMTP configurável e `AUTH_DATA_ENCRYPTION_KEY` independente. A migração histórica `20261112233000_auth_mfa_sessions` foi preservada e a compensatória `20261113001000_retire_mfa_preserve_history` arquiva seus dados sem descartá-los. Ambas foram aplicadas somente em `seaf_gestao_test`; desenvolvimento não foi migrado nesta revisão. Consulte o [runbook](docs/DEPLOYMENT-RUNBOOK.md) e a seção 14 de [PHASE-9-VALIDATION.md](docs/PHASE-9-VALIDATION.md).

## Reformulação do Kanban após a Fase 9

O acompanhamento e a execução pessoal agora se concentram em `/kanban`: quatro colunas para Secretário/Gestor e três colunas pessoais para Técnico/ADMIN MASTER. A antiga `/minhas-tarefas` redireciona para o quadro. Detalhes, histórico e ações existentes ficam em `/kanban/tarefas/:id`; links antigos de tarefas continuam compatíveis. Filtros avançados são recolhidos e o quadro mantém rolagem interna em telas estreitas. Não há status novo ou migração. Consulte `docs/KANBAN-VALIDATION.md` para testes, limites e aceite visual pendente.

## Fase 8 — Dashboard e relatórios gerenciais

O dashboard e o relatório são disponibilizados exclusivamente a Secretários e Gestores, sempre no escopo organizacional autorizado. Técnicos e ADMIN MASTER recebem `403` mesmo em acesso direto à API nesta fase.

`GET /api/v1/dashboard` fornece situação atual por tarefa principal e séries históricas por ciclo. No período informado, ciclos criados são filtrados por `openedAt`; ciclos concluídos ou cancelados, por `closedAt`. Por isso, os totais atuais não devem ser comparados diretamente a totais históricos. Os filtros de equipe, responsável, status, prioridade e situação de prazo são aplicados no backend antes da agregação.

`GET /api/v1/reports` oferece lista paginada e ordenável de tarefas e subtarefas dentro do escopo do ator. A interface fica em `/dashboard` e `/relatorios`; suas páginas são carregadas sob demanda.


# Retomada funcional do SEAF

**Data:** 14/11/2026

**Branch:** `feature/kanban-refactor`

> **Atualização (14/11/2026):** a autorização para o ambiente funcional isolado foi concedida e executada. O login e o Kanban foram testados de verdade no navegador contra `seaf_gestao_functional`. Ver **seção 7**. A seção 6 registra o estado anterior à autorização e não descreve mais o bloqueio atual.

## Resumo executivo

- A divergência do checksum de `seaf_gestao_dev` **não é explicada apenas pelo método de cálculo**: a comparação histórica por tabela confirma alterações reais de dados em três tabelas. A origem não foi determinada; isso não é, por si só, evidência de corrupção.
- O backend e o Vite já estavam ativos ao iniciar esta verificação. O health da API e a raiz do Vite responderam HTTP 200.
- A tela de login abriu em `http://localhost:5173/login`. A autenticação foi **simulada como sem sessão** para evitar qualquer escrita; não houve tentativa real de login.
- O acesso a `/kanban` sem sessão redirecionou para o login. Os testes de interface do Kanban passaram com mocks; nenhum fluxo Kanban foi validado contra banco real.
- Nenhum banco foi migrado, semeado ou alterado intencionalmente nesta execução. Nenhum código funcional foi modificado.
- Para testar login e Kanban reais com segurança, é necessário autorização para provisionar uma base descartável nova, uma conta restrita e dados sintéticos.

## 1. Estado encontrado

O worktree já continha alterações e arquivos não rastreados de trabalhos anteriores. Foram preservados; este relatório é a única alteração criada nesta solicitação. Não houve commit ou push.

As portas 3001 e 5173 já tinham processos escutando. Não foram iniciados, reiniciados ou encerrados por esta verificação. A API respondeu em `/api/v1/health` com `200 OK` e `service: seaf-api`; o Vite respondeu `200 OK` na raiz.

O `.env` aponta `DATABASE_URL` para `seaf_gestao_dev` com usuário `root`, e `TEST_DATABASE_URL` para `seaf_gestao_test`. Essas configurações não foram alteradas. Não foi feito login funcional nem teste usando root. A inspeção do banco para comparar hashes e migrações foi somente de leitura.

## 2. Divergência de integridade em `seaf_gestao_dev`

O baseline por tabela de 4C.10.3, guardado em `.artifacts/integration-4c10-cebdb41c-c13d-40ba-90b2-8813b045661e/final-protected-after.json`, continha 28 tabelas. A lista e a quantidade atuais continuam iguais.

A comparação repetiu o método histórico do snapshot: serialização JSON canônica com chaves ordenadas, SHA-256 das linhas e hash de `SHOW CREATE TABLE`. As definições das tabelas coincidem. Entre as 28 tabelas, somente estas três têm contagem e hash de dados diferentes:

| Tabela | Baseline 4C.10.3 | Atual | Diferença |
|---|---:|---:|---:|
| `audit_events` | 7 | 12 | +5 |
| `users` | 1 | 2 | +1 |
| `user_sessions` | 6 | 10 | +4 |

As outras 25 tabelas têm contagem e hash de dados iguais ao baseline. Os snapshots de preflight e pós-provisionamento da Fase 4C.10 também coincidiam entre si para `seaf_gestao_dev`.

**Classificação:** opção C — alteração real de dados posterior ao baseline, ainda sem causa/proveniência comprovada. A natureza das tabelas é compatível com atividade anterior do sistema, mas os hashes e contagens não permitem afirmar que essa foi a causa. Não se presume corrupção.

O baseline agregado anterior usava `CHECKSUM TABLE` por tabela e SHA-256 das saídas ordenadas. Como a comparação por linha também encontrou diferenças reais, uma mera divergência de algoritmo não explica o resultado.

### Migrações

O banco tem seis diretórios de migração no repositório. A tabela `_prisma_migrations` de `seaf_gestao_dev` contém as três primeiras, todas concluídas e sem rollback:

- `20261111170000_init_persistence`
- `20261111171000_add_integrity_constraints`
- `20261112110000_calendar_history_guards`

As três seguintes ainda não constam no banco:

- `20261112233000_auth_mfa_sessions`
- `20261113001000_retire_mfa_preserve_history`
- `20261113120000_running_clock_attachments`

Não foi executada migração. Portanto, a compatibilidade completa da versão atual do backend com o schema de desenvolvimento não foi comprovada.

## 3. Backend, frontend e navegador

| Verificação | Resultado | Limite |
|---|---|---|
| Backend já ativo | `GET /api/v1/health` retornou HTTP 200 | Health não comprova autenticação nem acesso funcional ao banco |
| Vite já ativo | `GET /` retornou HTTP 200 | Confirma entrega da aplicação, não os fluxos protegidos |
| Tela de login | Renderizada no navegador em `http://localhost:5173/login` | A resposta de refresh foi interceptada e simulada como 401; não foi informado usuário/senha |
| Rota Kanban sem sessão | Redirecionou para `/login` | Kanban autenticado não foi aberto |
| CORS | `http://localhost:5173` recebeu preflight 204; `http://127.0.0.1:5173` recebeu 403 | Usar o hostname canônico `localhost`, que coincide com a configuração atual |

O teste visual da página não enviou credenciais nem realizou pedido real de refresh ao backend. Nenhuma rota de escrita da aplicação foi chamada intencionalmente.

## 4. Kanban e cobertura funcional

**Implementado no código:** quadro, filtros, paginação, cartões e navegação para detalhes/histórico; controles de atribuição, aceite/rejeição, pedidos de devolução/prorrogação e ciclo de vida ficam nos detalhes da tarefa.

**Verificado com mocks:** os testes do frontend cobrem as quatro colunas gerenciais, o quadro pessoal do Técnico, filtros, paginação e descarte de resposta obsoleta. A suíte também valida a renderização da tela de login.

**Validado com banco real nesta execução:** somente leitura de tabelas, contagens, hashes e estado das migrações de `seaf_gestao_dev`. O health da API também foi consultado.

**Não testado nesta execução:** login com credenciais reais; sessão/refresh real; carregamento de cartões autenticados; atribuição, aceite, rejeição, devolução, prazo adicional, anexos ou movimentações reais. Não foram executadas ações de escrita nem testes de integração MariaDB.

## 5. Validações

`npm.cmd run check` terminou com código de saída 0:

- Backend: 181 testes aprovados.
- Frontend: 13 testes aprovados.
- ESLint: sem erros; um aviso `react-refresh/only-export-components` em `frontend/src/auth/AuthContext.tsx`.
- Build do frontend: aprovado.
- Prisma Validate: aprovado.
- `git diff --check`: aprovado para os arquivos rastreados; o relatório novo também foi verificado quanto a espaços finais.

Esses testes não equivalem a autenticação nem execução do Kanban contra MariaDB. Nenhuma campanha de integração foi executada.

## 6. Bloqueios e próxima ação mínima

O sistema entrega a tela de login no navegador, mas não há evidência suficiente para afirmar que o login ou o Kanban estejam operacionais com segurança. O `.env` aponta para um banco protegido, usa `root` e o schema está três migrações atrás do repositório. Não é seguro testar credenciais ou ações funcionais nesse alvo.

Plano proposto, **dependente de autorização explícita antes de qualquer escrita**:

1. Verificar por leitura se o schema `seaf_gestao_functional` e os nomes de contas propostos estão livres.
2. Criar somente esse schema descartável e duas contas locais distintas: uma de migração e outra de execução, ambas restritas ao schema novo e ao host `127.0.0.1`; nenhuma permissão global.
3. Aplicar nele as seis migrações versionadas do repositório usando a conta de migração.
4. Inserir somente dados sintéticos (usuários de teste, equipe e tarefas), sem copiar dados de bancos existentes.
5. Iniciar o backend apontando por variável de processo para a conta de execução desse schema, com e-mail externo desabilitado, e testar login e Kanban nesse ambiente.
6. Manter `.env`, `bdseaf.sql`, os quatro bancos protegidos e `seaf_gestao_integration_2` intactos.

Este relatório não autoriza a criação do schema/contas, concessão de grants, aplicação de migrações ou geração de fixtures. O próximo passo é obter essa autorização; até lá, limitar o uso à tela de login e aos testes com mocks.

## 7. Retomada funcional em ambiente isolado — executada

**Data:** 14/11/2026. **Branch:** `feature/kanban-refactor` (sem commit/push). **Escopo:** provisionar o banco descartável autorizado, aplicar as seis migrações, inserir dados sintéticos, executar o sistema e validar login e Kanban no navegador.

### 7.1 Verificação prévia (somente leitura)

- O schema `seaf_gestao_functional` e as contas `seaf_functional_migrate`/`seaf_functional_run` **não existiam**; não havia provisionamento parcial. Nomes estavam livres.
- Nenhum nome foi sobrescrito, recriado, apagado ou reutilizado.
- Baseline dos bancos protegidos antes de escrever: `seaf_gestao_dev` 28 tabelas, `seaf_gestao_test` 29, `seaf_gestao_recovery` 31, `seaf_gestao_integration` 31, `seaf_gestao_integration_2` 0.
- `.env` SHA-256 `a26660a0...f48f0f52`; `bdseaf.sql` SHA-256 `26b28e46...17bed86` (não alterados).

### 7.2 Provisionamento

| Item | Estado |
|---|---|
| Banco | `seaf_gestao_functional` (utf8mb4 / utf8mb4_unicode_ci) |
| Conta de migração | `seaf_functional_migrate@127.0.0.1` |
| Conta de execução | `seaf_functional_run@127.0.0.1` |
| Grants da migração | `SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, REFERENCES, INDEX, ALTER, TRIGGER` somente no novo schema |
| Grants da execução | `SELECT, INSERT, UPDATE, DELETE` somente no novo schema |
| Conta administrativa | `root@127.0.0.1` usada **apenas** no provisionamento inicial |
| Segredos | senhas aleatórias e senha de login gravadas fora do repositório, em `C:\Users\natha\AppData\Local\Temp\opencode\seaf-functional-credentials.json`; nenhum valor foi exibido em log ou documento |

Isolamento efetivo comprovado por conexão TCP: as duas contas acessam `seaf_gestao_functional` e recebem **1044/negado** em `seaf_gestao_dev`, `seaf_gestao_test`, `seaf_gestao_recovery`, `seaf_gestao_integration`, `seaf_gestao_integration_2` e `mysql`. Os escopos em `mysql.db` usam **um** escape por underscore (24 bytes para `seaf\_gestao\_functional`), sem repetir o erro de escape da fase 4C.10.

### 7.3 Migrações

- `prisma migrate deploy` executado com a conta de migração e `DATABASE_URL` temporária apontando para `seaf_gestao_functional`.
- As **seis** migrações versionadas foram aplicadas; nenhum SQL foi editado; não houve `migrate reset`, `db push` ou correção destrutiva.
- `_prisma_migrations`: 6 registros, todos com `finished_at` preenchido e `rolled_back_at` nulo.
- Estrutura criada: 31 tabelas (30 de aplicação + `_prisma_migrations`), incluindo triggers/checks das migrações.
- Nenhum banco protegido foi alvo da URL de migração.

### 7.4 Dados sintéticos

Todos os dados são fictícios; nada foi importado dos bancos antigos. Senha de login temporária compartilhada apenas fora do repositório.

| Perfil | Conta | Papel |
|---|---|---|
| Admin | `admin.funcional@seaf.invalid` | `ADMIN_MASTER` |
| Secretária | `secretaria.funcional@seaf.invalid` | `SECRETARY` |
| Gestor | `gestor.funcional@seaf.invalid` | `MANAGER` |
| Técnica 1 | `tecnica.funcional@seaf.invalid` | `TECHNICIAN` |
| Técnico 2 | `tecnico2.funcional@seaf.invalid` | `TECHNICIAN` |

- 4 perfis institucionais (upsert do seed existente), 1 equipe (`Equipe Funcional SEAF`), 1 vínculo de gestor e 3 vínculos de membros.
- 7 tarefas em `PENDING`, `AWAITING_ACCEPTANCE`, `IN_PROGRESS` e `COMPLETED`, com 6 atribuições e histórico sintético.
- Nenhuma regra de negócio foi alterada para viabilizar os testes.

### 7.5 Execução do sistema

- Backend real (`node src/server.js`) na porta 3001, apontando por variável de processo para `seaf_gestao_functional` com a conta de execução; `MAIL_ENABLED=0`. O `.env` **não** foi alterado.
- Frontend Vite já ativo em `http://localhost:5173`; não foi reiniciado.
- Health: HTTP 200 (`seaf-api`), sem erro no stderr do backend.
- `LOGIN_RATE_MAX_ATTEMPTS=200` foi definido **somente no processo** durante a bateria de testes, porque o limite padrão de 10 tentativas/15 min bloqueou logins repetidos legítimos. O `.env` continua com o valor original.

### 7.6 Testes realmente executados

#### Navegador (Playwright/Chromium, banco funcional real)

Script: `.artifacts/functional-e2e.mjs` (ignorado pelo Git). Evidências: `.artifacts/screenshots/functional-*.png`. Resultado: **23 verificações aprovadas, 0 falhas**.

| Fluxo | Resultado real |
|---|---|
| Login do gestor e redirecionamento para `/kanban` | Aprovado |
| Colunas gerenciais Minhas tarefas / Pendente / Aguardando aceite / Em andamento | Aprovadas |
| Cartões reais nas três colunas operacionais | Carregados |
| Persistência de sessão após `reload` (refresh real via cookie) | Aprovado |
| Detalhe da tarefa, ciclos e histórico de alterações | Abertos com evento real |
| Logout do gestor | Redirecionou para `/login` |
| Técnico vê somente a coluna pessoal, sem coluna gerencial | Aprovado |
| “Minhas tarefas” da técnica 1 | 4 cartões reais |
| Aceite da atribuição pela técnica 1 | Status mudou para Em andamento e persistiu após reload |
| Técnico 2 vê 2 atribuições | Aprovado |
| Rejeição por falta de competência, com justificativa | Tarefa saiu das tarefas do técnico |
| Estado da rejeição no Kanban do gestor | Tarefa apareceu em Pendente |
| Solicitação de prazo adicional (prorrogação) | Criada e exibida como pendente |
| Aprovação da prorrogação pelo gestor | Prazo de execução mudou de 15/11 13:11 para 17/11 14:16 |
| Proteção de rota após logout | `/kanban` redirecionou para `/login` |

Console do navegador: 7 mensagens, todas 401 esperados do refresh anônimo na tela de login; **0 erro inesperado e 0 `pageerror`**.

#### API real (complementar ao navegador)

- `GET /api/v1/health` → 200.
- Login real dos quatro perfis → 200.
- `GET /auth/me` → usuário e papel corretos.
- Gestor e admin: `GET /kanban` → 6 tarefas; `GET /users` → visão permitida.
- Técnicos: `GET /kanban` → **403** (RBAC correto); `GET /my-tasks` → 4 e 2 tarefas.
- `GET /teams` → 1 equipe autorizada para todos os perfis testados.

### 7.7 Persistência comprovada no banco funcional

Após os testes de navegador, o próprio `seaf_gestao_functional` registrava: 2 ciclos `PENDING`, 1 `AWAITING_ACCEPTANCE`, 3 `IN_PROGRESS`, 1 `COMPLETED`; 6 atribuições (4 aceitas, 1 rejeitada); 1 solicitação aprovada; 1 alteração de prazo; 23 eventos de auditoria; 12 sessões. Isso comprova que as ações partiram da interface e gravaram no banco novo.

### 7.8 O que foi corrigido

- **Nenhum código de produto precisou ser corrigido.** Login, RBAC, Kanban, aceite, rejeição, prorrogação e aprovação funcionaram como implementados.
- O único bloqueio operacional foi o rate limit de login (10/15 min), que impedia repetir a bateria; foi elevado temporariamente por variável de ambiente no processo, sem alterar `.env`, código ou regra de negócio.
- O script E2E inicialmente tentou fazer login antes de descobrir o 429; após reiniciar o backend com o limite temporário, a bateria passou integralmente.

### 7.9 Preservação dos bancos e arquivos protegidos

Recontagem após todo o trabalho (idêntica ao baseline):

| Banco | Tabelas antes | Tabelas depois |
|---|---:|---:|
| `seaf_gestao_dev` | 28 | 28 |
| `seaf_gestao_test` | 29 | 29 |
| `seaf_gestao_recovery` | 31 | 31 |
| `seaf_gestao_integration` | 31 | 31 |
| `seaf_gestao_integration_2` | 0 | 0 |

- `.env` e `bdseaf.sql` com os mesmos SHA-256 do início.
- Nenhum grant de conta existente alterado; nenhuma conta administrativa usada para executar o sistema.
- Nenhum commit, push ou descarte de alteração local.

### 7.10 Testado de verdade x apenas inspecionado

**Testado de verdade (navegador + banco funcional):** login, refresh/sessão, logout, proteção de rota, quatro colunas gerenciais, quadro pessoal do técnico, carregamento de cartões, detalhe, histórico, aceite, rejeição com justificativa, solicitação de prorrogação, aprovação e atualização do prazo.

**Apenas inspecionado no código (não executado nesta bateria):** upload/download/remoção de anexos, galeria de imagens, criação/edição/cancelamento/reatribuição de tarefas, subtarefas, conclusão/reabertura, devolução com pausa, calendários, notificações, dashboard, relatórios, recuperação de senha, MFA e cenários de concorrência/idempotência.

### 7.11 Pendências e como reutilizar

1. O backend funcional está ativo na porta 3001 e o frontend em `http://localhost:5173`; o SEAF está utilizável no navegador com as contas sintéticas.
2. Para reiniciar o backend no mesmo banco, use o launcher `C:\Users\natha\AppData\Local\Temp\opencode\seaf-start-api.ps1`, que lê as credenciais do arquivo temporário e define `DATABASE_URL`/`MAIL_ENABLED`/limite de login apenas no processo. Não usar `npm run dev` sem essa configuração: ele voltaria ao `seaf_gestao_dev` do `.env`.
3. As credenciais temporárias não estão no repositório. Se o arquivo temporário for apagado, o ambiente funcional precisará de nova senha/seed ou de recuperação administrativa.
4. Fora do escopo desta execução: os fluxos listados em 7.10 como “apenas inspecionado”.

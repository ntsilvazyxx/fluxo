# Fase 4C.5 — Infraestrutura segura de integração

Data: 2026-11-13. Base: `feature/kanban-refactor`, commit `12e3c9999412995c37e0654e120176398b4e9b5a`.

## Escopo e conclusão

Infraestrutura implementada e validada sem campanha de banco real. Nenhum banco, usuário MariaDB ou migração foi criado/executado. Não houve importação, SQL de escrita contra MariaDB, alteração de `.env`, acesso a dados do recovery, envio externo de e-mail, commit ou push. O arquivo `bdseaf.sql` permaneceu intacto e não rastreado.

**Integração real: NÃO EXECUTADA.** Os 108 cenários preparados não estão homologados. Não se altera a classificação institucional de prontidão para produção com esta entrega. Existem pendências funcionais e contratuais descritas abaixo.

## Proteções implementadas

1. `backend/scripts/integration-guard.js`: exige `RUN_DATABASE_INTEGRATION=1`, DATABASE_URL e TEST_DATABASE_URL explícitas e idênticas. Só aceita protocolo MySQL, host `127.0.0.1`, porta explícita `3306`, schema `seaf_gestao_integration`, usuário explícito e nenhuma query string/fragmento. Recusa todos os demais destinos, inclusive `dev`, `test` e `recovery`, antes de instanciar o cliente.
2. Antes de preparar perfis ou permitir fixtures/API, executa apenas `SELECT DATABASE(), VERSION(), @@port`, leitura de `_prisma_migrations` e `SHOW GRANTS FOR CURRENT_USER`. Confirma o schema real, MariaDB 10.11.x, porta, seis migrações concluídas, ausência de rollback e igualdade dos checksums SHA-256 com os arquivos versionados. Desconecta em caso de divergência.
3. A conta de testes precisa de SELECT/INSERT/UPDATE/DELETE exclusivamente nesse schema. Privilégios globais, DDL, outros schemas, roles não reconhecidas e GRANT OPTION são recusados. `root` não é uma conta admissível para a campanha. Esse controle também impede que um SQL acidental tente atingir os bancos originais. O provisionamento/migrações dependerá de outra conta, sem reutilizá-la no runner.
4. `backend/testing/integration/context.js`: todas as 13 suítes e conexões adicionais passam pelo mesmo guard. URLs adicionais divergentes são rejeitadas; não há fallback para DATABASE_URL de desenvolvimento. A execução direta dos arquivos também passa pelo contexto. A API só aceita clientes registrados após a validação.
5. O contexto prepara idempotentemente somente as quatro roles conhecidas, com UUID na criação e `update: {}` para preservar roles existentes. Essa é a primeira escrita e ocorre somente depois das verificações. Não chama o seed administrativo ou cria usuário administrador de bootstrap.
6. Aplicações dos testes usam `mailEnabled=false`, worker desabilitado e diretórios recém-criados em `%TEMP%/seaf-integration-*`. Não importam `server.js`, que inicia rotinas. A suíte de imagens mantém seu próprio diretório temporário, com conferência de caminho antes da remoção. SMTP explícito usa transporte JSON ou falha injetada, sem rede. A outbox é processada somente por chamadas manuais nos testes sintéticos; sua recuperação de órfãos é global ao banco descartável.
7. JWT/chave de cifragem dos testes são efêmeros e exclusivos dos dados sintéticos. Não são gravados em `.env`, nem usados contra conteúdo cifrado histórico. Os arquivos temporários próprios são removidos; nenhum diretório privado existente é apagado.

O guard não substitui a restrição de permissões no MariaDB e não constitui uma sandbox para código arbitrário. Os scripts de E2E/carga em `quality/` não foram migrados nesta etapa e não devem ser usados contra os bancos preservados. O conjunto desta entrega é o runner `test:integration` e suas suítes.

## Migrações esperadas

Nenhum arquivo de migração foi alterado. A campanha exigirá exatamente:

1. `20261111170000_init_persistence`
2. `20261111171000_add_integrity_constraints`
3. `20261112110000_calendar_history_guards`
4. `20261112233000_auth_mfa_sessions`
5. `20261113001000_retire_mfa_preserve_history`
6. `20261113120000_running_clock_attachments`

O runner apenas verifica esse histórico; não cria schema, não migra, não resolve divergências e não limpa bancos. Históricos existentes de MFA não são acessados ou descartados.

## Fixtures e adaptação dos testes

Factories exclusivas em `backend/testing/integration/fixtures.js` preparam perfis, usuários, equipes, calendários publicados, tarefas/ciclos, atribuições, solicitações, auditoria, staging e metadados de anexos. Usuários/e-mails/IDs são sintéticos, com UUID; calendários têm horários e versão explícitos. Não existe dependência de registros do recovery ou de dumps.

Novas tarefas via HTTP recebem responsável e durações e já retornam AWAITING_ACCEPTANCE. Foi removida a atribuição inicial redundante nas suítes de solicitações, imagens e regressões de conclusão. Reatribuições recebem durações, expectedVersion e justificativa. Concorrência, rejeição e idempotência mantêm suas asserções. Cenários de tarefas antigas PENDING, inclusive os pais dos testes históricos de subtarefas, usam uma factory LEGACY_CALENDAR explícita em vez de um payload de criação novo inválido. O endpoint de subtarefas conserva seu contrato de deadlineAt.

As onze suítes existentes foram revisadas e passaram pelo contexto exclusivo. Os casos de permissões antigas continuam sinalizando a divergência descrita em Pendências; não foram alterados para aceitar silenciosamente uma política diferente. Nenhuma regra da aplicação foi flexibilizada.

| Arquivo em backend/test/integration | Casos preparados | Escopo principal |
|---|---:|---|
| auth-authorization.test.js | 9 | Sessões, usuários, equipes, RBAC |
| auth-stabilization.test.js | 9 | Recuperação, transporte local, histórico MFA |
| kanban.test.js | 6 | Escopo pessoal, equipes, filtros, notificações |
| mysql-integrity.test.js | 6 | Constraints, FKs e duas conexões concorrentes |
| phase4.test.js | 8 | Calendários, solicitações, pausas e prorrogação |
| phase5.test.js | 10 | Subtarefas e ciclos históricos sintéticos |
| phase6.test.js | 9 | Imagens privadas e compensações |
| phase7.test.js | 15 | Notificações, outbox, lembretes e falhas simuladas |
| phase8.test.js | 4 | Indicadores, filtros, escopo e rollback |
| phase9.test.js | 5 | Entradas hostis, autenticação e conclusão com pedido |
| tasks.test.js | 9 | Criação, atribuição, CAS, transições e idempotência |
| running-clock.test.js — novo | 11 | Atomicidade, prazos, pausa, reatribuição, reabertura, legado |
| attachments.test.js — novo | 7 | Staging, promoção, expiração, ownership, replay, arquivos protegidos |
| **Total** | **108** | **90 anteriores + 18 novos; nenhum executado contra MariaDB** |

A contagem considera dois casos gerados pelo laço EXTENSION/RETURN de phase9. Metadados de arquivos produzidos por factories não são apresentados como prova de upload físico; os novos cenários HTTP de anexos usam bytes de PNG sintético, armazenamento temporário e download real pelo Supertest.

## Validações executadas

Ambiente: Windows/PowerShell, Node.js 24.16.0, npm 11.13.0, Prisma 7.10.1. Sem instalação de dependências novas.

| Verificação | Resultado real |
|---|---|
| `npm.cmd run test --workspace backend` | 113 testes aprovados; 0 falhas, 0 cancelados. Integrações desabilitadas, 13 suítes sinalizadas SKIP; seus 108 casos não entram nos aprovados. |
| Guard, incluído nos 113 | 36 casos aprovados: mocks de conexão/migrações/grants, configurações, clientes adicionais e processos filhos com destino inválido |
| Execução direta protegida | Runner + todos os 13 arquivos foram invocados somente com URL deliberadamente recusada em porta 1; falharam antes de conexão/fixtures. Nenhum destino real foi habilitado. |
| `npm.cmd test` — frontend | 13 testes aprovados em 6 arquivos; 0 falhas |
| `npm.cmd run typecheck --workspace frontend` | Aprovado |
| `npm.cmd run lint` | 0 erros; 1 aviso preexistente de Fast Refresh em AuthContext.tsx |
| `npm.cmd run build` | Aprovado; principal 465,72 kB (gzip 142,26 kB) |
| `npm.cmd run prisma:validate` | Schema válido |
| `git diff --check` | Aprovado após revisão final |
| Integração MariaDB com escrita | **Não executada, conforme restrição** |

Os comandos gerais usaram RUN_DATABASE_INTEGRATION=0 e MAIL_ENABLED=0. As URLs do processo de testes unitários apontaram deliberadamente para porta 1, sem aproveitar credenciais locais. As exceções de opt-in nos testes do guard foram restritas a mocks ou subprocessos com destino inválido; nunca a uma conexão real. Prisma Generate e Validate não aplicam migrações.

## Pendências e riscos encontrados

1. **Métricas de RUNNING_CLOCK:** `task.service.js` cria atribuições novas sem calendarVersionId e o detalhe chama `calculateAssignmentMetrics`, que ainda encaminha calendarVersion nulo para `calculateWorkingMilliseconds`. Uma chamada isolada, somente em memória, com atribuição aceita e calendarVersion=null reproduziu TypeError. A ocorrência HTTP após aceite precisa da campanha autorizada. Os novos testes mantêm HTTP 200 como expectativa, sem preencher calendário artificialmente para ocultar o problema.
2. **ADMIN MASTER:** phase8 e parte de kanban ainda esperam 403 gerencial. O backend atual permite esse perfil, e a decisão mais recente em IMPLEMENTATION-DECISIONS registra administração global permanente. Os SDDs/validações históricos contêm restrições anteriores. É necessário consolidar a política aplicável antes de homologar esses casos; nesta etapa não foram alteradas permissões nem suprimidas as asserções que expõem a divergência.
3. **Reabertura:** restartCycle omite deadlinePolicy e o default do schema é LEGACY_CALENDAR, mesmo após encerrar RUNNING_CLOCK. O teste novo verifica preservação do ciclo encerrado e ausência de atribuição reutilizada, mas a política do novo ciclo requer definição documentada antes de afirmar cobertura completa de execução pós-reabertura.
4. **Legado e solicitações:** aprovação de prorrogação altera executionDeadlineAt, enquanto o presenter legado usa deadlineAt. A compatibilidade precisa de validação real adicional; não se presume que os testes antigos certifiquem esse comportamento.
5. **Campanha ainda não homologada:** validações sem banco não comprovam locks, constraints, triggers, downloads com dados persistidos, nem compatibilidade efetiva de grants/checksums no servidor. Falhas futuras deverão ser diagnosticadas sem flexibilizar regras.
6. **Resíduos sintéticos:** várias suítes preservam dados após desconectar. UUID/escopo reduzem colisões, mas o volume e a recuperação global de outbox podem afetar repetição. O banco deve ser exclusivamente descartável e sintético; não há limpeza global automática. Reutilização/limpeza ou descarte exigirão autorização própria.

## Arquivos alterados

- `backend/scripts/run-integration.js`; novo `backend/scripts/integration-guard.js`.
- Novos `backend/testing/integration/context.js` e `fixtures.js`.
- Todos os 11 arquivos anteriores em `backend/test/integration/`, listados na tabela.
- Novos `backend/test/integration/running-clock.test.js` e `attachments.test.js`.
- `backend/test/persistence/integration-guard.test.js`.
- `README.md`, `docs/CONTINUAR_EM_OUTRO_COMPUTADOR.md`, `docs/IMPLEMENTATION-DECISIONS.md` e este relatório.

Não houve alteração em backend/src, frontend, schema Prisma, SQL de migrações ou dependências.

## Próximo procedimento — somente após autorização

1. Inspecionar em leitura o servidor e confirmar ausência de `seaf_gestao_integration`. Se existir, interromper e apresentar seu estado, sem sobrescrever.
2. Autorizar separadamente a criação desse banco vazio, com charset/collation homologados, e de conta limitada ao schema. Não copiar recovery, test ou bdseaf.sql; não transferir dados históricos/cifrados.
3. Aplicar as seis migrações existentes exclusivamente nesse banco com conexão temporária explícita e conta de provisionamento. Conferir banco efetivo, histórico, checksums, tabelas, índices, FKs e triggers. Não usar db push, migrate reset ou migrate resolve.
4. Configurar uma conta de execução com apenas SELECT/INSERT/UPDATE/DELETE no schema exato. Evitar padrões com curingas nos grants. Verificar SHOW GRANTS antes de fornecer a conexão ao runner. Manter credenciais em canal privado e URLs somente no processo; não modificar `.env`.
5. Resolver/documentar as divergências de política e os defeitos candidatos acima, com autorização de escopo quando necessária.
6. Somente com **autorização explícita para a campanha com escrita**, habilitar RUN_DATABASE_INTEGRATION=1 e as duas URLs idênticas; executar o runner. Registrar aprovados/reprovados/ignorados reais e conferir preservação dos bancos originais. Até lá, não executar a campanha.

## Preservação local

Os SHA-256 conferidos nesta etapa coincidem com os valores anteriores:

- `.env`: `a26660a0f9cbd8606ea7c91b9bc1a000c603910337ab7986bdc7f72bf48f0f52`.
- `bdseaf.sql`: `26b28e46a9811fddbbb206a5a92395a27f48a704cef0acf63b8995bf217bed86`.

Não foram consultados ou alterados bancos reais nesta etapa. A preservação dos bancos decorre da ausência de execução contra eles; não se apresenta uma comparação SQL de dados que não foi realizada.

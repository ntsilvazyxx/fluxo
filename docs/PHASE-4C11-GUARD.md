# Fase 4C.11 — Endurecimento do guard de integração

Data: 2026-11-14  
Branch confirmada: `feature/kanban-refactor`

## 1. Estado ao assumir

O worktree já continha alterações locais de fases anteriores, incluindo modificações em `backend/scripts/integration-guard.js` e `backend/test/persistence/integration-guard.test.js`, além de arquivos não rastreados. Essas alterações foram preservadas. Atribuição individual ao Codex/Kilo não é possível pelo diff local; o conteúdo existente correspondia à seleção explícita das campanhas e ao isolamento da primeira campanha, documentados na Fase 4C.9.

Não havia `docs/PHASE-4C11-GUARD.md` nem probes de acesso a schemas no guard. Os testes existentes reproduziam a validação de URL, histórico e `SHOW GRANTS`, mas não verificavam privilégios indiretos do MariaDB.

O comando interrompido informado na passagem de contexto foi repetido em `backend/`: **60 aprovados, 0 falhas**.

## 2. Checksums: investigação

Não foi encontrada inconsistência na comparação:

- `expectedMigrations()` calcula SHA-256 diretamente dos bytes de cada `migration.sql` versionado.
- A consulta de histórico lê `migration_name`, `checksum`, `finished_at` e `rolled_back_at` de `_prisma_migrations`.
- O cliente fake constrói o histórico padrão a partir do retorno de `expectedMigrations()`, portanto simula checksums iguais aos esperados. Isso explica a aprovação dos casos válidos; não indica que a comparação seja ignorada.
- Já havia caso que altera um checksum e espera bloqueio. Foi mantido, e um teste adicional recalcula independentemente os hashes dos arquivos e confirma que a divergência interrompe o fluxo antes dos probes.

Nenhuma comparação foi normalizada ou enfraquecida.

## 3. Endurecimento implementado

Depois das verificações existentes de destino, seis migrações e privilégios declarados, o guard faz probes sequenciais com novas conexões usando as mesmas credenciais restritas de `DATABASE_URL`. Altera-se somente o schema na URL; não se usa root. Cada probe executa apenas `SELECT DATABASE()`.

Schemas consultados:

- `test`;
- `test_<UUID>` e um schema de controle aleatório não autorizado;
- `seaf_gestao_dev`, `seaf_gestao_test`, `seaf_gestao_recovery` e `seaf_gestao_integration`;
- `mysql` e `phpmyadmin`.

O tratamento é fail-closed:

- Sucesso no probe bloqueia a campanha.
- Erro MariaDB **1044** é a única negação aceita.
- **1049** em schema inexistente bloqueia: a autorização pode ter sido aceita antes de o servidor reportar que o schema não existe.
- Recusa de conexão, códigos não classificados, outros erros e seleção de um schema diferente também bloqueiam; mensagens e URLs não são propagadas, evitando exposição de credenciais.

A extração de códigos considera `errno`, `originalCode`, nomes de erro MariaDB e códigos encapsulados pelo adaptador Prisma. As regras existentes de `SHOW GRANTS` continuam exigindo escopo literal e apenas `SELECT/INSERT/UPDATE/DELETE`; permissões insuficientes, DDL, grants amplos, outros schemas e `GRANT OPTION` continuam recusados.

## 4. Arquivos alterados nesta fase

- `backend/scripts/integration-guard.js` — probes de leitura e classificação de erro.
- `backend/test/persistence/integration-guard.test.js` — regressões do guard.
- `docs/PHASE-4C11-GUARD.md` — este relatório.

O restante do worktree já estava alterado antes desta fase e foi deixado intacto. Não houve mudanças em regras de tarefa, RBAC, migrações, `.env`, `bdseaf.sql`, usuários/grants MariaDB ou dados de banco. Não houve commit ou push.

## 5. Testes adicionados

Os testes cobrem:

- lista e identidade dos probes, inclusive o schema aleatório `test_<UUID>` e o controle;
- negação 1044, nos formatos bruto e encapsulado pelo adaptador;
- bloqueio por acesso confirmado a `test`, `test_*`, bancos protegidos, banco da primeira campanha, `mysql`, `phpmyadmin` e controle;
- bloqueio por 1049, incluindo schema aleatório inexistente;
- falha de conexão e erros não classificados;
- cálculo independente dos SHA-256, divergência do histórico antes dos probes e preservação dos privilégios mínimos DML.

## 6. Validações executadas

| Comando | Resultado |
|---|---|
| `node --test --test-concurrency=1 test/persistence/integration-guard.test.js` | 79 aprovados, 0 falhas |
| `npm.cmd run test --workspace backend` com `RUN_DATABASE_INTEGRATION=0` e `MAIL_ENABLED=0` | 175 aprovados, 0 falhas; 13 suítes MariaDB exibidas como `SKIP`, não executadas |
| `npm.cmd test --workspace frontend` | 13 aprovados |
| `npm.cmd run lint` | 0 erros; 1 aviso preexistente de Fast Refresh em `AuthContext.tsx` |
| `npm.cmd run build` | Aprovado; typecheck e build Vite concluídos |
| `npm.cmd run prisma:validate` | Schema válido |
| `npx.cmd eslint backend/scripts/integration-guard.js backend/test/persistence/integration-guard.test.js` | Aprovado |
| `git diff --check` | Aprovado |

O script backend gerou o Prisma Client; não abriu conexão. Não foram executadas migrações, fixtures, probes reais no MariaDB ou os 108 cenários de integração. Nenhum banco foi conectado ou alterado nesta fase.

## 7. Pendências e prontidão

O teste unitário confirma os caminhos e a classificação simulada; não comprova os códigos efetivamente recebidos do servidor local. A conexão real de probe deve ser validada com a conta restrita antes de declarar o isolamento operacional.

**Parecer: endurecimento do código e validações sem banco concluídos; ainda não há evidência suficiente para autorizar a aplicação das seis migrações em `seaf_gestao_integration_2`.** O último estado documentado do `_2` é zero tabelas e zero migrações; esse estado não foi reconsultado. Aplicação de migrações, probes reais e campanha de integração continuam dependentes de autorização própria.

Fase 4C.11 encerrada. Aguardar autorização antes de qualquer atividade da Fase 4C.12.

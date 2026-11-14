# Fase 4C.6 — Provisionamento isolado da integração

Data: 2026-11-13. Branch: `feature/kanban-refactor`. HEAD preservado: `12e3c9999412995c37e0654e120176398b4e9b5a`.

## Resultado

Banco `seaf_gestao_integration` criado vazio em MariaDB **10.11.16-MariaDB**, host **127.0.0.1**, porta **3306**, charset **utf8mb4**, collation **utf8mb4_unicode_ci**. Sua ausência e a das duas contas foram confirmadas antes do provisionamento. Nenhum backup ou arquivo SQL local foi importado; nenhuma cópia dos bancos protegidos foi feita.

As seis migrações existentes foram aplicadas exclusivamente nesse banco, com `prisma migrate deploy`: código de saída **0**. `prisma migrate status` terminou com código **0** e informou **Database schema is up to date!**.

**Os 108 cenários de integração não foram iniciados. Não houve seed, bootstrap de administrador ou escrita de fixtures.** Esta entrega certifica o provisionamento e as verificações de isolamento, sem homologar o comportamento funcional da aplicação ou alterar a classificação de produção.

## Contas separadas

| Conta TCP local | Schema autorizado | Privilégios |
|---|---|---|
| `seaf_it_migrate@127.0.0.1` | somente `seaf_gestao_integration` | SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, TRIGGER |
| `seaf_it_run@127.0.0.1` | somente `seaf_gestao_integration` | SELECT, INSERT, UPDATE, DELETE |

SHOW GRANTS foi examinado sem publicar hashes de autenticação. Não existem privilégios administrativos globais, GRANT OPTION ou acesso a outros schemas. O grant usa underscores escapados, para indicar o schema literal e evitar curingas. USAGE global representa ausência de privilégios globais.

Ambas as contas conectaram ao banco autorizado. Consultas SELECT a `users` em cada um de `seaf_gestao_dev`, `seaf_gestao_test` e `seaf_gestao_recovery` foram recusadas com erro **1142**: seis verificações negativas aprovadas, três por conta. Não foi tentado SQL de escrita nos bancos protegidos.

As senhas foram geradas aleatoriamente e armazenadas somente em artefato local cifrado por **Windows DPAPI**, em diretório com ACL limitada ao usuário atual. Não foram incluídas em comandos exibidos, documentos, `.env` ou Git. A leitura posterior depende do mesmo usuário Windows; não publicar nem transferir esse artefato como configuração comum.

Os triggers foram criados pelo usuário de migração, que é seu DEFINER. Não excluir essa conta nem revogar seus privilégios necessários aos triggers sem procedimento específico de manutenção.

## Migrações e checksums

Todas têm finished_at preenchido, rolled_back_at nulo e SHA-256 igual ao arquivo versionado. Nenhuma migração foi editada ou resolvida artificialmente.

| Migração | SHA-256 |
|---|---|
| `20261111170000_init_persistence` | `a5a4c2f4f6244de5fa12c2a6cba289c820ff202190a08cd964e32ef0279c18db` |
| `20261111171000_add_integrity_constraints` | `4a126d353386b6b566164276c538727345bb9793dc2de425179811f64d97466d` |
| `20261112110000_calendar_history_guards` | `c7c3e1e34938419397a0a26168e008194155914ba841154d757c614728c9b151` |
| `20261112233000_auth_mfa_sessions` | `364dbd98df3440577d732e904a0ad67d75064049df0c4fe40089fed625bac259` |
| `20261113001000_retire_mfa_preserve_history` | `cdaa45f6754630db3343adfc41660b992aa8aca74ad5d42c532f9b873caf0634` |
| `20261113120000_running_clock_attachments` | `83cac05665079bdddc1d6dbd7ffd97267a91d44771849ca8faf2ef1de18fb4de` |

O processo Prisma recebeu DATABASE_URL e TEST_DATABASE_URL idênticas, apontando exclusivamente para integração. `prisma.config.js` foi inspecionado: dotenv não sobrescreve as variáveis explícitas do processo. Antes do deploy, SELECT DATABASE() confirmou o destino e SHOW TABLES confirmou o banco vazio. O CLI também exibiu o destino correto. RUN_DATABASE_INTEGRATION permaneceu 0 nos processos de deploy/status; MAIL_ENABLED permaneceu 0.

## Estruturas e dados

- **31 tabelas**, incluindo `_prisma_migrations`, `task_attachments`, `staged_uploads` e arquivos históricos de MFA.
- Colunas RUNNING_CLOCK confirmadas: `task_cycles.deadlinePolicy`, `acceptanceDeadlineAt`, `executionDeadlineAt` e `task_assignments.acceptanceDeadlineAt`. Default de deadlinePolicy: LEGACY_CALENDAR.
- **120 índices** (188 linhas de componentes de índices em information_schema).
- **50 constraints FK**, envolvendo 55 componentes de coluna; **151 constraints** no total.
- **19 triggers**, com nomes conferidos contra as migrações e definições presentes.
- Índices, constraints e componentes das FKs coincidem com a estrutura do recovery já migrado, comparados somente por leitura de metadados. Nenhum dado do recovery foi copiado.
- foreign_key_checks=1; event_scheduler=OFF; nenhuma rotina ou evento criado no schema.
- **Todas as 30 tabelas de aplicação têm zero registros**, inclusive usuários, tarefas, ciclos, anexos, staging, auditoria, roles e estruturas MFA históricas. Apenas `_prisma_migrations` contém as seis entradas esperadas.
- Os quatro perfis serão criados pelo contexto sintético da suíte, somente após seu guard. Não foi executado o seed administrativo.

Não houve inserção de registros para testar triggers/FKs. A inspeção certifica suas estruturas, não substitui a futura campanha de integridade e concorrência.

## Guard validado sem fixtures

Foram chamadas diretamente as mesmas funções de validação usadas pelo runner: validação das duas URLs e `validateIntegrationConnection`, com Prisma conectado como `seaf_it_run`. O guard aceitou o schema real, MariaDB 10.11.16, porta 3306, seis migrações/checksums e grants restritos.

Não foi chamado `run-integration.js`, nem `createIntegrationPrisma` do contexto que prepara roles. A validação real usou somente SELECT/SHOW e desconectou o cliente. Nenhuma API, worker, rotina agendada ou transporte de e-mail foi iniciado.

## Preservação dos bancos originais

Snapshots antes do provisionamento e depois da criação, deploy e verificação foram comparados. Para cada tabela, foram calculados contagem, hash SHA-256 das linhas canônicas ordenadas e hash da definição SHOW CREATE TABLE. Também foram comparados histórico Prisma e hashes de triggers, índices, constraints, FKs, rotinas e eventos.

Os valores abaixo são hashes agregados desses snapshots, não hashes de dumps. **Antes e depois são idênticos**; contagens completas por tabela estão nos artefatos locais.

| Banco preservado | Tabelas | Migrações | Usuários | Tarefas | Ciclos | SHA-256 antes = depois |
|---|---:|---:|---:|---:|---:|---|
| `seaf_gestao_dev` | 28 | 3 | 1 | 0 | 0 | `bcb97102a63a0cd85872453cdc981118a607962e711195dac8995333973fbcf7` |
| `seaf_gestao_test` | 29 | 5 | 817 | 1712 | 1806 | `cec6b96365694f197139beb954eb17ab4d8c8e18a827139e071ed9a9337f4807` |
| `seaf_gestao_recovery` | 31 | 6 | 817 | 1712 | 1806 | `f6cb2c92b2496efb9424cb37c28cc4ff72908783de6e4ab313340cc48714fcb0` |

Arquivos também preservados por SHA-256:

- `.env`: `a26660a0f9cbd8606ea7c91b9bc1a000c603910337ab7986bdc7f72bf48f0f52`.
- `bdseaf.sql`: `26b28e46a9811fddbbb206a5a92395a27f48a704cef0acf63b8995bf217bed86`.

## Evidências locais e alterações

Diretório ignorado pelo Git:

`.artifacts/integration-4c6-5bf5c930-2db3-46aa-b859-7fb485bd6bff/`

Contém preflight, snapshots antes/depois, resultado do provisionamento, saídas originais de migrate deploy/status, verificação do guard, conferência estrutural e credenciais cifradas. O ponteiro local está em `.artifacts/integration-4c6-current.json`. Esses artefatos não devem ser versionados. Os scripts locais de execução também estão em `.artifacts`; não são comandos de campanha nem devem ser repetidos para recriar o banco.

Arquivos de documentação desta fase: este relatório e o registro em IMPLEMENTATION-DECISIONS.md. Alterações anteriores da Fase 4C.5 foram preservadas. Nenhum código de produção, schema ou arquivo de migração foi alterado. Não houve commit ou push.

## Erros, avisos e prontidão

- Nenhum erro no provisionamento, deploy, Prisma Migrate Status, guard ou comparação dos bancos protegidos.
- Uma verificação auxiliar somente de leitura precisou converter o retorno BigInt de foreign_key_checks antes da comparação numérica. Corrigida e aprovada, sem repetir DDL, migrações ou alterar dados.
- As pendências funcionais/contratuais da [Fase 4C.5](PHASE-4C5-VALIDATION.md) permanecem: métricas RUNNING_CLOCK sem calendário, expectativas antigas de ADMIN MASTER, política de reabertura e compatibilidade de solicitações legadas. A existência do banco não demonstra que os 108 testes passarão.
- A chave histórica AUTH_DATA_ENCRYPTION_KEY não foi recuperada, gerada ou substituída nesta fase. A campanha sintética usará apenas chaves efêmeras do contexto de testes.

**Parecer: infraestrutura provisionada e isolamento aprovado para uma futura campanha autorizada.** A campanha de 108 cenários continua **NÃO EXECUTADA**. Aguardar autorização explícita antes de escrever fixtures, criar os quatro perfis sintéticos ou iniciar os testes.

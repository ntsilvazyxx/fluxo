# Fase 4C.12.1 — Tratamento de erros Prisma/MariaDB

## Parecer

**Correção do probe aprovada; prontidão para migração não aprovada.**

O guard agora recebe o erro original do driver para cada tentativa de seleção de schema. Os probes reais, somente de leitura, foram aprovados com as duas contas restritas. Entretanto, `_2` continua sem as seis migrações reais e o checksum de `seaf_gestao_dev` diverge do último baseline registrado. Não aplicar migrações nesta fase.

## 1. Causa técnica e estrutura dos erros

Versões instaladas: `@prisma/adapter-mariadb@7.10.1` e `mariadb@3.5.4`.

O adaptador Prisma converte erros do driver em `DriverAdapterError`, que pode aparecer dentro de `PrismaClientKnownRequestError` com código `P2010`. O probe Prisma executado anteriormente apresentou:

- Prisma: `P2010`;
- adaptador: `DriverAdapterError`;
- causa: `kind = mysql`, `originalCode = "45028"`, `code = 45028`, `state = HY000`.

O código `45028` é `ER_GET_CONNECTION_TIMEOUT`, emitido pelo pool MariaDB ao expirar a espera por uma conexão. Não é erro de autorização e não pode ser tratado como 1044. Nesse caminho, o adaptador não preservou o errno 1044 que o guard precisava classificar.

O código do adaptador mapeia o erro MariaDB 1044 para `kind = DatabaseAccessDenied` e 1049 para `kind = DatabaseDoesNotExist`; o driver direto expõe `errno`, `code` e `sqlState`. Em conexão direta com as credenciais restritas, `test` e um schema `test_<identificador>` retornaram `errno = 1044`, `code = ER_DBACCESS_DENIED_ERROR`, `sqlState = 42000`. Não se presumiu que `P2010` ou 45028 significassem acesso negado.

## 2. Correção

`probeDatabaseUrl` usa uma conexão individual com o driver MariaDB já instalado, a partir dos mesmos parâmetros decodificados da URL validada. Executa apenas `SELECT DATABASE()` e encerra a conexão. Não usa pool Prisma para tentar selecionar schemas proibidos.

A classificação do guard permanece fail-closed:

- somente erro MariaDB 1044 é aceito como negação;
- 1049 continua bloqueando;
- 45028, P2010 sem causa classificável, 1045, falhas de rede e erros desconhecidos bloqueiam;
- sucesso no probe ou seleção de schema diferente bloqueia.

Checksums, histórico esperado, regras de grants, URLs, banco selecionado e autorização do guard não foram flexibilizados.

## 3. Arquivos alterados

- `backend/scripts/integration-guard.js` — probe com conexão direta MariaDB.
- `backend/test/persistence/integration-guard.test.js` — cinco regressões para causas P2010, 1049, 45028 e autenticação.
- `backend/package.json` e `package-lock.json` — declaração direta de `mariadb@3.5.4`, já presente no lockfile e em `node_modules` como dependência do adaptador; nenhum pacote novo foi instalado.
- `docs/IMPLEMENTATION-DECISIONS.md` — registro da decisão e ressalvas.
- `docs/PHASE-4C121-ERROR-HANDLING.md` — este relatório.

Alterações locais anteriores foram preservadas. Não houve alteração de `.env`, usuários/grants, código funcional de tarefas ou configuração do banco.

## 4. Testes e validações

| Validação | Resultado |
|---|---|
| Testes do guard | **85 aprovados**, 0 falhas (79 anteriores + 6 novos) |
| Testes backend (`RUN_DATABASE_INTEGRATION=0`, `MAIL_ENABLED=0`) | **181 aprovados**, 0 falhas; 13 suítes MariaDB puladas |
| Testes frontend | **13 aprovados**, 0 falhas |
| Lint | 0 erros; 1 aviso preexistente `react-refresh/only-export-components` |
| Build frontend | Aprovado |
| Prisma Validate | Schema válido |
| `npm ls mariadb --workspace backend --depth=0` | `mariadb@3.5.4` resolvido |
| `git diff --check` | A executar após a documentação final |

O comando npm para atualizar o lockfile em modo offline não encontrou resposta de registry em cache. Nenhum pacote foi baixado; os manifests foram alinhados à versão já instalada e existente no lockfile. A verificação `npm ls` confirmou a dependência direta.

## 5. Probes reais somente de leitura

Executados após as suítes unitárias, em `127.0.0.1:3306`, sem root e com as credenciais DPAPI das contas restritas. Cada schema proibido foi tentado em conexão individual; a única consulta em conexões permitidas foi `SELECT DATABASE(), CURRENT_USER()`.

| Schema | `seaf_it2_run` | `seaf_it2_migrate` |
|---|---|---|
| `test` | Negado — 1044 | Negado — 1044 |
| `test_<identificador único>` | Negado — 1044 | Negado — 1044 |
| Controle `seaf_guard_unauthorized_<identificador único>` | Negado — 1044 | Negado — 1044 |
| `seaf_gestao_dev` | Negado — 1044 | Negado — 1044 |
| `seaf_gestao_test` | Negado — 1044 | Negado — 1044 |
| `seaf_gestao_recovery` | Negado — 1044 | Negado — 1044 |
| `seaf_gestao_integration` | Negado — 1044 | Negado — 1044 |
| `mysql` | Negado — 1044 | Negado — 1044 |
| `phpmyadmin` | Negado — 1044 | Negado — 1044 |
| `seaf_gestao_integration_2` | Permitido; `CURRENT_USER()` correto | Permitido; `CURRENT_USER()` correto |

A etapa de probes padrão do guard também foi executada com o driver corrigido. Como o `_2` ainda não tem `_prisma_migrations`, um cliente de controle forneceu apenas o gate de histórico esperado para alcançar a etapa de probes; isso não simula nem aprova uma execução real da campanha. O guard completo continua exigindo as seis migrações e seus checksums reais.

Não foi necessário criar schema para os probes; os nomes aleatórios foram apenas tentados. Nenhuma escrita, fixture ou migração ocorreu.

## 6. Integridade dos bancos protegidos

Os checksums foram calculados por consultas somente de leitura e comparados ao último baseline de 4C.10.3. A conexão administrativa foi usada exclusivamente para esses checksums; não foi usada nos probes.

| Banco | Tabelas | SHA-256 atual | Comparação com baseline 4C.10.3 |
|---|---:|---|---|
| `seaf_gestao_dev` | 28 | `e2826f2cb38e321332e636057476cd601f245122e5cd15a682bf54a524b94015` | **Divergente**; baseline `58b9c841f8d023e741df4e82c4f6c5138d6028832112d1bc5f3cdbabfd95acb4` |
| `seaf_gestao_test` | 29 | `114bc2c1b1fdf1581a89876f02cb50447176d2308778ad374f948cee4683af59` | Idêntico |
| `seaf_gestao_recovery` | 31 | `7f0d6dd12104385e1550b5160cb5e30dc95ebee85e7350957b90aa33c06c687b` | Idêntico |
| `seaf_gestao_integration` | 31 | `68be97c862a5c24eda0aea07c91db01304fb25512e08c1dd1759c132af40bc78` | Idêntico |

As contagens de tabelas coincidem com o baseline. A causa da divergência de `seaf_gestao_dev` não foi determinada. Nenhum banco foi escrito por esta fase; não se presume quando nem por quem a diferença ocorreu. É necessária investigação autorizada antes de atestar a preservação integral.

## 7. Pendências e prontidão

- Confirmar, por procedimento autorizado, a origem da divergência do checksum de `seaf_gestao_dev`.
- O `_2` permanece com zero tabelas e zero migrações; a aprovação do histórico real de seis migrações não pode ser feita antes da aplicação autorizada.
- Revalidar os quatro bancos protegidos depois de resolver a divergência e, posteriormente, validar o histórico/checksums reais de `_2`.

**Conclusão:** o tratamento de erros e os probes reais foram corrigidos e aprovados. O ambiente **não está liberado para solicitar/aplicar migrações** enquanto a divergência de integridade permanecer sem explicação. Não foram executados `migrate deploy`, fixtures, os 108 cenários, commit ou push.

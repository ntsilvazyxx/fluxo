# Fase 4C.10.3 — Correção Controlada do Isolamento MariaDB

**Data:** 2026-11-14  
**Escopo:** remover exclusivamente as duas linhas curinga de `mysql.db` que concediam acesso ao banco `test` e ao padrão `test\_%`.  
**Restrições cumpridas:** sem migrações, fixtures, testes de integração, alteração de código da aplicação, alteração de `.env`, alteração de `bdseaf.sql`, commit, push ou reinício da MariaDB.

## 1. Baseline inicial

- MariaDB: **10.11.16-MariaDB**.
- Host/porta: **127.0.0.1:3306**.
- `seaf_gestao_integration_2`: **0 tabelas**, **0 migrações**.
- `mysql.db`: **7 linhas**, sendo **2 curinga** e **5 não visadas**.
- `mysql.db` é Aria, `TRANSACTIONAL=1`, 23 colunas, PK `(Host, Db, User)`.
- `test`: latin1, **0 tabelas, 0 views, 0 routines, 0 events, 0 triggers**; `C:\xampp\mysql\data\test` contém apenas `db.opt`.
- Não existe conta anônima em `mysql.user`; `SHOW GRANTS FOR ''@'%'` retornava **1141**.

### Linhas curinga antes da correção

| User | Host | Db | Privilégios |
|---|---|---|---|
| `''` | `%` | `test` | `SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES, TRIGGER, CREATE TEMPORARY TABLES, LOCK TABLES, CREATE VIEW, SHOW VIEW, CREATE ROUTINE, EVENT, DELETE HISTORY`; sem `GRANT`, `ALTER ROUTINE`, `EXECUTE` |
| `''` | `%` | `test\_%` | mesmos privilégios |

### Contas existentes

- `seaf_it2_migrate@127.0.0.1`
- `seaf_it2_run@127.0.0.1`
- `seaf_it_migrate@127.0.0.1`
- `seaf_it_run@127.0.0.1`
- `pma@localhost`
- `root@localhost`, `root@127.0.0.1`, `root@::1`
- `mariadb.sys@localhost`

### Bancos protegidos — baseline

| Banco | Tabelas | Checksum SHA-256 (todas as base tables) |
|---|---:|---|
| `seaf_gestao_dev` | 28 | `58b9c841f8d023e741df4e82c4f6c5138d6028832112d1bc5f3cdbabfd95acb4` |
| `seaf_gestao_test` | 29 | `114bc2c1b1fdf1581a89876f02cb50447176d2308778ad374f948cee4683af59` |
| `seaf_gestao_recovery` | 31 | `7f0d6dd12104385e1550b5160cb5e30dc95ebee85e7350957b90aa33c06c687b` |
| `seaf_gestao_integration` | 31 | `68be97c862a5c24eda0aea07c91db01304fb25512e08c1dd1759c132af40bc78` |

### Hashes de integridade

| Item | SHA-256 |
|---|---|
| `.env` | `a26660a0f9cbd8606ea7c91b9bc1a000c603910337ab7986bdc7f72bf48f0f52` |
| `bdseaf.sql` | `26b28e46a9811fddbbb206a5a92395a27f48a704cef0acf63b8995bf217bed86` |
| `mysql.db` — 5 linhas não visadas | `bd90dfb278dbebc3d5ef2dc0f842478c03c6fd61eedce82cd1cbd8559024fb7a` |
| `mysql.user` (sem authentication_string) | `966a2fd0703538674cf52ab3095c5203b9130fa086a31424f52dc3aa007b708a` |
| `mysql.global_priv` (access masks) | `b968bef81bbafc759b1ca798322da641a19399eb0d73cdad8c722a7acb34c9d6` |

## 2. Backups gerados e verificados

Diretório privado: `.artifacts/integration-4c103-8ee047e5-fe7b-48fe-867b-27a90152a944/`.

| Arquivo | Tamanho | SHA-256 | Conteúdo |
|---|---:|---|---|
| `mysql-db-backup.sql` | 4712 | `c4344b8c30ddbffe50050d11c5534f388239d8003018da800b7c7190192ace25` | dump integral de `mysql.db`; **7** `INSERT INTO`; sem `authentication_string`, `mysql.user` ou `global_priv` |
| `restore.sql` | 1041 | `5d4a0fa7d340e6e80dd8f3b0a996cc1be9d7e41210c5ffe2f19c9a40f93c443a` | **2** `REPLACE INTO` com as 23 colunas; `USE mysql;`; escape literal de `test\_%` |
| `wildcards.json` | 1816 | `86c78d72b566ea845e57aed012ed02dfa5ad59ba478a3a4e45e9912b4264e454` | 2 linhas, 23 colunas; hash do conjunto de linhas: `8792d20f3f97aafaf5c9308dc1164447d2887afb1bd43caf3f640d20212116a9` |
| `baseline.json` | 5098 | `3984a1591fa561f692d32ebd0a8d9a12f0a6a0430f8a6f7142ebbff480adec4d` | baseline completo |
| `backup-manifest.json` | — | `a599033ea46c58ceb0ceea237a677fafdaa5c6b6fc6279cc3fe0079315ebd51f` | manifesto de recuperação |

Verificações do backup:

- O dump contém exatamente **7** `INSERT INTO`, incluindo as 2 linhas curinga e as 5 não visadas.
- O `restore.sql` contém exatamente **2** `REPLACE INTO`, com as 23 colunas e os valores idênticos ao baseline.
- O `wildcards.json` corresponde exatamente às 2 linhas lidas antes da exclusão (`wildcardRowsMatch = true`).
- O backup é suficiente para restauração exata: `mysql -u root mysql < mysql-db-backup.sql` para o dump integral; `mysql -u root < restore.sql` para a restauração focada.
- Nenhum backup contém senha, hash de autenticação ou `authentication_string`.

## 3. Método de correção utilizado

### 3.1 Tentativa administrativa `REVOKE`

1. `REVOKE ALL PRIVILEGES ON `test`.* FROM ''@'%';` → **ERROR 1141 (42000): There is no such grant defined for user '' on host '%'**.
2. `REVOKE ALL PRIVILEGES ON `test\\_%`.* FROM ''@'%';` → **ERROR 1141 (42000)**.

Motivo: não existe conta `''@'%'` em `mysql.user`; as linhas de `mysql.db` são órfãs, mas continuam efetivas. O `REVOKE` não é aplicável.

### 3.2 Verificação prévia à remoção cirúrgica

Após as duas falhas de `REVOKE`, foi executada a verificação somente leitura:

- `wildcardRowsMatch = true` — as 2 linhas continuavam idênticas ao baseline.
- `mysql.db` com **7** linhas.
- `nonTargetHash` inalterado (`bd90...`).
- `userHash` inalterado (`966a...`).
- `globalHash` inalterado (`b968...`).
- Checksums dos quatro bancos protegidos inalterados.
- `.env` e `bdseaf.sql` inalterados.

### 3.3 Remoção cirúrgica

Comando exato aplicado:

```sql
SELECT * FROM mysql.db WHERE User='' AND Host='%' AND Db IN ('test','test\\_%');
DELETE FROM mysql.db WHERE User='' AND Host='%' AND Db IN ('test','test\\_%');
SELECT ROW_COUNT() AS affected;
SELECT COUNT(*) AS remaining FROM mysql.db;
```

Resultado:

- Linhas selecionadas antes do `DELETE`: **2**.
- `ROW_COUNT()`: **2**.
- `mysql.db` restante: **5**.

Nenhuma outra linha de `mysql.db` foi tocada.

### 3.4 Recarga

`FLUSH PRIVILEGES;` → **exit code 0**, sem erro.

## 4. Quantidade exata de linhas alteradas

- `mysql.db`: **7 → 5**.
- Linhas curinga removidas: **2**.
- Linhas não visadas alteradas: **0**.
- `mysql.user`: **0** alterações.
- `mysql.global_priv`: **0** alterações.
- `mysql.tables_priv`, `mysql.columns_priv`, `mysql.procs_priv`, `mysql.proxies_priv`, `mysql.roles_mapping`: **0** alterações.
- Bancos criados/apagados: **0**.

## 5. Resultado do `FLUSH PRIVILEGES`

- `FLUSH PRIVILEGES` concluído com **exit code 0**.
- Após a recarga, os probes já refletem o novo estado: `test` e `test_*` negados; `_2` permitido.
- `mysql.db` permanece com **5** linhas.

## 6. Probes de acesso das duas contas

Probe somente leitura: `USE <db>; SELECT DATABASE();` via TCP 127.0.0.1:3306, com as credenciais DPAPI das contas.

| Conta | Banco | Resultado | Erro |
|---|---|---|---|
| `seaf_it2_migrate` | `seaf_gestao_integration_2` | **ALLOWED** | — |
| `seaf_it2_migrate` | `test` | **DENIED** | 1044 |
| `seaf_it2_migrate` | `test_<random>` | **DENIED** | 1044 |
| `seaf_it2_migrate` | `seaf_gestao_dev` | **DENIED** | 1044 |
| `seaf_it2_migrate` | `seaf_gestao_test` | **DENIED** | 1044 |
| `seaf_it2_migrate` | `seaf_gestao_recovery` | **DENIED** | 1044 |
| `seaf_it2_migrate` | `seaf_gestao_integration` | **DENIED** | 1044 |
| `seaf_it2_migrate` | `mysql` | **DENIED** | 1044 |
| `seaf_it2_migrate` | `phpmyadmin` | **DENIED** | 1044 |
| `seaf_it2_run` | `seaf_gestao_integration_2` | **ALLOWED** | — |
| `seaf_it2_run` | `test` | **DENIED** | 1044 |
| `seaf_it2_run` | `test_<random>` | **DENIED** | 1044 |
| `seaf_it2_run` | `seaf_gestao_dev` | **DENIED** | 1044 |
| `seaf_it2_run` | `seaf_gestao_test` | **DENIED** | 1044 |
| `seaf_it2_run` | `seaf_gestao_recovery` | **DENIED** | 1044 |
| `seaf_it2_run` | `seaf_gestao_integration` | **DENIED** | 1044 |
| `seaf_it2_run` | `mysql` | **DENIED** | 1044 |
| `seaf_it2_run` | `phpmyadmin` | **DENIED** | 1044 |

### Identidade

| Conta | `USER()` | `CURRENT_USER()` | `CURRENT_ROLE()` |
|---|---|---|---|
| `seaf_it2_migrate` | `seaf_it2_migrate@localhost` | `seaf_it2_migrate@127.0.0.1` | `NULL` |
| `seaf_it2_run` | `seaf_it2_run@localhost` | `seaf_it2_run@127.0.0.1` | `NULL` |

### Grants individuais

- `seaf_it2_migrate`: `USAGE` + `SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, REFERENCES, INDEX, ALTER, TRIGGER` em `` `seaf\_gestao\_integration\_2`.* ``.
- `seaf_it2_run`: `USAGE` + `SELECT, INSERT, UPDATE, DELETE` em `` `seaf\_gestao\_integration\_2`.* ``.

### Estado do `_2`

- `SHOW TABLES` em `seaf_gestao_integration_2`: **0 tabelas** para ambas as contas.
- `_prisma_migrations`: **não existe**.
- Nenhuma migração, fixture ou dado de aplicação foi criado.

## 7. Integridade dos bancos protegidos

| Banco | Tabelas | Checksum após correção | Antes |
|---|---:|---|---|
| `seaf_gestao_dev` | 28 | `58b9c841f8d023e741df4e82c4f6c5138d6028832112d1bc5f3cdbabfd95acb4` | idêntico |
| `seaf_gestao_test` | 29 | `114bc2c1b1fdf1581a89876f02cb50447176d2308778ad374f948cee4683af59` | idêntico |
| `seaf_gestao_recovery` | 31 | `7f0d6dd12104385e1550b5160cb5e30dc95ebee85e7350957b90aa33c06c687b` | idêntico |
| `seaf_gestao_integration` | 31 | `68be97c862a5c24eda0aea07c91db01304fb25512e08c1dd1759c132af40bc78` | idêntico |

Também confirmado:

- `test`: 0 tabelas/views/routines/events/triggers; `db.opt` permanece.
- `seaf_restore_test_*`: 4 schemas, **29 tabelas cada**, inalterados.
- `phpmyadmin`: inalterado.
- `.env` e `bdseaf.sql`: hashes inalterados.
- `mysql.db` — 5 linhas não visadas: `nonTargetHash` inalterado (`bd90...`).
- `mysql.user`: `userHash` inalterado (`966a...`).
- `mysql.global_priv`: `globalHash` inalterado (`b968...`).

## 8. Preservação dos grants das demais contas

### `mysql.db` final

| Host | Db | User | Observação |
|---|---|---|---|
| `localhost` | `phpmyadmin` | `pma` | inalterado |
| `127.0.0.1` | `seaf\_gestao\_integration\_2` | `seaf_it2_migrate` | inalterado (DDL/DML) |
| `127.0.0.1` | `seaf\_gestao\_integration\_2` | `seaf_it2_run` | inalterado (DML) |
| `127.0.0.1` | `seaf\_gestao\_integration` | `seaf_it_migrate` | inalterado (DDL/DML) |
| `127.0.0.1` | `seaf\_gestao\_integration` | `seaf_it_run` | inalterado (DML) |

- Nenhuma linha curinga permanece.
- `mysql.user`: **9** contas, sem conta anônima.
- `mysql.global_priv`: `root` com access mask completo; `pma`, `seaf_*` com mask 0.
- `mysql.tables_priv`: apenas `mariadb.sys@localhost` em `mysql.global_priv`.
- `mysql.columns_priv`, `mysql.procs_priv`, `mysql.roles_mapping`: vazios.
- `mysql.proxies_priv`: apenas `root@localhost` padrão.
- `tablesPriv`, `columnsPriv`, `procsPriv`, `proxiesPriv`, `rolesMapping`: idênticos ao baseline.

## 9. Necessidade ou não de reversão

- **Não foi necessária reversão.**
- Todos os probes, hashes, contagens e checksums passaram.
- O backup permanece disponível em `.artifacts/integration-4c103-8ee047e5-fe7b-48fe-867b-27a90152a944/` para eventual rollback.

## 10. Parecer final sobre o isolamento

**Isolamento aprovado** para `seaf_it2_migrate` e `seaf_it2_run`:

- `seaf_gestao_integration_2`: **permitido**, 0 tabelas.
- `test`, `test_*`, `seaf_gestao_dev`, `seaf_gestao_test`, `seaf_gestao_recovery`, `seaf_gestao_integration`, `mysql`, `phpmyadmin`: **negado (1044)**.
- Grants nominais corretos: migração com DDL/DML; execução somente DML.
- Outras contas preservadas; bancos protegidos inalterados; `.env` e `bdseaf.sql` inalterados.
- As duas linhas curinga foram removidas; nenhum banco foi apagado.

**Ressalvas:**

- `root@localhost`, `root@127.0.0.1` e `pma@localhost` permanecem sem senha (configuração pré-existente do XAMPP); isso não foi alterado nesta fase.
- O guard atual baseado em `SHOW GRANTS FOR CURRENT_USER` não enxerga linhas curinga de `mysql.db`; a proteção contra recorrência depende dos probes somente leitura (Etapa 3), ainda não autorizada.
- Nenhuma migração, fixture, teste de integração, alteração em código da aplicação, alteração de `.env`, alteração de `bdseaf.sql`, commit, push ou reinício da MariaDB foi executado.
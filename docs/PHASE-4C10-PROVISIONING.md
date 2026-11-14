# Fase 4C.10 — Provisionamento parcial, interrompido

Data: 2026-11-14. Branch `feature/kanban-refactor`; HEAD mantido em `1013cc623d459453f575c03c1311e9d1d07ac085`.

## Resultado

**NÃO CONCLUÍDO. NÃO APTO para a segunda campanha.** O banco `seaf_gestao_integration_2` e duas contas novas foram criados, mas a validação de acesso da conta de migração falhou. Conforme a instrução do item 4 — “Interromper em caso de divergência” — não houve novas alterações de privilégios, migrações, limpeza, recriação de banco ou tentativa automática de corrigir o provisionamento.

As verificações posteriores foram exclusivamente de leitura. Os quatro bancos protegidos, `.env` e bdseaf.sql permaneceram preservados. Nenhum teste de integração/fixture foi executado; nenhum commit ou push foi realizado.

| Item | Estado real |
|---|---|
| Servidor | MariaDB 10.11.16-MariaDB, 127.0.0.1:3306 |
| Banco criado | `seaf_gestao_integration_2` |
| Charset/collation | utf8mb4 / utf8mb4_unicode_ci |
| Contas criadas | `seaf_it2_migrate@127.0.0.1`, `seaf_it2_run@127.0.0.1` |
| Tabelas no novo banco | **0** |
| Migrações aplicadas | **0** |
| prisma migrate deploy | **Não executado** |
| Prisma Migrate Status | **Não executado** |
| Registros de aplicação | **0** |
| Guard de URLs/seleção | Validação pura aprovada para `_2`, URLs idênticas |
| Guard de conexão real | **Não aprovado/não concluído**: acesso ao schema recusado antes das leituras necessárias |
| Fixtures/perfis | Não preparados; continuarão sendo responsabilidade da futura suíte autorizada |

## 1. Verificações iniciais

A primeira tentativa de conexão recebeu ECONNREFUSED: o MariaDB do XAMPP estava parado. Não havia outra instância/processo ou serviço MySQL/MariaDB ativo encontrado na inspeção. O executável existente `C:\xampp\mysql\bin\mysqld.exe` foi iniciado normalmente, em segundo plano, usando `C:\xampp\mysql\bin\my.ini` e `--standalone`. Nenhuma instalação, senha ou configuração foi redefinida.

Depois da inicialização foram confirmados MariaDB 10.11.16 e porta 3306, conexão via 127.0.0.1 e os quatro bancos protegidos existentes. `_2` e os nomes das duas contas novas estavam ausentes antes da criação. Foram registrados snapshots completos de contagens/hashes dos bancos protegidos antes de qualquer criação.

As seis pastas de migração e seus SHA-256 foram inventariados e o SQL foi inspecionado para impedir redirecionamento para outros bancos. O schema alvo foi criado vazio, sem importação/cópia de recovery, dumps, bdseaf.sql ou dados de qualquer outro banco.

## 2. Erro de provisionamento e diagnóstico

Erro original após a criação do banco, contas e grants, ao tentar selecionar o schema com a conta de migração:

```text
ER_DBACCESS_DENIED_ERROR / 1044 / SQLState 42000
Access denied for user 'seaf_it2_migrate'@'127.0.0.1' to database 'seaf_gestao_integration_2'
```

### Escape excessivo no script local

O script local desta fase foi escrito com escape excessivo dos underscores no GRANT. A transformação dinâmica usou dois caracteres de barra invertida antes de cada underscore no SQL efetivo, em vez de reproduzir o escopo funcional anterior. O padrão registrado não corresponde ao nome real do novo banco.

SHOW GRANTS e mysql.db foram examinados sem exibir hashes de autenticação ou senhas. Comparação de caracteres efetivamente retornados:

- Contas funcionais da primeira campanha: duas barras no total, uma antes de cada um dos dois underscores do schema original.
- Contas novas: seis barras no total, duas antes de cada um dos três underscores de `_2`.

As contas novas autenticam normalmente sem schema, com CURRENT_USER() correspondente a seus nomes e host 127.0.0.1. A falha é de escopo de privilégio, não de senha, conta trocada ou banco ausente. Esse erro do script não foi corrigido automaticamente após a interrupção.

### Acesso preexistente ao schema test

Durante a auditoria somente de leitura, foi observado que ambas as contas novas conseguem conectar selecionando **`test`**, embora não tenham recebido grant explícito para esse banco nesta fase. CURRENT_USER() continuou apontando para as contas novas, não para outro usuário.

Existem linhas preexistentes em mysql.db para User vazio, Host `%`, com scopes `test` e `test\_%`, contendo permissões de SELECT, INSERT, UPDATE, DELETE e CREATE, entre outras. Nenhuma dessas linhas foi criada ou modificada nesta fase.

Foi confirmado acesso de seleção de schema (`SELECT DATABASE()`), sem executar DDL/DML de teste em `test` ou em bancos de terceiros. Assim, **não é possível declarar exclusividade efetiva das contas**, mesmo corrigindo apenas o GRANT de `_2`. As permissões preexistentes precisam de revisão administrativa autorizada; não serão revogadas silenciosamente porque podem afetar outros usuários/fluxos do XAMPP.

Esse resultado também demonstra o limite de confiar apenas em SHOW GRANTS da conta nomeada: a auditoria efetiva precisa considerar os scopes genéricos preexistentes e bases acessíveis. Não houve alteração do guard/código do projeto nesta etapa para contornar ou resolver esse ponto.

## 3. Contas e segurança das credenciais

| Conta | Privilégios solicitados ao GRANT | Limitação atual |
|---|---|---|
| seaf_it2_migrate | SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, TRIGGER no novo schema | Escopo escapado incorretamente; não consegue selecionar `_2` |
| seaf_it2_run | SELECT, INSERT, UPDATE, DELETE no novo schema | Mesmo escopo incorreto; exclusividade também não certificada devido ao acesso a test |

Os grants nomeados não incluem privilégios administrativos globais ou GRANT OPTION. USAGE global não concede administração. Isso **não resolve** o acesso adicional observado a `test`.

Foram geradas senhas aleatórias e armazenadas somente em arquivo local cifrado por Windows DPAPI, dentro de diretório com ACL restrita ao usuário Windows atual. Nenhum segredo foi exibido, inserido em `.env`, documentação ou Git. As contas da primeira campanha não tiveram grants alterados.

Ambas as contas novas tiveram SELECT recusado, erro **1142**, para `users` nos quatro bancos protegidos: oito verificações negativas aprovadas. Não foram tentadas operações de escrita nesses bancos. O acesso negado aos protegidos não basta para aprovar o isolamento, pois o acesso a `test` também precisa ser resolvido.

## 4. Migrações, estruturas e guard

Não foi iniciado prisma migrate deploy. Portanto, não existem `_prisma_migrations`, tabelas de aplicação, estruturas RUNNING_CLOCK, task_attachments, staged_uploads, índices, FKs ou triggers no banco novo. O resultado esperado de 31 tabelas/seis migrações **não foi atingido** e não é apresentado como aprovado.

Os arquivos locais das seis migrações existentes foram preservados. Seus checksums foram registrados no preflight, mas não há checksums aplicados para comparar no banco novo. Nenhum arquivo de migração foi editado, resolvido artificialmente ou executado por outro mecanismo.

A validação pura do guard confirmou seleção explícita INTEGRATION_DATABASE_NAME=`seaf_gestao_integration_2`, host/porta e DATABASE_URL/TEST_DATABASE_URL idênticas usando as credenciais novas apenas em memória. A validação de banco efetivo/migrações/grants via guard não foi concluída porque a conexão com schema é recusada. Não se chamou o runner ou o helper que cria perfis.

Após uma eventual correção autorizada, será necessário validar novamente acesso/exclusividade, aplicar as seis migrações, executar migrate status, conferir checksums/31 tabelas/estruturas e comprovar zero registros de aplicação. Os quatro perfis serão preparados somente pelas fixtures na campanha autorizada, não pelo provisionamento.

## 5. Preservação antes/depois

Snapshots canônicos das linhas de cada tabela, contagens, SHOW CREATE TABLE, histórico Prisma e metadados de índices, constraints, FKs, triggers, rotinas e eventos foram comparados entre preflight e verificação final. **Todos os quatro bancos estão idênticos antes/depois desta intervenção.**

| Banco protegido | Tabelas | Migrações | Usuários | Tarefas | Ciclos | SHA-256 agregado antes = depois |
|---|---:|---:|---:|---:|---:|---|
| seaf_gestao_dev | 28 | 3 | 1 | 0 | 0 | `33594b08f7838c39d7e76e215c528611681d71216011389e9475af639de5096d` |
| seaf_gestao_test | 29 | 5 | 817 | 1712 | 1806 | `cec6b96365694f197139beb954eb17ab4d8c8e18a827139e071ed9a9337f4807` |
| seaf_gestao_recovery | 31 | 6 | 817 | 1712 | 1806 | `f6cb2c92b2496efb9424cb37c28cc4ff72908783de6e4ab313340cc48714fcb0` |
| seaf_gestao_integration | 31 | 6 | 62 | 43 | 45 | `9b9d41aa5b328b3094c38c1cc8580334bbc72a02ed76eda86a7906b4a4c42248` |

Os hashes usam o preflight novo como referência, sem presumir que todos os metadados/sessões entre fases anteriores continuaram iguais. Adicionalmente, as linhas e definições de tabela da primeira campanha foram comparadas às evidências pós-4C.7 e coincidiram. As contagens completas por tabela estão nos artefatos locais, sem cópia de dados reais.

Arquivos conferidos antes/depois:

- `.env`: `a26660a0f9cbd8606ea7c91b9bc1a000c603910337ab7986bdc7f72bf48f0f52`.
- bdseaf.sql: `26b28e46a9811fddbbb206a5a92395a27f48a704cef0acf63b8995bf217bed86`.

Nenhum banco foi apagado ou recriado. O novo banco vazio e as contas permanecem para inspeção; não se executou limpeza para ocultar o provisionamento parcial.

## 6. Evidências e arquivos desta fase

Diretório privado, ignorado pelo Git:

`.artifacts/integration-4c10-cebdb41c-c13d-40ba-90b2-8813b045661e/`

Contém preflight.json, credentials.dpapi, blocked-diagnostic.json, grant-scope-analysis.json, final-blocked-state.json e snapshots protegidos antes/depois. O ponteiro é `.artifacts/integration-4c10-current.json`. Não versionar esse diretório. Os scripts locais de execução/diagnóstico também ficam em `.artifacts`; não reutilizá-los como procedimento de criação, pois o banco agora existe e o erro de escape deve ser revisto antes de qualquer execução autorizada.

Somente este relatório, IMPLEMENTATION-DECISIONS e o checkpoint do guia foram acrescentados/atualizados como documentação da fase. Código de produção, guard, testes, schema e migrações não foram alterados nesta fase. Alterações locais anteriores de 4C.8/4C.9 foram preservadas. Não houve commit/push.

## 7. Próxima intervenção proposta — não executada

1. Autorizar explicitamente a continuação sobre o banco `_2` **já criado e vazio**, sem recriar, limpar ou ignorar a verificação de existência.
2. Corrigir somente os grants errôneos das duas contas novas: remover o escopo incorreto exato e conceder o scope literal correto de `_2`, comprovando os caracteres registrados e o banco efetivo. Não alterar grants das contas antigas.
3. Revisar e decidir como tratar as permissões preexistentes de User vazio para `test` e `test\_%`. Preparar uma alteração administrativa específica e avaliar impacto sobre os demais usuários antes de revogá-las/limitá-las. Não apagar o banco test, não remover dados e não alterar essas linhas automaticamente nesta autorização.
4. Validar novamente a exclusividade efetiva das contas, incluindo bancos protegidos e outros schemas acessíveis, antes de usar a conta de migração. Avaliar reforço do preflight/guard em escopo de código autorizado, com regressões para privilégios indiretos/genéricos.
5. Somente após isolamento aprovado, aplicar exatamente as seis migrações existentes por migrate deploy e validar status, checksums, estruturas, dados vazios e preservação dos quatro bancos.
6. Entregar relatório e parar novamente. A execução dos 108 testes continuará exigindo autorização explícita separada; a decisão ADMIN MASTER permanece pendente e não foi alterada por este provisionamento.

**Parecer final: NÃO APTO para a segunda campanha. Provisionamento interrompido antes das migrações; aguardar autorização para corrigir permissões, mantendo todos os bancos e evidências existentes.**

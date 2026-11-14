# Fase 4C.7 — Campanha controlada de integração

Data: 2026-11-13. Branch `feature/kanban-refactor`, HEAD `12e3c9999412995c37e0654e120176398b4e9b5a`.

## Resultado e parecer

Executada **uma única campanha** pelo runner protegido, exclusivamente em `seaf_gestao_integration`, MariaDB **10.11.16-MariaDB**, **127.0.0.1:3306**, conta **seaf_it_run@127.0.0.1**. Saída do runner: **1**. Duração reportada pelo Node: **22,44 segundos**.

| Situação | Quantidade |
|---|---:|
| Cenários registrados na campanha | 108 |
| Cenários com corpo executado | 102 |
| Aprovados | 71 |
| Reprovados | 31 |
| Cancelados pelo erro de preparação do Kanban | 6 |
| Ignorados (skip) | 0 |
| Todo | 0 |

Os seis cancelados não foram executados nem aprovados. O total fecha em 71 + 31 + 6 = 108. Os erros agregadores das suítes não contam como cenários adicionais.

**Parecer: NÃO APTO para atualizar seaf_gestao_dev.** Há falhas de preparação dos testes, divergências contratuais de autorização e erro de implementação no detalhe de tarefas RUNNING_CLOCK. Nenhuma correção foi realizada e a campanha não foi repetida. Este parecer não autoriza migração, atualização ou escrita em desenvolvimento.

## Pré-execução e isolamento

- SELECT DATABASE(), CURRENT_USER(), VERSION() e @@port confirmaram integração, conta de execução e servidor corretos.
- O guard confirmou seis migrações concluídas, sem rollback, com checksums correspondentes aos seis arquivos locais, além dos grants limitados ao schema de integração.
- DATABASE_URL e TEST_DATABASE_URL idênticas, fornecidas exclusivamente ao processo filho do runner; RUN_DATABASE_INTEGRATION=1 restrito a esse processo e seus processos de teste. Nenhuma credencial foi exibida ou gravada em `.env`.
- Runner original `backend/scripts/run-integration.js`, com `--test-concurrency=1`. Não houve invocação direta das suítes. As corridas internas explícitas foram preservadas.
- SMTP desabilitado nas aplicações; testes de transporte usam simulação/injeção local. Workers e servidor com jobs automáticos não foram iniciados. Chamadas manuais de outbox/lembretes ocorreram somente nos testes sintéticos previstos.
- Contexto exclusivo força diretórios temporários de imagens/anexos. A suíte de imagens também usa diretório temporário próprio. Nenhum armazenamento privado existente foi utilizado.
- As 30 tabelas de aplicação estavam vazias no preflight; apenas `_prisma_migrations` continha seis entradas. Todos os registros criados pela campanha são sintéticos. Não se utilizaram dados do recovery, dumps ou a chave histórica de cifragem.
- Snapshots de contagens e hashes dos três bancos protegidos registrados antes da execução e comparados depois. A conexão administrativa foi usada somente para inspeção/snapshots, não para executar fixtures.

A captura usou um reporter local de observação do Node, carregado por NODE_OPTIONS no processo filho. Ele apenas serializa eventos, mensagens e erros em artefato privado; não altera testes, aplicação, hooks, concorrência ou resultado. Um marcador de tentativa única foi gravado antes de iniciar o runner.

Execução: início **2026-11-13T23:04:55.594Z**, término **2026-11-13T23:05:18.355Z**; aproximadamente 19:04:55 a 19:05:18 em America/Cuiaba.

## Resultados por suíte

| Arquivo em backend/test/integration | Aprovados | Reprovados | Cancelados | Ignorados |
|---|---:|---:|---:|---:|
| attachments.test.js | 0 | 7 | 0 | 0 |
| auth-authorization.test.js | 9 | 0 | 0 | 0 |
| auth-stabilization.test.js | 8 | 1 | 0 | 0 |
| kanban.test.js | 0 | 0 | 6 | 0 |
| mysql-integrity.test.js | 6 | 0 | 0 | 0 |
| phase4.test.js | 2 | 6 | 0 | 0 |
| phase5.test.js | 0 | 10 | 0 | 0 |
| phase6.test.js | 9 | 0 | 0 | 0 |
| phase7.test.js | 15 | 0 | 0 | 0 |
| phase8.test.js | 3 | 1 | 0 | 0 |
| phase9.test.js | 3 | 2 | 0 | 0 |
| running-clock.test.js | 7 | 4 | 0 | 0 |
| tasks.test.js | 9 | 0 | 0 | 0 |
| **Total** | **71** | **31** | **6** | **0** |

## Diagnóstico por causa

### F1 — Contrato de rota incorreto nos testes de anexos

**Classificação: teste, sete reprovações.** A suíte chama POST `/api/v1/attachments/staged`, mas `backend/src/routes/index.js:44` monta o router em `/task-uploads`. O contrato existente é POST `/api/v1/task-uploads/staged`; listagem, conteúdo e anexos de execução também ficam sob esse prefixo.

Mensagem original dominante: ROUTE_NOT_FOUND, HTTP **404 em vez de 201**. O teste de arquivo inválido recebe **404 em vez de 422**. Stack relevante: `stage`, `attachments.test.js:14`, seguido do cenário correspondente. Não é evidência de falha do serviço de staging; o endpoint correto não chegou a ser exercitado. Nenhum staged_upload ou task_attachment foi persistido.

### F2 — Factory histórica sem openedAt obrigatório

**Classificação: fixture, onze reprovações e seis cancelamentos.** `backend/testing/integration/fixtures.js:35` chama taskCycle.create sem openedAt, obrigatório no schema Prisma (`schema.prisma:307`). A factory genérica cycle também não define esse campo por padrão, embora não tenha sido a origem das reprovações observadas.

Mensagem original: **Argument `openedAt` is missing.** Stack relevante: `fixtures.js:35`, seguido de createMain (`phase5.test.js:36`), do caso legado (`running-clock.test.js:109`) ou do before (`kanban.test.js:34`).

As dez reprovações de phase5 e uma de running-clock ocorrem durante a preparação. No Kanban, o before falha antes dos seis cenários; a mensagem de cada cancelamento é **test did not finish before its parent and was cancelled**. Não se conclui falha funcional dos seis fluxos do Kanban ou dos dez fluxos de subtarefas/ciclos, pois não alcançaram seu objeto de validação. A transação da factory não deixou registros órfãos.

### F3 — Erro no detalhe de atribuições RUNNING_CLOCK aceitas

**Classificação principal: implementação; onze reprovações afetadas.** Foram registrados onze request_error de tipo TypeError/INTERNAL_SERVER_ERROR: seis em phase4, dois em phase9 e três em running-clock.

GET `/api/v1/tasks/:id` após aceite chama `calculateAssignmentMetrics` em `task.service.js:218`. Atribuições novas RUNNING_CLOCK são criadas sem calendarVersionId (`task.service.js:236`). O cálculo de métricas ainda encaminha o calendário nulo a `calculateWorkingMilliseconds` (`time-accounting.js:55`), que o desreferencia em `time-accounting.js:18`.

Nos três testes RUNNING_CLOCK, a asserção registra diretamente **500 !== 200**, com stack em `running-clock.test.js:11`. Em phase4/phase9, o teste tenta acessar body.data.task sem conferir o HTTP da consulta: registra **Cannot read properties of undefined (reading 'task')**, ocultando parcialmente o erro HTTP anterior. Isso é uma deficiência secundária de diagnóstico nos testes.

O vínculo ao cálculo sem calendário é sustentado pela análise estática e pelos TypeError/500 observados, além da reprodução em memória já registrada na Fase 4C.5. O backend deliberadamente não publica stack interno em seu log seguro; não foi instrumentado ou reexecutado para obter outro stack. O relatório não apresenta uma captura inexistente de stack interno do servidor.

Os cenários não homologam decisões de devolução/prorrogação nem conclusão com pedido pendente: foram interrompidos na leitura do detalhe. Parte das solicitações chegou a ser criada antes da falha; os fixtures foram preservados.

### F4 — Divergência do contrato de autorização do ADMIN MASTER

**Classificação: divergência teste/requisito/implementação, duas reprovações.** auth-stabilization.test.js:83 e phase8.test.js:45 esperam HTTP 403 gerencial para ADMIN MASTER e recebem HTTP **200**. O backend atual autoriza esse perfil; a decisão mais recente em IMPLEMENTATION-DECISIONS registra administração global permanente, enquanto documentos e testes anteriores o restringem.

Não foi alterado o RBAC nem substituído o esperado por 200 para obter aprovação. É necessário consolidar formalmente qual contrato prevalece e, somente depois, alinhar testes/documentos e eventualmente implementação sob nova autorização. No caso composto de auth-stabilization, a falha ocorre na primeira iteração ADMIN; as verificações posteriores desse caso não foram alcançadas.

Nenhuma falha de configuração de conexão, checksums ou permissões MariaDB impediu a campanha. A ausência de openedAt é validação da fixture pelo cliente Prisma, não Prisma P2022 ou migração ausente. Não houve P2022 registrado nos eventos capturados.

## Avaliação dos fluxos solicitados

### RUNNING_CLOCK e operações críticas

Sete casos da suíte específica passaram: criação com atribuição única e prazo de aceite persistido; rollback atômico quando anexo inicial não está disponível; rejeição de payload sem responsável/durações ou responsável inelegível; início do prazo de execução no aceite; reatribuição concorrente com CAS; replay idempotente sem duplicar; reabertura preservando o ciclo encerrado e sem reutilizar atribuição.

A suíte tasks teve nove aprovações: escopo de criação, justificativa administrativa, edição com CAS/auditoria, unicidade de atribuição concorrente, filtros/IDOR, aceite versus reatribuição, rejeição, conclusão versus cancelamento e replay de criação. Não equivale à homologação dos fluxos interrompidos pelo detalhe.

O teste de reabertura aprovado verifica preservação do ciclo anterior, novo número e estado PENDING sem atribuição. Ele não certifica uma nova execução completa. restartCycle continua omitindo deadlinePolicy e o default gera LEGACY_CALENDAR; a definição da política pós-reabertura permanece pendente. O teste de restauração em phase5 não ultrapassou a fixture.

### Anexos e imagens

Anexos genéricos/staging: **zero casos homologados**, sete reprovações por prefixo errado. Promoção, expiração, ownership, replay, download protegido e upload de execução precisam de nova campanha após autorização para corrigir os testes.

Imagens da Fase 6: **nove aprovações**, incluindo upload/download, subtarefa, assinatura/extensão/tamanho, onze uploads concorrentes limitados a dez ativos, IDOR, remoção lógica, acesso histórico, compensação de promoção e nomes manipulados. O request_error de tipo Error dessa suíte corresponde ao teste de falha de promoção, que passou; não se soma às onze falhas TypeError do detalhe.

### RBAC e segurança

Auth-authorization teve nove aprovações, cobrindo login/cookie, usuário inativo, IDOR entre equipes, bloqueio de criação de usuários por Gestor, refresh concorrente, logout, expiração, vínculo organizacional duplicado e reset de senha de uso único com revogação.

Auth-stabilization teve oito aprovações, incluindo login ADMIN por senha, revogação/refresh, ausência das rotas MFA, rate limit, reset com outbox cifrada/transporte local e falha/retry. A matriz gerencial completa não foi homologada, pelas duas divergências ADMIN e pelo Kanban cancelado.

Dashboard/relatórios tiveram três aprovações: acesso de Secretário/Gestor, isolamento de equipes/filtros/subtarefas e indicadores históricos. Phase9 aprovou três casos de entradas hostis, token adulterado/ausência de exposição e escopo/paginação; seus dois casos de conclusão com pedido pararam no detalhe.

### Concorrência e histórico

As seis verificações de integridade passaram: ciclo aberto único e atribuição atual única em duas conexões; solicitação ligada ao ciclo correto; proibição de subtarefa de subtarefa; períodos sobrepostos/auditoria; proteção contra exclusão física de histórico referenciado.

Passaram também corridas de refresh, reatribuição, aceite versus reatribuição, conclusão versus cancelamento, uploads de imagens e processamento manual de outbox. Casos de concorrência em phase4/phase5 permaneceram incompletos por falhas anteriores ao ponto de disputa; não são considerados homologados.

A compatibilidade LEGACY_CALENDAR é **parcial**: constraints/histórico, indicadores históricos e o fluxo de imagens em subtarefas passaram. A fixture explícita de calendário legado falhou por openedAt; os dez testes de ciclos/subtarefas não chegaram aos fluxos. Prorrogação legada e política de novos ciclos continuam pendentes. Nenhum registro histórico dos bancos protegidos foi usado para suprir essa lacuna.

## Integridade após a campanha

- Banco de integração mantido, sem limpeza posterior: **31 tabelas**, **seis migrações**, **120 índices**, **50 FKs**, **19 triggers**. Histórico Prisma e metadados estruturais idênticos ao preflight.
- **CHECK TABLE QUICK: OK nas 31 tabelas**.
- foreign_key_checks=1; inspeção das **50 constraints FK: zero registros órfãos**.
- Consulta de atribuições atuais: **zero ciclos com mais de uma atribuição atual**.
- Permaneceram 62 usuários, 18 equipes, 43 tarefas, 45 ciclos, 50 atribuições, 9 solicitações e 4 perfis sintéticos. Contagens completas por tabela estão no artefato post-validation.json.
- Permaneceram 16 metadados de imagens; staged_uploads e task_attachments estão vazias. Os diretórios temporários próprios foram removidos pelos teardowns existentes. Assim, ausência de órfãos **relacionais** não significa que arquivos temporários de fixtures permaneçam disponíveis após o encerramento da campanha.
- Erros esperados de constraints/imutabilidade foram exercitados pelos testes negativos aprovados. Não foi identificada corrupção física ou referencial. Não houve alteração de schema para contornar restrições.

## Bancos e arquivos protegidos

Contagens completas por tabela, hashes de dados/SHOW CREATE TABLE e hashes de metadados foram comparados antes/depois. Os três bancos ficaram **idênticos durante esta campanha**.

| Banco | Tabelas | Migrações | Usuários | Tarefas | Ciclos | SHA-256 agregado antes = depois |
|---|---:|---:|---:|---:|---:|---|
| seaf_gestao_dev | 28 | 3 | 1 | 0 | 0 | `cde4e8da7af9c3e869f7bce8608ec7d2d42483e7feea4959d0d65026330c07f8` |
| seaf_gestao_test | 29 | 5 | 817 | 1712 | 1806 | `cec6b96365694f197139beb954eb17ab4d8c8e18a827139e071ed9a9337f4807` |
| seaf_gestao_recovery | 31 | 6 | 817 | 1712 | 1806 | `f6cb2c92b2496efb9424cb37c28cc4ff72908783de6e4ab313340cc48714fcb0` |

O hash de dev já diferia do relatório 4C.6 no preflight desta fase, exclusivamente em valores de user_sessions, sem alteração da contagem. A origem dessa alteração entre fases não foi determinada; não é atribuída aos testes. A comparação de preservação 4C.7 usa o snapshot novo, realizado antes da campanha, e foi aprovada.

`.env` e bdseaf.sql permaneceram com seus hashes anteriores. Todos os arquivos de projeto existentes no início também permaneceram byte a byte idênticos até a pós-verificação. Nenhum código, teste, migração ou schema foi corrigido. Nenhum commit ou push foi realizado. Este relatório é o único novo documento de entrega da fase.

## Plano proposto — não executado

1. Autorizar correção da infraestrutura de testes: openedAt obrigatório nas factories, prefixo real /task-uploads nos casos de anexos e asserções explícitas de HTTP antes de acessar body.data.
2. Autorizar correção do cálculo de métricas por deadlinePolicy: tratar RUNNING_CLOCK conforme sua regra documentada e preservar LEGACY_CALENDAR. Acrescentar regressão que exercite detalhe após aceite e pausas, sem calendário artificial ou fallback que oculte o erro.
3. Consolidar formalmente a política ADMIN MASTER, alinhando os documentos conflitantes antes de alterar expectativas ou permissões.
4. Definir/documentar a política do ciclo reaberto/restaurado e verificar execução posterior, prorrogação e calendário legado. Não considerar o teste limitado de reabertura prova de todos esses comportamentos.
5. Executar as validações afetadas apenas após autorização para corrigir; planejar nova campanha explícita, com novos snapshots, conta restrita e fixtures próprias. O banco atual e seus resíduos sintéticos devem ser preservados até haver orientação específica; não executar reset, migração ou limpeza destrutiva.
6. Manter `seaf_gestao_dev` intacto até resolver os bloqueios e homologar os cenários faltantes. Aprovação dos testes de isolamento não é autorização para atualizar desenvolvimento.

## Evidências

Diretório local privado, ignorado pelo Git:

`.artifacts/integration-4c7-99a3576b-1501-456d-b34e-5f2a281b717f/`

Contém preflight.json, campaign-started.json, campaign-result.json, events.jsonl com mensagens/stacks originais, stderr.txt, protected-after.json e post-validation.json. O manifesto inicial inclui hashes dos arquivos de projeto e dos arquivos protegidos; não contém credenciais. As credenciais cifradas permanecem no artefato privado da Fase 4C.6, sem cópia para este relatório.

O anexo abaixo lista individualmente as 31 reprovações, os seis cancelamentos e a causa do hook, com mensagens originais e frames relevantes. Nenhum diagnóstico depende de uma reexecução da campanha.


## Anexo ? Registro individual das falhas

### C01 ? promove staging inicial, persiste checksum e entrega conteúdo protegido

- Suite: `attachments.test.js`; linha do caso: 27.
- Resultado: REPROVADO; causa: **F1**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
{"error":{"code":"ROUTE_NOT_FOUND","message":"Rota não encontrada.","details":{"method":"POST","path":"/api/v1/attachments/staged"}}}

404 !== 201
~~~

Stack relevante:

~~~text
    at stage (file:///C:/fluxo/backend/test/integration/attachments.test.js:14:12)
    at async TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/attachments.test.js:28:20)
~~~

### C02 ? nega acesso anônimo e IDOR de anexos e listagem fora da equipe

- Suite: `attachments.test.js`; linha do caso: 33.
- Resultado: REPROVADO; causa: **F1**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
{"error":{"code":"ROUTE_NOT_FOUND","message":"Rota não encontrada.","details":{"method":"POST","path":"/api/v1/attachments/staged"}}}

404 !== 201
~~~

Stack relevante:

~~~text
    at stage (file:///C:/fluxo/backend/test/integration/attachments.test.js:14:12)
    at async TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/attachments.test.js:34:20)
~~~

### C03 ? staging de outro usuário não pode ser reivindicado

- Suite: `attachments.test.js`; linha do caso: 40.
- Resultado: REPROVADO; causa: **F1**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
{"error":{"code":"ROUTE_NOT_FOUND","message":"Rota não encontrada.","details":{"method":"POST","path":"/api/v1/attachments/staged"}}}

404 !== 201
~~~

Stack relevante:

~~~text
    at stage (file:///C:/fluxo/backend/test/integration/attachments.test.js:14:12)
    at async TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/attachments.test.js:41:20)
~~~

### C04 ? staging expirado não pode ser reivindicado

- Suite: `attachments.test.js`; linha do caso: 44.
- Resultado: REPROVADO; causa: **F1**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
{"error":{"code":"ROUTE_NOT_FOUND","message":"Rota não encontrada.","details":{"method":"POST","path":"/api/v1/attachments/staged"}}}

404 !== 201
~~~

Stack relevante:

~~~text
    at stage (file:///C:/fluxo/backend/test/integration/attachments.test.js:14:12)
    at async TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/attachments.test.js:45:20)
~~~

### C05 ? replay não duplica anexos e staging utilizado não pode ser reutilizado

- Suite: `attachments.test.js`; linha do caso: 48.
- Resultado: REPROVADO; causa: **F1**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
{"error":{"code":"ROUTE_NOT_FOUND","message":"Rota não encontrada.","details":{"method":"POST","path":"/api/v1/attachments/staged"}}}

404 !== 201
~~~

Stack relevante:

~~~text
    at stage (file:///C:/fluxo/backend/test/integration/attachments.test.js:14:12)
    at async TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/attachments.test.js:49:20)
~~~

### C06 ? recusa conteúdo incompatível com extensão sem registrar staging

- Suite: `attachments.test.js`; linha do caso: 54.
- Resultado: REPROVADO; causa: **F1**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Expected values to be strictly equal:

404 !== 422
~~~

Stack relevante:

~~~text
    at TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/attachments.test.js:57:12)
~~~

### C07 ? anexo de execução exige aceite e versão atual, depois fica disponível

- Suite: `attachments.test.js`; linha do caso: 59.
- Resultado: REPROVADO; causa: **F1**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
{"error":{"code":"ROUTE_NOT_FOUND","message":"Rota não encontrada.","details":{"method":"POST","path":"/api/v1/attachments/staged"}}}

404 !== 201
~~~

Stack relevante:

~~~text
    at stage (file:///C:/fluxo/backend/test/integration/attachments.test.js:14:12)
    at async TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/attachments.test.js:60:122)
~~~

### C08 ? quatro perfis mantêm permissões, ADMIN sem acesso gerencial e Gestor sem IDOR entre equipes

- Suite: `auth-stabilization.test.js`; linha do caso: 79.
- Resultado: REPROVADO; causa: **F4**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Expected values to be strictly equal:

200 !== 403
~~~

Stack relevante:

~~~text
    at TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/auth-stabilization.test.js:83:62)
~~~

### C09 ? Secretário e Gestor consultam equipes no escopo e a coluna pessoal referencia a mesma tarefa

- Suite: `kanban.test.js`; linha do caso: 50.
- Resultado: CANCELADO; causa: **F2**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
test did not finish before its parent and was cancelled
~~~

Stack relevante:

~~~text
Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled
~~~

### C10 ? Técnico vê somente atribuições próprias e entregas; ADMIN pessoal não recebe tarefas gerenciais

- Suite: `kanban.test.js`; linha do caso: 61.
- Resultado: CANCELADO; causa: **F2**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
test did not finish before its parent and was cancelled
~~~

Stack relevante:

~~~text
Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled
~~~

### C11 ? busca, equipe, responsável, prioridade, status e prazo combinam sem substituir restrições

- Suite: `kanban.test.js`; linha do caso: 72.
- Resultado: CANCELADO; causa: **F2**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
test did not finish before its parent and was cancelled
~~~

Stack relevante:

~~~text
Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled
~~~

### C12 ? rejeição/reatribuição não permitem recuperar tarefa alheia por filtros ou IDOR

- Suite: `kanban.test.js`; linha do caso: 82.
- Resultado: CANCELADO; causa: **F2**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
test did not finish before its parent and was cancelled
~~~

Stack relevante:

~~~text
Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled
~~~

### C13 ? leituras repetidas não duplicam tarefas, ciclos nem auditoria

- Suite: `kanban.test.js`; linha do caso: 91.
- Resultado: CANCELADO; causa: **F2**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
test did not finish before its parent and was cancelled
~~~

Stack relevante:

~~~text
Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled
~~~

### C14 ? eventos reais de atribuição, aceite e rejeição podem produzir notificações idempotentes

- Suite: `kanban.test.js`; linha do caso: 98.
- Resultado: CANCELADO; causa: **F2**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
test did not finish before its parent and was cancelled
~~~

Stack relevante:

~~~text
Error [ERR_TEST_FAILURE]: test did not finish before its parent and was cancelled
~~~

### C15 ? nega devolução, encerra pausa e mantém a tarefa em andamento

- Suite: `phase4.test.js`; linha do caso: 10.
- Resultado: REPROVADO; causa: **F3**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Cannot read properties of undefined (reading 'task')
~~~

Stack relevante:

~~~text
    at TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/phase4.test.js:10:232)
~~~

### C16 ? aprova devolução e remove responsável e prazo

- Suite: `phase4.test.js`; linha do caso: 11.
- Resultado: REPROVADO; causa: **F3**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Cannot read properties of undefined (reading 'task')
~~~

Stack relevante:

~~~text
    at TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/phase4.test.js:11:186)
~~~

### C17 ? nega prorrogação sem alterar o prazo

- Suite: `phase4.test.js`; linha do caso: 12.
- Resultado: REPROVADO; causa: **F3**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Cannot read properties of undefined (reading 'task')
~~~

Stack relevante:

~~~text
    at TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/phase4.test.js:12:283)
~~~

### C18 ? aprova prorrogação e registra o prazo anterior

- Suite: `phase4.test.js`; linha do caso: 13.
- Resultado: REPROVADO; causa: **F3**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Cannot read properties of undefined (reading 'task')
~~~

Stack relevante:

~~~text
    at TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/phase4.test.js:13:277)
~~~

### C19 ? serializa solicitações simultâneas e bloqueia decisão fora da equipe

- Suite: `phase4.test.js`; linha do caso: 14.
- Resultado: REPROVADO; causa: **F3**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Cannot read properties of undefined (reading 'task')
~~~

Stack relevante:

~~~text
    at TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/phase4.test.js:14:540)
~~~

### C20 ? reatribuição encerra solicitação pendente de forma auditável

- Suite: `phase4.test.js`; linha do caso: 15.
- Resultado: REPROVADO; causa: **F3**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Cannot read properties of undefined (reading 'task')
~~~

Stack relevante:

~~~text
    at TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/phase4.test.js:15:306)
~~~

### C21 ? cria subtarefa atribuída e reutiliza aceite e conclusão

- Suite: `phase5.test.js`; linha do caso: 81.
- Resultado: REPROVADO; causa: **F2**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Invalid `prisma.taskCycle.create()` invocation:

{
  data: {
    id: "73e0a240-e247-4107-919c-6c1ebd738014",
    taskId: "e2b47523-7c7b-40bf-86ae-8366e2c91508",
    cycleNumber: 1,
    title: "Histórico 02bebf36-a6a2-4d06-94d6-269e043d3fe9",
    description: "Fixture histórica sintética LEGACY_CALENDAR",
    priority: "HIGH",
    deadlinePolicy: "LEGACY_CALENDAR",
    deadlineAt: new Date("2026-11-17T23:05:07.805Z"),
+   openedAt: DateTime
  }
}

Argument `openedAt` is missing.
~~~

Stack relevante:

~~~text
    at async file:///C:/fluxo/backend/testing/integration/fixtures.js:35:23
    at async createMain (file:///C:/fluxo/backend/test/integration/phase5.test.js:36:16)
    at async TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/phase5.test.js:82:20)
~~~

### C22 ? bloqueia subtarefa de segundo nível

- Suite: `phase5.test.js`; linha do caso: 96.
- Resultado: REPROVADO; causa: **F2**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Invalid `prisma.taskCycle.create()` invocation:

{
  data: {
    id: "eb42fcbf-ed2c-4958-8ede-fa21230c8e9a",
    taskId: "28d137fd-ace1-4844-9ba7-75954b522c26",
    cycleNumber: 1,
    title: "Histórico c1920595-0f17-4df1-9bf6-c2ccf2a6ccbe",
    description: "Fixture histórica sintética LEGACY_CALENDAR",
    priority: "HIGH",
    deadlinePolicy: "LEGACY_CALENDAR",
    deadlineAt: new Date("2026-11-17T23:05:07.812Z"),
+   openedAt: DateTime
  }
}

Argument `openedAt` is missing.
~~~

Stack relevante:

~~~text
    at async file:///C:/fluxo/backend/testing/integration/fixtures.js:35:23
    at async createMain (file:///C:/fluxo/backend/test/integration/phase5.test.js:36:16)
    at async TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/phase5.test.js:97:20)
~~~

### C23 ? bloqueia conclusão da principal enquanto há subtarefa ativa

- Suite: `phase5.test.js`; linha do caso: 107.
- Resultado: REPROVADO; causa: **F2**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Invalid `prisma.taskCycle.create()` invocation:

{
  data: {
    id: "e54eada7-e405-4813-acd2-fdfcc488f79c",
    taskId: "20792c17-f2e8-4ddd-98d9-780a190e9f03",
    cycleNumber: 1,
    title: "Histórico d8a69b25-6b19-49d8-870f-8fd5fcd98f5a",
    description: "Fixture histórica sintética LEGACY_CALENDAR",
    priority: "HIGH",
    deadlinePolicy: "LEGACY_CALENDAR",
    deadlineAt: new Date("2026-11-17T23:05:07.815Z"),
+   openedAt: DateTime
  }
}

Argument `openedAt` is missing.
~~~

Stack relevante:

~~~text
    at async file:///C:/fluxo/backend/testing/integration/fixtures.js:35:23
    at async createMain (file:///C:/fluxo/backend/test/integration/phase5.test.js:36:16)
    at async TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/phase5.test.js:108:18)
~~~

### C24 ? mantém consistência no cancelamento simultâneo da principal e subtarefa

- Suite: `phase5.test.js`; linha do caso: 118.
- Resultado: REPROVADO; causa: **F2**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Invalid `prisma.taskCycle.create()` invocation:

{
  data: {
    id: "d4446d71-88e6-4c0e-8da9-8a9957e5a645",
    taskId: "d895d218-329d-49d3-ae8b-70d91efcf292",
    cycleNumber: 1,
    title: "Histórico 2c3eb397-26c1-43f6-bb59-4473632eabb9",
    description: "Fixture histórica sintética LEGACY_CALENDAR",
    priority: "HIGH",
    deadlinePolicy: "LEGACY_CALENDAR",
    deadlineAt: new Date("2026-11-17T23:05:07.818Z"),
+   openedAt: DateTime
  }
}

Argument `openedAt` is missing.
~~~

Stack relevante:

~~~text
    at async file:///C:/fluxo/backend/testing/integration/fixtures.js:35:23
    at async createMain (file:///C:/fluxo/backend/test/integration/phase5.test.js:36:16)
    at async TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/phase5.test.js:119:18)
~~~

### C25 ? serializa reabertura, cria um único ciclo e preserva o anterior

- Suite: `phase5.test.js`; linha do caso: 131.
- Resultado: REPROVADO; causa: **F2**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Invalid `prisma.taskCycle.create()` invocation:

{
  data: {
    id: "10f0fce1-a6dd-437a-858e-24fcbb1a4dff",
    taskId: "90c8486d-b7de-4913-9767-f13c15db0428",
    cycleNumber: 1,
    title: "Histórico 01839f5a-2832-47ee-876c-78e9f3744d61",
    description: "Fixture histórica sintética LEGACY_CALENDAR",
    priority: "HIGH",
    deadlinePolicy: "LEGACY_CALENDAR",
    deadlineAt: new Date("2026-11-17T23:05:07.821Z"),
+   openedAt: DateTime
  }
}

Argument `openedAt` is missing.
~~~

Stack relevante:

~~~text
    at async file:///C:/fluxo/backend/testing/integration/fixtures.js:35:23
    at async createMain (file:///C:/fluxo/backend/test/integration/phase5.test.js:36:16)
    at async TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/phase5.test.js:132:16)
~~~

### C26 ? restaura tarefa cancelada sem reutilizar atribuição

- Suite: `phase5.test.js`; linha do caso: 150.
- Resultado: REPROVADO; causa: **F2**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Invalid `prisma.taskCycle.create()` invocation:

{
  data: {
    id: "0ee451bb-6c1f-4e1b-aa01-75f0122ae102",
    taskId: "cc756e99-542f-4d74-a8fa-6cb87b4a60ee",
    cycleNumber: 1,
    title: "Histórico 62de4422-9967-4a9a-bf66-410b4bfdf90e",
    description: "Fixture histórica sintética LEGACY_CALENDAR",
    priority: "HIGH",
    deadlinePolicy: "LEGACY_CALENDAR",
    deadlineAt: new Date("2026-11-17T23:05:07.824Z"),
+   openedAt: DateTime
  }
}

Argument `openedAt` is missing.
~~~

Stack relevante:

~~~text
    at async file:///C:/fluxo/backend/testing/integration/fixtures.js:35:23
    at async createMain (file:///C:/fluxo/backend/test/integration/phase5.test.js:36:16)
    at async TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/phase5.test.js:151:16)
~~~

### C27 ? não reabre automaticamente subtarefas do ciclo anterior

- Suite: `phase5.test.js`; linha do caso: 162.
- Resultado: REPROVADO; causa: **F2**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Invalid `prisma.taskCycle.create()` invocation:

{
  data: {
    id: "cf47546c-db23-43bb-9c79-16cbdeefdc28",
    taskId: "d72162c5-099e-45d3-8ce5-1a6c809a1570",
    cycleNumber: 1,
    title: "Histórico 5a5425cd-99d4-4cc7-873f-d36cba903e0b",
    description: "Fixture histórica sintética LEGACY_CALENDAR",
    priority: "HIGH",
    deadlinePolicy: "LEGACY_CALENDAR",
    deadlineAt: new Date("2026-11-17T23:05:07.826Z"),
+   openedAt: DateTime
  }
}

Argument `openedAt` is missing.
~~~

Stack relevante:

~~~text
    at async file:///C:/fluxo/backend/testing/integration/fixtures.js:35:23
    at async createMain (file:///C:/fluxo/backend/test/integration/phase5.test.js:36:16)
    at async TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/phase5.test.js:163:18)
~~~

### C28 ? isola subtarefas entre equipes e bloqueia manipulação de IDs

- Suite: `phase5.test.js`; linha do caso: 178.
- Resultado: REPROVADO; causa: **F2**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Invalid `prisma.taskCycle.create()` invocation:

{
  data: {
    id: "330593d2-beb7-4b73-b526-60179c1e06b4",
    taskId: "990be38c-f7dc-4305-a0f1-4c59eab3f06f",
    cycleNumber: 1,
    title: "Histórico ccb8edda-bcec-4e42-b9cf-a1159d0f5e15",
    description: "Fixture histórica sintética LEGACY_CALENDAR",
    priority: "HIGH",
    deadlinePolicy: "LEGACY_CALENDAR",
    deadlineAt: new Date("2026-11-17T23:05:07.830Z"),
+   openedAt: DateTime
  }
}

Argument `openedAt` is missing.
~~~

Stack relevante:

~~~text
    at async file:///C:/fluxo/backend/testing/integration/fixtures.js:35:23
    at async createMain (file:///C:/fluxo/backend/test/integration/phase5.test.js:36:16)
    at async TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/phase5.test.js:179:20)
~~~

### C29 ? reutiliza devolução e prorrogação na subtarefa

- Suite: `phase5.test.js`; linha do caso: 190.
- Resultado: REPROVADO; causa: **F2**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Invalid `prisma.taskCycle.create()` invocation:

{
  data: {
    id: "2b05fe27-00ae-4a13-b7f3-dc1b2719a65a",
    taskId: "36aebf85-bc06-4611-b7d9-c7e099336e11",
    cycleNumber: 1,
    title: "Histórico 04d96a5d-77a0-4c3a-b98a-459b7ffd53db",
    description: "Fixture histórica sintética LEGACY_CALENDAR",
    priority: "HIGH",
    deadlinePolicy: "LEGACY_CALENDAR",
    deadlineAt: new Date("2026-11-17T23:05:07.832Z"),
+   openedAt: DateTime
  }
}

Argument `openedAt` is missing.
~~~

Stack relevante:

~~~text
    at async file:///C:/fluxo/backend/testing/integration/fixtures.js:35:23
    at async createMain (file:///C:/fluxo/backend/test/integration/phase5.test.js:36:16)
    at async TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/phase5.test.js:191:20)
~~~

### C30 ? mantém criação de subtarefa idempotente

- Suite: `phase5.test.js`; linha do caso: 211.
- Resultado: REPROVADO; causa: **F2**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Invalid `prisma.taskCycle.create()` invocation:

{
  data: {
    id: "2eb03839-f89b-4ba8-aaa3-492d2640d72d",
    taskId: "ecaea477-97b2-48c8-b60c-d4cd749d27e5",
    cycleNumber: 1,
    title: "Histórico 429b9737-9088-49b6-8e1f-2a0b06a851b2",
    description: "Fixture histórica sintética LEGACY_CALENDAR",
    priority: "HIGH",
    deadlinePolicy: "LEGACY_CALENDAR",
    deadlineAt: new Date("2026-11-17T23:05:07.835Z"),
+   openedAt: DateTime
  }
}

Argument `openedAt` is missing.
~~~

Stack relevante:

~~~text
    at async file:///C:/fluxo/backend/testing/integration/fixtures.js:35:23
    at async createMain (file:///C:/fluxo/backend/test/integration/phase5.test.js:36:16)
    at async TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/phase5.test.js:212:20)
~~~

### C31 ? bloqueia Técnico e ADMIN MASTER inclusive no acesso direto

- Suite: `phase8.test.js`; linha do caso: 40.
- Resultado: REPROVADO; causa: **F4**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Expected values to be strictly equal:

200 !== 403
~~~

Stack relevante:

~~~text
    at TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/phase8.test.js:45:16)
~~~

### C32 ? conclusão com EXTENSION pendente respeita o SDD e preserva atomicidade

- Suite: `phase9.test.js`; linha do caso: 46.
- Resultado: REPROVADO; causa: **F3**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Cannot read properties of undefined (reading 'task')
~~~

Stack relevante:

~~~text
    at TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/phase9.test.js:54:70)
~~~

### C33 ? conclusão com RETURN pendente respeita o SDD e preserva atomicidade

- Suite: `phase9.test.js`; linha do caso: 46.
- Resultado: REPROVADO; causa: **F3**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Cannot read properties of undefined (reading 'task')
~~~

Stack relevante:

~~~text
    at TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/phase9.test.js:54:70)
~~~

### C34 ? devolução aprovada encerra pausa, conserva tempo e permite nova atribuição

- Suite: `running-clock.test.js`; linha do caso: 59.
- Resultado: REPROVADO; causa: **F3**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Expected values to be strictly equal:

500 !== 200
~~~

Stack relevante:

~~~text
    at detail (file:///C:/fluxo/backend/test/integration/running-clock.test.js:11:97)
    at async TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/running-clock.test.js:63:21)
~~~

### C35 ? devolução negada retoma execução sem encerrar atribuição

- Suite: `running-clock.test.js`; linha do caso: 72.
- Resultado: REPROVADO; causa: **F3**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Expected values to be strictly equal:

500 !== 200
~~~

Stack relevante:

~~~text
    at detail (file:///C:/fluxo/backend/test/integration/running-clock.test.js:11:97)
    at async TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/running-clock.test.js:73:107)
~~~

### C36 ? prorrogação aprovada persiste novo prazo e registra prazo anterior

- Suite: `running-clock.test.js`; linha do caso: 78.
- Resultado: REPROVADO; causa: **F3**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Expected values to be strictly equal:

500 !== 200
~~~

Stack relevante:

~~~text
    at detail (file:///C:/fluxo/backend/test/integration/running-clock.test.js:11:97)
    at async TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/running-clock.test.js:80:101)
~~~

### C37 ? fixture LEGACY_CALENDAR preserva prazo absoluto e calendário histórico

- Suite: `running-clock.test.js`; linha do caso: 107.
- Resultado: REPROVADO; causa: **F2**. Endpoint/servico: conforme diagnostico dessa causa acima.

Mensagem original:

~~~text
Invalid `prisma.taskCycle.create()` invocation:

{
  data: {
    id: "364220df-b902-48f5-8e16-3c7c3cb17227",
    taskId: "d90e2ac8-60c8-4579-afa3-c22fe5dc8b51",
    cycleNumber: 1,
    title: "IT-eb8efc60-342f-441f-8af1-e9882ca2504e-Legado",
    description: "Fixture histórica sintética LEGACY_CALENDAR",
    priority: "NORMAL",
    deadlinePolicy: "LEGACY_CALENDAR",
    deadlineAt: new Date("2026-11-14T23:05:16.723Z"),
+   openedAt: DateTime
  }
}

Argument `openedAt` is missing.
~~~

Stack relevante:

~~~text
    at async file:///C:/fluxo/backend/testing/integration/fixtures.js:35:23
    at async TestContext.<anonymous> (file:///C:/fluxo/backend/test/integration/running-clock.test.js:109:18)
~~~

### Hook da suite Kanban ? F2

Erro de preparacao que cancelou os seis casos, sem contar como caso adicional.

~~~text
Invalid `prisma.taskCycle.create()` invocation:

{
  data: {
    id: "1a53717b-f1ec-4be3-9594-530ed4739827",
    taskId: "a7d694d4-ef22-40f6-92d3-42ee63b8c971",
    cycleNumber: 1,
    title: "Pendente 75e581b4-4632-4156-85e5-0977c2923856",
    description: "Fixture histórica sintética LEGACY_CALENDAR",
    priority: "NORMAL",
    deadlinePolicy: "LEGACY_CALENDAR",
    deadlineAt: null,
+   openedAt: DateTime
  }
}

Argument `openedAt` is missing.
    at async file:///C:/fluxo/backend/testing/integration/fixtures.js:35:23
    at async SuiteContext.<anonymous> (file:///C:/fluxo/backend/test/integration/kanban.test.js:34:21)
~~~

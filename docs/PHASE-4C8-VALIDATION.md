# Fase 4C.8 — Correções controladas após integração

Data: 2026-11-14. Branch `feature/kanban-refactor`. Base: `1013cc623d459453f575c03c1311e9d1d07ac085`.

## Resultado e limites

Corrigidas as causas técnicas de prefixo dos testes de anexos, openedAt ausente nas factories e cálculo de métricas RUNNING_CLOCK sem calendário no detalhe. Adicionados **19 testes de regressão sem banco**. As duas divergências de ADMIN MASTER permanecem pendentes; nenhuma permissão ou expectativa de RBAC foi alterada.

**132 testes backend e 13 frontend aprovados.** Os 36 testes do guard estão incluídos nos 132. Lint, typecheck, build, Prisma Validate e git diff --check aprovados.

**Não houve nova campanha de integração**, nem execução individual com escrita, consulta a banco real, migração, seed, limpeza, alteração de `.env`, commit ou push. Os resultados 71/31/6 da Fase 4C.7 continuam sendo os últimos resultados MariaDB. Nenhum dos 108 cenários foi reclassificado como aprovado com base nestas validações.

## 1. Anexos: contrato confirmado e correção dos testes

Causa confirmada: os testes usavam `/api/v1/attachments`, mas o router é montado em `/api/v1/task-uploads` (`backend/src/routes/index.js`), como já utilizado pelo frontend em TaskFormPage e TaskDetailPage.

Corrigidas somente as chamadas de `backend/test/integration/attachments.test.js`:

- POST `/api/v1/task-uploads/staged`.
- GET `/api/v1/task-uploads/tasks/:id`.
- GET `/api/v1/task-uploads/:id/content`.
- POST `/api/v1/task-uploads/tasks/:id/attachments`.

Nenhuma rota de produção, autenticação, autorização, validação de arquivo ou configuração de armazenamento foi alterada. Não se criou alias para o prefixo errado. Os novos testes HTTP sem banco verificam o prefixo correto e o bloqueio 401 antes de receber arquivo/consultar dados; o prefixo errado continua retornando 404. Isso não equivale à homologação de upload/download com persistência.

## 2. Fixtures históricas: openedAt e cronologia

Causa confirmada: openedAt é DateTime obrigatório, sem default, no schema TaskCycle. A factory legacyTask e a factory genérica cycle omitiam esse valor. Nenhuma alteração de schema/constraint foi necessária.

Foi introduzido o builder puro `cycleFixtureData`, compartilhado pelas duas factories e pelos testes sem banco. Ele fornece UUID, taskId, cycleNumber, estado PENDING, política LEGACY_CALENDAR e openedAt explícito; aceita datas históricas fornecidas pelo cenário e normaliza instantes válidos. Rejeita abertura ausente/inválida, encerramento anterior à abertura e incompatibilidade entre status terminal e closedAt.

legacyTask usa o mesmo instante para createdAt da tarefa e openedAt do ciclo. A criação da tarefa, criação do ciclo e atualização de currentCycleId continuam na mesma transação e continuam exigindo cliente validado pelo guard. parentCycleId permanece preservado. A factory genérica continua aceitando taskId/cycleNumber explícitos para cenários anteriores/atuais, sem copiar atribuições, solicitações ou decidir novas regras de reabertura.

Os testes comprovam o campo obrigatório no contrato Prisma, a consistência das datas, a identidade comum entre ciclos de uma tarefa, UUIDs distintos e o guard inalterado. Não houve criação dessas fixtures em MariaDB nesta fase.

## 3. RUNNING_CLOCK: causa reproduzida e correção da implementação

Antes da correção, oito regressões sem banco foram executadas: **seis falharam e duas passaram**. As falhas reproduziram `Cannot read properties of null (reading 'calendar')` em calculateWorkingMilliseconds e o comportamento incorreto com datas ISO. Após a correção, as oito passaram, assim como os quatro testes anteriores de expediente.

O serviço de detalhe calculava métricas de todas as atribuições pelo caminho de calendário, sem considerar deadlinePolicy. Atribuições novas RUNNING_CLOCK não possuem calendarVersionId por definição do contrato; a ausência não é motivo para criar ou escolher calendário.

Correção:

- calculateAssignmentMetrics recebe a política explicitamente. O padrão legado da assinatura anterior é preservado para consumidores existentes; política desconhecida não recebe fallback silencioso.
- O detalhe passa **a política de cada ciclo**, inclusive dos ciclos históricos, e um instante de observação comum à resposta. A política do ciclo atual não é aplicada retroativamente aos ciclos anteriores.
- RUNNING_CLOCK contabiliza espera até aceite/encerramento e responsabilidade corrida desde o aceite até endedAt ou instante da consulta. Tempo efetivo é responsabilidade menos pausas. Pausas abertas congelam o tempo efetivo até a consulta/encerramento; intervalos são intersectados com a responsabilidade e unidos para não descontar sobreposição duas vezes.
- Datas Date/ISO com offset são tratadas como instantes reais. Datas inválidas e intervalos de pausa fechados invertidos geram erro explícito, sem NaN convertido em null ou tempos fictícios.
- LEGACY_CALENDAR continua usando exatamente a função anterior de expediente, timezone IANA, horários, exceções e versão histórica. Não se infere RUNNING_CLOCK só porque um registro legado está sem calendário; registros legados inconsistentes continuam exigindo diagnóstico.

Nenhum prazo é recalculado ou persistido por essa leitura. Campos e nomes das métricas na resposta foram preservados. As funções de cálculo de prazo de aceite/execução e os fluxos de atribuição, aceite, rejeição, pedidos e decisões não foram alterados; seus testes existentes sem banco foram executados. Não foi criado calendário padrão nem alterado o comportamento das mutações para obter aprovação.

Testes do serviço com Prisma simulado cobrem HTTP 200 e serialização de detalhe aceito sem calendário e com pausa aberta; histórico misto com métricas corretas por ciclo; imutabilidade de dados/prazos; manutenção do escopo do Gestor; erro explícito para legado sem versão. Nenhuma conexão real é criada por esses doubles.

Referências contratuais: RUNNING-CLOCK-IMPLEMENTATION-PLAN.md (ciclos novos sem calendário, tempo corrido e preservação do legado), SDD 02 (pausa/retomada e exclusão do intervalo pausado), IMPLEMENTATION-DECISIONS.md (espera, responsabilidade e calendário histórico). Esta correção separa o cálculo conforme a política já existente; não define nova política de prazo ou reabertura.

## 4. ADMIN MASTER: ambiguidade preservada

Evidências conflitantes:

| Fonte | Política registrada |
|---|---|
| SDD 07, SDD 02 e decisões anteriores de navegação/Fase 8 | Escopo autorizado/excepcional, restrições gerenciais e quadro pessoal |
| Último registro de 2026-11-13 em IMPLEMENTATION-DECISIONS | Administração global permanente, incluindo Kanban/dashboard/relatórios |
| Backend atual | Inclui ADMIN MASTER nas rotas gerenciais |
| auth-stabilization.test.js e phase8.test.js | Esperam 403 para acesso gerencial do ADMIN MASTER |

A divergência não foi resolvida escolhendo uma política por conveniência. **RBAC, justificativas, filtros organizacionais, testes de 403 e ausência de privilégios novos permanecem como estavam.** Não se adicionou skip nem se substituiu 403 por 200. É necessária confirmação/consolidação do contrato aplicável para decidir se o ajuste será apenas documental/de testes ou também de implementação.

O Kanban antes cancelado contém outra expectativa semelhante; ao ultrapassar a fixture, poderá expor a mesma divergência. As duas falhas originalmente observadas não são consideradas corrigidas nesta fase.

## 5. Testes adicionados e validações

| Novo arquivo em backend/test | Casos | Cobertura |
|---|---:|---|
| attachments/attachment-routing.test.js | 3 | Prefixo real, autenticação antes de I/O, prevenção da rota errada nos testes |
| persistence/integration-fixtures.test.js | 4 | Contrato obrigatório, cronologia/identidade de ciclos, dados inválidos, guard |
| time-accounting/running-clock-metrics.test.js | 8 | Sem calendário, pausas fechadas/abertas, encerramento, interseção/união, espera, ISO, dados inválidos e legado estrito |
| tasks/task-detail-metrics.test.js | 4 | Detalhe HTTP/serialização, histórico misto, prazos imutáveis, legado e escopo |
| **Total novo** | **19** | **Sem banco real** |

Comandos e resultados finais:

| Validação | Resultado |
|---|---|
| `npm.cmd test` — backend | **132 aprovados, 0 falhas, 0 cancelados** |
| Guard incluído nesse total | **36 aprovados**, sem conexão real |
| `npm.cmd test` — frontend | **13 aprovados**, seis arquivos |
| `npm.cmd run lint` | 0 erros; um aviso preexistente de Fast Refresh em AuthContext.tsx |
| `npm.cmd run typecheck --workspace frontend` | Aprovado |
| `npm.cmd run build` | Aprovado; principal 465,72 kB, gzip 142,26 kB |
| `npm.cmd run prisma:validate` | Schema válido, sem migração |
| `git diff --check` | Aprovado |
| Integração MariaDB / testes individuais com escrita | **Não executados** |

Nas validações de testes, RUN_DATABASE_INTEGRATION=0 e MAIL_ENABLED=0 foram explícitos. DATABASE_URL e TEST_DATABASE_URL do processo apontaram para um destino fictício na porta 1, sem aproveitar credenciais locais. As 13 suítes de integração foram sinalizadas SKIP no comando geral; seus 108 cenários não entram nos 132 aprovados. O resumo Node conta os testes unitários, não os cenários não iniciados das suítes puladas.

Os testes existentes do guard invocam arquivos em subprocessos apenas com URL deliberadamente recusada antes de abrir cliente/preparar fixtures, ou usam conexões simuladas. Isso não é uma campanha real nem executa corpos de testes com escrita. A nova verificação HTTP de detalhe usa Supertest e Prisma simulado, com sessão/JWT sintéticos em memória.

Um teste novo inicialmente assumiu metadados isRequired/hasDefaultValue no DMMF reduzido do Prisma 7; foi corrigido para conferir o contrato diretamente no schema local, sem alterar o schema. Não foi necessário instalar dependências ou atualizar Prisma. O aviso do CLI sobre uma versão major candidata não foi aplicado.

## 6. Impacto esperado e riscos restantes

| Grupo da Fase 4C.7 | Tratamento nesta fase | Limite da evidência |
|---|---|---|
| 7 falhas de anexos | Prefixos dos testes corrigidos | Upload, staging e listagem persistida ainda dependem de campanha autorizada |
| 11 falhas + 6 cancelamentos de fixture | openedAt/cronologia corrigidos nas duas factories | Desbloquear preparação pode revelar outras falhas do fluxo antes inalcançado |
| 11 falhas de métricas | Cálculo por política corrigido e detalhe reproduzido com mocks/HTTP | Pedidos, locks e persistência reais ainda não foram reexecutados |
| 2 falhas ADMIN MASTER | Não corrigidas por ambiguidade | Esperadas enquanto contrato e expectativas continuarem conflitantes |

**Não se projeta 106 aprovações nem se afirma que 29 falhas e seis cancelamentos já passaram em MariaDB.** Foram corrigidas suas causas observadas; somente outra campanha poderá quantificar o resultado, inclusive novos erros.

Pontos adicionais encontrados por análise estática, fora das correções específicas realizadas:

1. A listagem de anexos devolve registros Prisma com sizeBytes BigInt diretamente ao res.json. Pode revelar erro de serialização e exposição desnecessária de campos internos depois de corrigido o prefixo. Não se executou listagem com banco para confirmar nesta fase e não se alterou o serviço de arquivos além dos testes de chamada.
2. O fluxo atual de assign não vincula calendarVersionId mesmo quando o ciclo é LEGACY_CALENDAR. Depois de abertas as fixtures, uma atribuição legada aceita sem versão poderá continuar inválida para métricas de expediente. Não foi criado calendário artificial nem alterado assign para esconder essa lacuna; é necessária revisão específica do contrato legado.
3. restartCycle omite deadlinePolicy e o default gera LEGACY_CALENDAR. A política de execução depois da reabertura/restauração permanece pendente, sem mudança nesta fase.
4. O dashboard mede somente atribuições com calendário e ainda tem caminhos baseados no prazo legado. Esta correção do detalhe não homologa indicadores RUNNING_CLOCK nem modifica fórmulas gerenciais.
5. O plano de prazos menciona soma da pausa ao prazo quando decidida; a implementação existente faz esse deslocamento na aprovação, não na negativa. Não foi alterado o prazo silenciosamente. A política de decisões e os cenários reais precisam ser consolidados/validados.

Esses pontos não são falhas adicionais de uma campanha executada nesta fase; são riscos identificados em leitura do código. Qualquer correção adicional deve respeitar o escopo aprovado e preservar os registros existentes.

## 7. Arquivos modificados

- `backend/src/modules/time-accounting/time-accounting.js`.
- `backend/src/modules/tasks/task.service.js`.
- `backend/testing/integration/fixtures.js`.
- `backend/test/integration/attachments.test.js`.
- Os quatro novos arquivos de regressão listados acima.
- `docs/IMPLEMENTATION-DECISIONS.md`, `docs/CONTINUAR_EM_OUTRO_COMPUTADOR.md` e este relatório.

Sem alteração em schema Prisma, SQL de migrações, frontend, dependências, RBAC ou contratos de endpoints de produção. Relatórios anteriores preservados.

`.env` e bdseaf.sql permanecem com seus hashes anteriores, conferidos antes/depois:

- `.env`: `a26660a0f9cbd8606ea7c91b9bc1a000c603910337ab7986bdc7f72bf48f0f52`.
- `bdseaf.sql`: `26b28e46a9811fddbbb206a5a92395a27f48a704cef0acf63b8995bf217bed86`.

Não se apresenta novo hash SQL de bancos: não houve acesso a MariaDB nesta fase. A preservação decorre da ausência de operações contra eles pelos comandos executados, não de uma comparação SQL inexistente.

## 8. Plano para segunda campanha — aguardando autorização

1. Revisar as correções e decidir a política ADMIN MASTER; revisar separadamente os riscos estáticos de anexos/legado/reabertura antes de ampliar o escopo de correção. Não atualizar dev por causa dos testes unitários aprovados.
2. Mediante autorização explícita para a campanha, conferir seaf_gestao_integration, conta seaf_it_run, host/porta, seis migrações/checksums e grants restritos. Registrar novos snapshots de dev/test/recovery e confirmar `.env`/dump preservados.
3. Preservar os resíduos sintéticos da primeira campanha. Não limpar ou recriar bancos automaticamente. Rever o isolamento por UUID dos testes e apontar previamente eventual conflito; não importar recovery.
4. Executar uma única campanha pelo runner, sequencial entre suítes, com concorrência interna, armazenamento temporário e serviços externos desabilitados. Nenhuma repetição automática.
5. Registrar resultados novos e falhas completas, comparar hashes dos bancos protegidos e verificar FKs/órfãos/atribuições atuais. Manter classificação de desenvolvimento/produção pendente até a homologação real.

**Prontidão: correções técnicas validadas sem banco; integração e atualização de seaf_gestao_dev NÃO HOMOLOGADAS.** Aguardar autorização explícita antes de executar integração com escrita, fazer commit ou push.

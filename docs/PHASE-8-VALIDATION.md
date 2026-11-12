# Fase 8 — Validação de dashboard e relatórios

Data: 2026-11-12

## Escopo homologado

- Endpoints protegidos: `GET /api/v1/dashboard` e `GET /api/v1/reports`.
- Apenas `SECRETARY` e `MANAGER` possuem acesso. `TECHNICIAN` e `ADMIN_MASTER` recebem `403`, inclusive por acesso direto à API.
- Situação atual conta apenas tarefas principais pelo ciclo atual. Subtarefas permanecem linhas próprias no relatório e não são agregadas à principal.
- Histórico conta ciclos: criação por `openedAt`; conclusão e cancelamento por `closedAt`.
- Não houve migração: os indicadores consultam modelos persistidos nas fases anteriores.

## Verificações executadas

Os resultados desta tabela pertencem à homologação anterior, registrada no commit `7eec311`. A revisão adicional está registrada abaixo e não herda a aprovação MariaDB anterior.

| Verificação | Resultado |
| --- | --- |
| `npm.cmd run check` | Aprovado: ESLint, 27 testes backend, 6 testes frontend, build e Prisma Validate. |
| `RUN_DATABASE_INTEGRATION=1 npm.cmd run test:integration` | Aprovado: 68 testes, 0 falhas, MariaDB `seaf_gestao_test`. |
| `git diff --check` | Aprovado. |

## Correção de estabilidade de testes

O teste de recuperação de órfãos da Fase 7 pressupunha uma contagem global igual a um. Como a recuperação de produção é propositalmente global e o banco de testes preserva eventos históricos, a asserção foi corrigida para verificar os eventos identificados pelo prefixo exclusivo da execução. Não houve mudança no comportamento da outbox.

## Limitações conhecidas

- O build do Vite conclui com aviso de chunk principal acima de 500 kB; as páginas de dashboard e relatório já são carregadas sob demanda. A otimização adicional de dependências pode ser feita em fase futura sem alterar os indicadores.
- Exportação CSV não foi incluída, pois não há autorização explícita nos SDDs para esse formato nesta fase.

## Revisão adicional — 2026-11-12

### Alterações

- Corrigida a combinação de status e situação de prazo: ambos são respeitados por interseção. `COMPLETED` com `OVERDUE`, por exemplo, retorna vazio, pois atraso atual exige estado não terminal.
- Os filtros de prioridade, status, responsável e situação de prazo também são aplicados aos ciclos históricos, dentro do escopo organizacional autorizado.
- Acrescentados três testes unitários de regressão e um cenário MariaDB para isolamento de equipes, exclusão de subtarefas dos totais, filtros e período. Os dados desse cenário são revertidos em transação.
- Corrigida falha 500 do relatório ao encontrar identidades sem ciclo atual, criadas pela suíte de integridade. A exclusão é feita na consulta antes da paginação e contagem. Durante a correção, uma tentativa combinou filtros Prisma de relação incompatíveis; a execução final corrigida usa `currentCycleId != null` e passou integralmente.
- Sem migrações novas. Após autorização explícita do usuário, os bancos locais ausentes `seaf_gestao_dev` e `seaf_gestao_test` foram criados e receberam as três migrações existentes e o seed de perfis. O desenvolvimento permaneceu sem usuários e tarefas.

### Fórmulas e interpretação

| Indicador | Unidade e cálculo |
| --- | --- |
| Total atual | Identidades de tarefas principais não excluídas, com ciclo atual, no escopo e filtros. Inclui os estados terminais atuais. |
| Pendentes / aguardando aceite / em andamento | Tarefas principais cujo ciclo atual está no respectivo estado. |
| Atrasadas | Ciclo atual não terminal com `deadlineAt < generatedAt`. |
| Prazo próximo | Ciclo atual não terminal com prazo entre `generatedAt` e 24 horas depois, inclusive. |
| Ciclos criados | Ciclos de tarefas principais com `openedAt` dentro do período. Uma tarefa reaberta pode contribuir com mais de um ciclo. |
| Ciclos concluídos / cancelados | Ciclos no respectivo estado terminal com `closedAt` dentro do período. |
| Taxa de conclusão | `100 × concluídos / (concluídos + cancelados)`, arredondada a uma casa decimal; zero quando não há encerramentos. |
| Concluídos no prazo | Ciclos concluídos selecionados com `closedAt <= deadlineAt`, ou sem prazo. |
| Concluídos fora do prazo | Ciclos concluídos selecionados com `closedAt > deadlineAt`. |
| Evolução diária | Agrupamento dos ciclos selecionados pelo dia UTC de `openedAt` ou `closedAt`. |
| Médias de tempo | Média das atribuições atuais com calendário histórico disponível; reaproveita espera, responsabilidade, pausas e expediente da Fase 4. Zero quando a amostra é vazia. |

O período afeta somente os indicadores históricos do dashboard. Seus limites são instantes inclusivos: `periodStart <= data <= periodEnd`; limite omitido não restringe aquele lado. Datas ISO sem horário são interpretadas como meia-noite UTC, portanto um fim de período à meia-noite não inclui o restante daquele dia. Para incluir um dia UTC inteiro, a API aceita o fim explícito `23:59:59.999Z`.

Equipe e escopo organizacional restringem todas as consultas no banco. Prioridade e status referem-se ao ciclo atual nos indicadores atuais, e ao próprio ciclo nas séries históricas. Responsável atual exige atribuição vigente; responsável histórico aceita atribuições encerradas do ciclo. Situação de prazo é derivada no instante da consulta; `OVERDUE`, `DUE_SOON` e `ON_TIME` exigem estado não terminal, e `NO_DEADLINE` seleciona prazo nulo. Assim, filtros ativos podem zerar os indicadores de encerramento.

O relatório lista tarefas e subtarefas como linhas independentes, pelo ciclo atual. Seu período seleciona abertura **ou** encerramento do ciclo atual no intervalo; não lista todos os ciclos históricos. A paginação e os filtros permanecem no backend. Não se deve comparar diretamente o total de linhas do relatório com ciclos históricos ou com totais de tarefas principais.

### Resultados executados nesta revisão

| Verificação | Resultado |
| --- | --- |
| `npm.cmd ci` | Executado a partir do lockfile; 538 pacotes instalados. npm informou cinco vulnerabilidades moderadas; nenhuma atualização automática aplicada. |
| `npm.cmd run check` | Aprovado na execução final: lint, 30 testes backend, 6 testes frontend, build e Prisma Validate. Suítes MariaDB desabilitadas neste comando. |
| Build Vite | Concluído sem aviso de chunk acima de 500 kB nesta execução. |
| Verificação MariaDB | MariaDB 10.11.16; ambos os bancos com três migrações aplicadas. Desenvolvimento com quatro perfis, zero usuários e zero tarefas. |
| Integração MariaDB | Aprovada na execução final: 69 testes, zero falhas, exclusivamente em `seaf_gestao_test`, com `RUN_DATABASE_INTEGRATION=1`. |
| `git diff --check` | Aprovado. |

Ambiente efetivamente encontrado: Windows, Node.js `24.16.0`, npm `11.13.0`, sem `.env` local. Variáveis de teste foram definidas somente nos processos, com o destino exclusivo `seaf_gestao_test`; o destino de desenvolvimento foi usado somente para o provisionamento autorizado e a conferência por leitura. O dump local `bdseaf.sql` não foi importado. Não foram realizados commit, push ou avanço para a Fase 9.

O provisionamento não cria conta administrativa nem configura o `.env` automaticamente. Esses passos ainda são necessários para o primeiro acesso à aplicação. Não houve validação visual/E2E de navegador nesta revisão; os resultados acima correspondem aos comandos automatizados executados.

### Configuração local posterior ao provisionamento

Por solicitação explícita do usuário, foi criado o `.env` local ignorado pelo Git, com segredo JWT aleatório, bancos de desenvolvimento e testes separados e envio externo de e-mail desativado. `npm.cmd run db:check` confirmou o banco de desenvolvimento no MariaDB 10.11.16 e `npm.cmd run prisma:validate` passou. O primeiro ADMIN MASTER foi criado pelo bootstrap oficial, com os dados fornecidos pelo usuário; foi conferido como ativo e a senha validada contra o hash Argon2id sem expô-lo. Credenciais de bootstrap não foram persistidas no `.env`. Esses passos resolvem as pendências de configuração local acima, mas não constituem validação visual de navegador.

## Homologação final solicitada — 2026-11-12

Esta seção registra a execução mais recente e prevalece sobre os números e avisos das execuções anteriores.

### Servidor e preservação do banco

- Conexão confirmada em `127.0.0.1:3306`, servidor `10.11.16-MariaDB` do XAMPP.
- Bancos listados por `SHOW DATABASES`: `information_schema`, `mysql`, `performance_schema`, `phpmyadmin`, `seaf_gestao_dev`, `seaf_gestao_test`, `sys`, `test`.
- `seaf_gestao_test` já existia, com `utf8mb4` e `utf8mb4_unicode_ci`. Não foi criado, apagado, recriado ou importado nesta execução. Dados anteriores foram preservados; somente o seed idempotente e os testes executaram suas operações previstas.
- Os checksums SHA-256 das três migrações aplicadas coincidiram com os arquivos locais; todas estavam finalizadas e nenhuma revertida. `prisma migrate status` informou schema atualizado.
- `db:migrate:deploy`, apontado explicitamente para testes, informou **nenhuma migração pendente**. Migrações existentes: `20261111170000_init_persistence`, `20261111171000_add_integrity_constraints`, `20261112110000_calendar_history_guards`.
- O seed idempotente dos quatro perfis foi executado com sucesso exclusivamente no banco de testes.
- `DATABASE_URL` e `TEST_DATABASE_URL` foram direcionadas a `seaf_gestao_test` apenas nos processos de validação. O `.env`, as credenciais e configurações de desenvolvimento não foram alterados. Não foram executadas mutações em desenvolvimento por estes comandos.

### Resultados reais

| Verificação | Aprovados | Reprovados | Ignorados | Resultado |
| --- | --- | --- | --- | --- |
| Integração MariaDB completa (`RUN_DATABASE_INTEGRATION=1 npm.cmd run test:integration`) | 70 | 0 | 0 | Aprovada, oito suítes. |
| Cenários MariaDB específicos da Fase 8 (incluídos nos 70) | 4 | 0 | 0 | Aprovados. |
| Testes backend em `npm.cmd run check` | 30 | 0 | 0 testes no resumo do runner | Aprovados; oito suítes de integração desabilitadas nesse comando, executadas separadamente acima. |
| Testes frontend | 6 | 0 | 0 | Aprovados em quatro arquivos. |
| ESLint backend/frontend | — | — | — | Aprovado. |
| Build Vite | — | — | — | Aprovado, com aviso não bloqueante de chunk principal de 578,47 kB. |
| Prisma Validate | — | — | — | Aprovado. |
| `git diff --check` | — | — | — | Aprovado. |

Os quatro cenários de integração da Fase 8 verificaram:

1. Acesso direto de Técnico e ADMIN MASTER aos dois endpoints retorna `403`.
2. Secretário e Gestor podem consultar os endpoints dentro das regras de escopo.
3. Isolamento de equipe, subtarefas presentes no relatório e excluídas dos totais principais, prioridade, períodos e combinação incompatível de status e atraso.
4. Duas tarefas com ciclos anteriores concluído/cancelado e novos ciclos pendentes: duas identidades atuais, quatro ciclos históricos; encerramentos por `closedAt`, criações por `openedAt`, taxa de conclusão de 50% e prioridade histórica independente da atual. A fixture é montada diretamente no banco para testar a agregação; os fluxos reais de reabertura/restauração também passaram na suíte da Fase 5.

As fixtures adicionais da Fase 8 foram revertidas transacionalmente. Não foi necessária correção adicional no código de produção nesta execução; foi acrescentada cobertura explícita para ciclos reabertos/restaurados.

### Arquivos e pendências

Arquivos modificados acumulados nesta revisão: `backend/src/modules/dashboard/dashboard.service.js`, `backend/test/dashboard/dashboard.service.test.js`, `backend/test/integration/phase8.test.js`, `docs/IMPLEMENTATION-DECISIONS.md` e este documento. Nesta rodada final foram alterados somente o teste de integração e este relatório. `bdseaf.sql` permanece local, não rastreado e não importado.

Homologação automatizada da Fase 8 concluída. Permanecem o aviso de tamanho de chunk e a ausência de validação visual/E2E de navegador nesta rodada. O comportamento de limites de período por instante UTC está documentado acima; não houve mudança funcional nesse contrato. Nenhum commit, push ou avanço à Fase 9 foi realizado.

Pendências para a Fase 9, condicionadas à autorização de início: validação visual/E2E mobile e desktop e otimização do bundle principal. A preparação deste commit não inicia essas atividades.

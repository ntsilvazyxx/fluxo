# Fase 8 — Validação de dashboard e relatórios

Data: 2026-11-12

## Escopo homologado

- Endpoints protegidos: `GET /api/v1/dashboard` e `GET /api/v1/reports`.
- Apenas `SECRETARY` e `MANAGER` possuem acesso. `TECHNICIAN` e `ADMIN_MASTER` recebem `403`, inclusive por acesso direto à API.
- Situação atual conta apenas tarefas principais pelo ciclo atual. Subtarefas permanecem linhas próprias no relatório e não são agregadas à principal.
- Histórico conta ciclos: criação por `openedAt`; conclusão e cancelamento por `closedAt`.
- Não houve migração: os indicadores consultam modelos persistidos nas fases anteriores.

## Verificações executadas

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

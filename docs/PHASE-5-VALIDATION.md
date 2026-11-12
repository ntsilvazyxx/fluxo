# Homologação da Fase 5 — Subtarefas, Ciclos de Execução, Reabertura e Restauração

Data: 12/11/2026
Ambiente: Windows + XAMPP
Banco de testes: MariaDB 10.11.16 (`seaf_gestao_test`)
Prisma: 7.10.1

## Escopo entregue

- Criação atômica de subtarefa com ciclo, responsável, prazo, prioridade e histórico próprios.
- Reutilização de atribuição, aceite, rejeição, devolução, prorrogação, conclusão e cancelamento.
- Bloqueio de segundo nível e de criação em ciclo principal encerrado.
- Bloqueio de conclusão da principal com subtarefas ativas.
- Cancelamento atômico da principal e subtarefas abertas.
- Reabertura de concluída e restauração de cancelada em novo ciclo pendente.
- Preservação e imutabilidade dos ciclos anteriores, sem reativar subtarefas antigas.
- Interface mobile-first para subtarefas, navegação, bloqueios e histórico de ciclos.

## Endpoints

- `GET /api/v1/tasks/:id/subtasks`
- `POST /api/v1/tasks/:id/subtasks`
- `POST /api/v1/tasks/:id/reopen`
- `POST /api/v1/tasks/:id/restore`

Subtarefas reutilizam os endpoints já existentes de atribuições, solicitações e transições.

## Migrações

Nenhuma nova migração foi criada. O schema homologado já contém:

- FK entre subtarefa e ciclo principal.
- Trigger que impede subtarefa de segundo nível.
- Índice único que permite somente um ciclo ativo por tarefa.
- Triggers que tornam ciclos encerrados imutáveis e não excluíveis.

Nenhuma migração foi aplicada em `seaf_gestao_dev`. Os testes utilizaram exclusivamente `seaf_gestao_test` e não executaram reset ou `db push`.

## Validações executadas

- Backend sem banco: 20 testes aprovados.
- Frontend: 4 testes aprovados.
- Lint backend/frontend: aprovado sem erros.
- Build Vite: aprovado, com aviso não bloqueante de bundle inicial acima de 500 kB.
- Integração completa no MariaDB: 42 testes aprovados, nenhuma falha e nenhum teste ignorado.
- Prisma Validate: schema válido.
- Preview local: HTTP 200 em `/login`; inspeção visual automatizada indisponível porque o host do navegador integrado não respondeu.

## Cobertura da Fase 5

- Criação, aceite e conclusão de subtarefa.
- Bloqueio do segundo nível.
- Conclusão da principal bloqueada por subtarefa ativa.
- Cancelamento simultâneo da principal e subtarefa.
- Duas reaberturas concorrentes produzindo somente um ciclo.
- Restauração sem reutilizar atribuição.
- Imutabilidade do ciclo anterior no banco.
- Não reabertura automática de subtarefa histórica.
- Isolamento entre equipes e manipulação de IDs.
- Devolução e prorrogação em subtarefa.
- Replay idempotente sem duplicidade.

## Pendências

- O bundle inicial do frontend ainda recomenda divisão de código.
- Imagens, notificações externas e dashboard analítico permanecem fora do escopo.
- Preview visual automatizado depende da disponibilidade do navegador integrado.

# ERD — Camada de persistência

Diagrama derivado de `backend/prisma/schema.prisma` para a Fase 1. Campos e constraints detalhados permanecem no schema e nas migrações SQL.

```mermaid
erDiagram
  ROLE ||--o{ USER : classifica
  USER ||--o{ TEAM_MEMBER : integra
  TEAM ||--o{ TEAM_MEMBER : possui
  USER ||--o{ TEAM_MANAGER : gerencia
  TEAM ||--o{ TEAM_MANAGER : e_gerida

  TEAM ||--o| WORK_CALENDAR : possui
  WORK_CALENDAR ||--|{ CALENDAR_VERSION : versiona
  CALENDAR_VERSION ||--o{ WORK_SCHEDULE : define
  CALENDAR_VERSION ||--o{ CALENDAR_EXCEPTION : excepciona

  TEAM ||--o{ TASK : recebe
  USER ||--o{ TASK : cria
  TASK ||--|{ TASK_CYCLE : executa_em
  TASK_CYCLE ||--o{ TASK : recebe_subtarefa
  TASK_CYCLE ||--o{ TASK_ASSIGNMENT : atribui
  USER ||--o{ TASK_ASSIGNMENT : executa
  CALENDAR_VERSION ||--o{ TASK_ASSIGNMENT : contabiliza
  TASK_CYCLE ||--o{ TASK_REQUEST : recebe
  TASK_ASSIGNMENT ||--o{ TASK_REQUEST : origina
  TASK_ASSIGNMENT ||--o{ TASK_PAUSE_INTERVAL : pausa
  TASK_REQUEST ||--o{ TASK_PAUSE_INTERVAL : justifica
  TASK_CYCLE ||--o{ DEADLINE_CHANGE : registra
  TASK_CYCLE ||--o{ TASK_IMAGE : evidencia
  TASK_CYCLE ||--o{ TASK_CYCLE_NOTE : corrige_por_nota

  USER ||--o{ AUDIT_EVENT : atua
  USER ||--o{ NOTIFICATION : recebe
  OUTBOX_EVENT ||--o{ EMAIL_DELIVERY : entrega
  USER ||--o{ IDEMPOTENCY_KEY : utiliza
  USER ||--o{ USER_SESSION : mantem
  USER ||--o{ PASSWORD_RESET_TOKEN : recupera
  USER ||--o{ MFA_CREDENTIAL : protege
  USER ||--o{ NOTIFICATION_PREFERENCE : configura
  USER ||--o{ SYSTEM_SETTING : atualiza
```

## Regras estruturais principais

- Uma tarefa possui vários ciclos históricos, mas apenas um ciclo aberto.
- Um ciclo possui várias atribuições históricas, mas apenas uma atribuição atual.
- Subtarefas pertencem ao ciclo da tarefa principal e são limitadas a uma camada.
- Solicitações referenciam uma atribuição pertencente ao mesmo ciclo.
- Uma pausa aberta e uma solicitação pendente por tipo são únicas por atribuição.
- Calendários pertencem a equipes e suas versões publicadas não se sobrepõem.
- Auditoria, alterações de prazo e notas de ciclo são append-only.


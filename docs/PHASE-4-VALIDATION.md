# Homologação da Fase 4 — Solicitações, Calendários e Controle de Tempo

Data: 12/11/2026
Ambiente: Windows + XAMPP
Banco de testes: MariaDB 10.11.16 (`seaf_gestao_test`)
Prisma: 7.10.1

## Escopo entregue

- Solicitações de devolução e prorrogação com criação, aprovação e negativa.
- Pausa transacional para devolução e preservação da contagem durante prorrogação.
- Calendários por equipe, versões em rascunho, publicação manual, horários semanais, intervalos, feriados e períodos excepcionais.
- Cálculo de espera, responsabilidade, pausa e expediente efetivo no timezone histórico da atribuição.
- Interface mobile-first no detalhe da tarefa e na configuração de calendários.
- Permissões por perfil/equipe/recurso, locks, CAS, idempotência, auditoria e outbox.

## Banco e migração

Foi aplicada exclusivamente em `seaf_gestao_test` a migração versionada `20261112110000_calendar_history_guards`. O histórico contém também `20261111170000_init_persistence` e `20261111171000_add_integrity_constraints`.

A migração protege o histórico publicado, bloqueia sobreposições de versões publicadas e períodos de trabalho, impede alterações em horários/exceções publicados e garante um feriado por data local. `seaf_gestao_dev` não foi apagado, recriado nem migrado. Não foram usados `prisma db push` ou `prisma migrate reset`.

## Endpoints

- `GET/POST /api/v1/tasks/:id/requests`
- `POST /api/v1/requests/:id/approve`
- `POST /api/v1/requests/:id/deny`
- `GET/POST /api/v1/calendars`
- `GET /api/v1/calendars/:id`
- `POST /api/v1/calendars/:id/versions`
- `PUT /api/v1/calendars/:id/versions/:versionId`
- `POST /api/v1/calendars/:id/versions/:versionId/publish`

## Validações executadas

- Lint backend/frontend: aprovado sem erros ou avisos.
- Backend sem banco: 18 testes aprovados.
- Frontend: 2 testes aprovados.
- Build Vite: aprovado; aviso não bloqueante de chunk com 541,60 kB antes de gzip.
- Prisma Validate: schema válido.
- Integração no MariaDB real: 32 testes aprovados, nenhuma falha ou teste ignorado.
- Servidor confirmado diretamente como `10.11.16-MariaDB`.

## Cobertura real no MariaDB

- Devolução e prorrogação aprovadas/negadas.
- Solicitações simultâneas, reatribuição pendente e decisão fora da equipe.
- Sobreposição e imutabilidade de calendários publicados.
- Versão futura mantida como rascunho até publicação manual.
- Dias úteis/não úteis, feriado prevalente, período excepcional e pausa atravessando final de semana.
- Regressão de autenticação, persistência, concorrência e tarefas das fases anteriores.

## Limitações e pendências

- Divisão do bundle inicial é uma otimização futura não bloqueante.
- Envio externo da outbox, imagens, notificações reais e dashboard completo seguem fora do escopo.
- A inspeção visual automatizada depende da disponibilidade do navegador integrado.

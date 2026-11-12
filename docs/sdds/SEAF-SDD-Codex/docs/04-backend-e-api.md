# SDD 04 — Backend Node.js + Express e API REST

> Alteração proposta em 2026-11-12: `POST /auth/login` autentica todos os perfis, inclusive ADMIN MASTER, somente por e-mail e senha e emite sessão normal; não há rotas TOTP/cadastro/validação/revogação de segundo fator. JWT, refresh, cookies, recuperação de senha, RBAC, isolamento e auditoria permanecem. Autorização técnica do responsável recebida; exceção de segurança ao SDD 07 pendente de aprovação institucional. Ver `docs/AUTHENTICATION-SECURITY.md`.

## Organização
Monólito modular JavaScript (ESM), camadas `routes -> controller -> application service -> domain policies -> Prisma repository`. Serviços aplicam autorização, validação de estados e transações; controllers apenas HTTP; não usar Prisma diretamente em rotas. Usar validação de entrada por schema (ex.: Zod/Joi), logs estruturados, tratamento central de erros, rate limiting e versionamento `/api/v1`.

## Módulos
`auth`, `users`, `teams`, `team-memberships`, `tasks`, `cycles`, `assignments`, `requests`, `subtasks`, `calendars`, `time-accounting`, `images`, `notifications`, `dashboard`, `audit`, `settings`, `outbox`.

## Endpoints previstos (contratos a detalhar na implementação)
| Método | Rota | Operação / autorização |
|---|---|---|
| POST | `/auth/login` | login |
| POST | `/auth/refresh` | rotação de sessão |
| POST | `/auth/logout` | revogar sessão |
| GET/POST | `/users` | listagem escopada / cadastro autorizado |
| PATCH | `/users/:id` | perfis/ativação somente ADMIN MASTER |
| GET/POST | `/teams` | equipes; mutação autorizada |
| GET/POST | `/tasks` | pesquisa escopada / criação Secretário-Gestor |
| GET | `/tasks/:id` | detalhe, ciclo atual, subtarefas, histórico |
| PATCH | `/tasks/:id` | edição autorizada, justificativa e versão |
| POST | `/tasks/:id/assignments` | atribuir/reatribuir |
| POST | `/assignments/:id/accept` | aceitar atual |
| POST | `/assignments/:id/reject` | rejeitar com motivo |
| POST | `/tasks/:id/complete` | concluir ciclo atual |
| POST | `/tasks/:id/cancel` | cancelar ciclo atual |
| POST | `/tasks/:id/reopen` | novo ciclo de concluída |
| POST | `/tasks/:id/restore` | novo ciclo de cancelada |
| GET/POST | `/tasks/:id/subtasks` | listar/criar subtarefa do ciclo atual |
| POST | `/tasks/:id/requests` | devolução/prorrogação |
| POST | `/requests/:id/approve` | decisão autorizada |
| POST | `/requests/:id/deny` | decisão + motivo |
| POST | `/tasks/:id/deadline-changes` | prazo administrativo |
| POST | `/tasks/:id/images` | upload de imagem autorizado |
| DELETE | `/images/:id` | exclusão lógica autorizada |
| GET | `/kanban` | global/equipe conforme perfil |
| GET | `/my-tasks` | atribuições do usuário |
| GET | `/dashboard` | métricas escopadas |
| GET/PATCH | `/notifications` | notificações do usuário |
| GET | `/audit-events` | acesso administrativo |
| GET/POST/PATCH | `/calendars` | versões e agenda da equipe |

## Contratos gerais
- Respostas: `{ data, meta? }` em sucesso e `{ error: { code, message, details?, correlationId } }` em falha.
- Paginação `page`, `pageSize` (limite máximo), ordenação allowlist; filtros combináveis.
- Mutação crítica envia `Idempotency-Key` e `expectedVersion`/`If-Match` conforme operação.
- HTTP: 400 validação, 401 sem sessão, 403 sem permissão, 404 não visível/não existente, 409 conflito de estado/versão, 422 regra de negócio, 429 rate limit.
- Todas as datas em ISO 8601 UTC nas respostas; front exibe horário local configurado.
- Não expor `passwordHash`, tokens, credenciais, chaves de armazenamento ou detalhes internos de SQL.

## Exemplo de contrato de aceite
`POST /api/v1/assignments/:id/accept` com `Idempotency-Key`; resposta com assignmentId, cycleId, status=`IN_PROGRESS`, acceptedAt, version. Se atribuição não for mais atual: 409. Repetição idêntica da mesma chave retorna resultado previamente confirmado.

## Integração e processamento assíncrono
Outbox inserido na mesma transação das alterações de negócio. Worker independente consome com claim transacional, retries e backoff; entrega de e-mail é pelo menos uma vez e deve ser deduplicável. Agendador de lembretes idempotente por tarefa/ciclo/tipo/janela.

## Métricas
Consultas de dashboard devem definir se contam tarefas, ciclos ou subtarefas; jamais somar linhas de joins de atribuição como se fossem tarefas únicas. Paginação e filtros aplicados no SQL, com escopo obrigatório.

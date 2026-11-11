# SDD 11 — Plano de implementação para Codex

## Regras para Codex
- Ler **todos** os SDDs e `AGENTS.md` antes de implementar.
- Não mudar stack: React.js + JS, Node.js + Express.js + JS, MySQL + Prisma.
- Não supor que o banco já foi testado. Gerar schema, migrações e testes.
- Não alterar regras de negócio para facilitar implementação.
- Registrar em `docs/IMPLEMENTATION-DECISIONS.md` toda decisão técnica não especificada; solicitar confirmação para alterações funcionais.
- Trabalhar em incrementos pequenos, com lint, testes e documentação.

## Fases / entregáveis
**Fase 0 — Base**: monorepo ou duas aplicações com scripts padronizados, `.env.example`, ESLint, testes, Docker Compose de desenvolvimento (se aprovado), README de execução. Sem lógica fictícia.

**Fase 1 — Persistência**: `schema.prisma`, migrações, SQL de unicidade de ativos, seeds de perfis, testes MySQL de FKs/constraints; entregar ERD gerado.

**Fase 2 — Autenticação e escopo**: login, sessões, RBAC, equipes, membros, gestores, testes IDOR.

**Fase 3 — Tarefas e Kanban**: CRUD controlado, ciclos, atribuições, aceite/rejeição, consultas escopadas, frontend mobile-first e desktop.

**Fase 4 — Fluxos críticos**: devolução/prorrogação, conclusão/cancelamento, reabertura, subtarefas, alterações de prazo, transações/concorrência e auditoria.

**Fase 5 — Tempo e evidências**: calendários versionados, cálculo de expediente, imagens seguras e compensação.

**Fase 6 — Comunicação e relatórios**: outbox, notificações, e-mails, lembretes, dashboard, filtros e métricas.

**Fase 7 — Homologação**: executar 48 cenários V01–V48, E2E mobile, segurança, acessibilidade, backup/restore, documentação final.

## Condição de passagem
Uma fase só é concluída quando suas migrações/testes automatizados passam e o Codex apresenta arquivos alterados, comandos executados e riscos pendentes. Não executar deploy de produção sem aprovação explícita.

## Formato de relatório do Codex
1. Escopo implementado; 2. Arquivos criados/alterados; 3. Migrações; 4. Testes executados e resultados; 5. Limitações/pendências; 6. Próximo incremento.

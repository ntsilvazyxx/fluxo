# Prompt para iniciar o Codex

Quero implementar o **Sistema de Gestão e Acompanhamento de Tarefas da SEAF** a partir dos SDDs deste repositório.

**Antes de escrever código**, leia `AGENTS.md`, `README.md` e os 12 arquivos em `docs/`. Faça uma auditoria de consistência entre os documentos e apresente: (a) resumo da arquitetura; (b) conflitos/lacunas com impacto; (c) plano de execução da Fase 0 e Fase 1; (d) critérios de aceite. Não altere requisitos sem perguntar.

Stack obrigatória: **Node.js + Express.js + JavaScript** no backend; **MySQL 8 + Prisma ORM**; **React.js + JavaScript (JSX)** no frontend; design mobile-first e identidade visual azul institucional da SEAF. Monólito modular e API REST.

Depois da minha autorização, implemente **somente a Fase 0**, rode as verificações disponíveis e reporte os resultados. Não implemente todas as fases de uma vez. Mantenha `docs/IMPLEMENTATION-DECISIONS.md` para registrar decisões e pendências.

Considere especialmente: concorrência, ciclos, subtarefas, escopo por equipe, idempotência, calendários versionados, auditoria e Transactional Outbox. Não trate tarefas como chamados de suporte.

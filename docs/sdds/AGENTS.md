# Instruções para Codex — Projeto SEAF

Você está implementando um **Sistema de Gestão e Acompanhamento de Tarefas administrativas**. Este repositório começa como **pacote de arquitetura**, não como aplicação pronta.

1. Leia `README.md` e todos os arquivos `docs/*.md` antes de programar.
2. Stack: React.js + JavaScript/JSX (mobile-first), Node.js + Express.js + JavaScript/ESM, MySQL 8+ + Prisma ORM. Não migrar para TypeScript/NestJS sem aprovação.
3. Priorize segurança, integridade de histórico e transações. Atraso é flag derivada, não status. Um responsável atual por ciclo, uma subtarefa apenas um nível, reabertura gera novo ciclo.
4. Trate cada SDD como contrato; discrepâncias devem ser relatadas, não resolvidas por invenção de regras.
5. Implementar por fases conforme `docs/11-plano-implementacao-codex.md`; executar testes reais antes de declarar conclusão.
6. UI institucional: `docs/06-design-system-seaf.md`; usar `assets/logomarca-seaf-original.png` sem adulteração.
7. Antes de começar uma fase, apresentar plano curto e critérios de aceite. Ao terminar, relatar comandos executados e testes reais.
8. Não enviar e-mail externo nem executar deploy de produção sem aprovação explícita.

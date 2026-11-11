# SEAF — Sistema de Gestão e Acompanhamento de Tarefas

**Pacote de SDDs para implementação posterior por Codex** | Arquitetura de referência v1.0 | 11/11/2026

Este pacote é **documentação de arquitetura e requisitos**, não aplicação executável. O objetivo é orientar o Codex a implementar incrementalmente, com verificações e testes, sem inventar regras de negócio.

## Stack obrigatória
- Frontend: **React.js + JavaScript (JSX)**, Vite, React Router, Tailwind CSS, componentes acessíveis; interface **mobile-first**.
- Backend: **Node.js + Express.js + JavaScript (ES modules)**; API REST `/api/v1`.
- Persistência: **MySQL 8+ (InnoDB) + Prisma ORM**. Transações e SQL complementar quando necessário.
- Arquitetura: monólito modular, API independente, filas/processos assíncronos para e-mail e lembretes.
- **Não introduzir TypeScript ou NestJS** sem autorização. Não implementar integrações WhatsApp, múltiplos responsáveis simultâneos ou anexos de documentos.

## Leitura recomendada
1. `docs/01-visao-e-escopo.md` — escopo, princípios e termos.
2. `docs/02-regras-de-negocio.md` — comportamentos e transições.
3. `docs/03-modelagem-dados.md` — entidades, integridade, índices e decisões.
4. `docs/04-backend-e-api.md` — módulos e contratos REST.
5. `docs/05-frontend-mobile.md` — telas, UX, responsividade.
6. `docs/06-design-system-seaf.md` — identidade visual extraída da imagem enviada.
7. `docs/07-seguranca-permissoes.md` — RBAC, escopo, auditoria.
8. `docs/08-concorrencia-e-transacoes.md` — gravações simultâneas.
9. `docs/09-testes-aceite.md` — critérios de aceite e cenários.
10. `docs/10-implantacao-operacao.md` — ambientes, observabilidade e backup.
11. `docs/11-plano-implementacao-codex.md` — fases e prompts de execução.
12. `docs/12-decisoes-e-pendencias.md` — decisões e lacunas a confirmar.

`AGENTS.md` é a orientação inicial para o Codex; `codex/PROMPT-INICIAL.md` é o texto para colar na ferramenta.

## Fonte e grau de certeza
A documentação deriva das decisões registradas na conversa. O detalhamento integral das antigas regras numeradas RN-001–RN-309 **não foi anexado a este pacote**; portanto, o texto aqui é uma **consolidação arquitetural**, não reprodução certificada de todas as 309 regras. Questões não decididas ficam registradas como pendências, sem suposições silenciosas.

## Marca
`assets/logomarca-seaf-original.png` é a imagem enviada pelo usuário, mantida sem alteração. A identidade visual foi adaptada para azul institucional **#1A3281** (aproximação da cor predominante da imagem), branco e neutros. A marca não implica endosso formal ou autorização de publicação.

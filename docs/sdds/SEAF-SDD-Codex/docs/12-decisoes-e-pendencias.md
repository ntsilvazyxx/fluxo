# SDD 12 — Registro de decisões e pendências

> Registro de 2026-11-12: o responsável autorizou tecnicamente retirar TOTP/códigos de segundo fator e usar somente e-mail/senha inclusive para ADMIN MASTER. Isso substitui a política técnica anterior, mas não constitui aprovação institucional da exceção ao MFA do SDD 07. Aprovação formal e aceitação do risco administrativo permanecem pendentes, assim como os demais bloqueios operacionais. Dados MFA ficam arquivados sem descarte; recuperação de senha é preservada. Ver `docs/AUTHENTICATION-SECURITY.md`.

## Decisões confirmadas
- Backend Node.js; **Express.js é proposta arquitetural do assistente**, não escolha explícita do usuário. Mantido como padrão sugerido até eventual revisão.
- Banco MySQL + Prisma.
- Frontend React.js com **JavaScript/JSX** e experiência mobile-first.
- Arquitetura de documentação agora; desenvolvimento posterior via Codex.
- Identidade visual azul institucional baseada na logomarca SEAF enviada.
- Tarefas administrativas, não chamados de TI.
- Um responsável atual por ciclo, subtarefas de um nível, ciclos históricos e calendários versionados.

## Pendências não bloqueantes de documentação
1. Identidade visual: aprovação final dos tokens e autorização de uso institucional da marca.
2. Hospedagem, provedor SMTP e armazenamento privado de imagens.
3. Quantidade de usuários, metas de disponibilidade, backup RPO/RTO.
4. Fuso institucional e política para equipes em fusos diferentes; proposta: armazenar UTC e usar timezone IANA por calendário.
5. Retenção de auditoria, imagens e dados pessoais conforme política da instituição.
6. Detalhes exatos de permissões excepcionais do ADMIN MASTER e visibilidade da auditoria ao Secretário.
7. Tratamento de prazo após rejeição/devolução: proposta é preservar no histórico e exigir prazo válido na próxima atribuição; confirmar se o ciclo volta sem prazo ativo.
8. Contagem máxima de imagens: regra original menciona 10 por tarefa/ciclo; proposta para implementação: 10 imagens ativas **por ciclo**; confirmar antes de codificar.
9. Versões exatas das dependências e convenções de lint/testes, a fixar no início da implementação.
10. Reconciliação integral das regras RN-001–RN-309 com documentos originais, caso disponíveis, antes da homologação final.

## Política de lacunas
A IA implementadora pode tomar decisões **técnicas reversíveis** (nome de biblioteca, organização de pasta) e documentá-las. Não pode inventar autorização, mudar estados, alterar regras de tempo, prazos ou subtarefas sem aprovação.

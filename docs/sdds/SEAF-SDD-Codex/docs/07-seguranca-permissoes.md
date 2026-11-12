# SDD 07 — Segurança e autorização

> Proposta de mudança de requisito (2026-11-12): o responsável solicitou autenticação somente por e-mail e senha para todos os perfis, inclusive ADMIN MASTER, retirando MFA do login e das ações críticas na política técnica implementada. A exigência anterior abaixo é preservada como referência, não como requisito cumprido. Exceção de segurança pendente de aprovação formal institucional. Risco residual: ausência de autenticação multifator em contas administrativas críticas. Argon2id, rate limiting, JWT curto, refresh rotativo, cookies, revogação, auditoria, RBAC e isolamento permanecem; não equivalem a MFA. Produção: NÃO APTO enquanto requisitos institucionais ou controles críticos não forem homologados. Ver `docs/AUTHENTICATION-SECURITY.md`.

## Autenticação
Sessões individuais; senha com Argon2id ou bcrypt com custo adequado; JWT de acesso curto e refresh token rotativo armazenado apenas em hash no banco, preferencialmente cookie HttpOnly Secure SameSite conforme topologia. Revogação de sessões, limite de tentativas, recuperação segura de senha. MFA obrigatório para ações críticas do ADMIN MASTER. TLS em produção; segredos em ambiente/cofre, nunca no repositório.

## Matriz de acesso
| Ação | Admin Master | Secretário | Gestor | Técnico |
|---|---|---|---|---|
| Criar/gerir perfis e ativação | Sim | Não | Não | Não |
| Cadastrar conta operacional | Sim | Sim | Não | Não |
| Criar tarefa | Excepcional justificado | Global | Equipes geridas | Não |
| Atribuir/reatribuir | Excepcional justificado | Global | Equipes geridas | Não |
| Aceitar/rejeitar atribuição | Se atual responsável | Se atual responsável | Se atual responsável | Se atual responsável |
| Concluir tarefa | Se atual responsável | Se atual responsável | Se atual responsável | Se atual responsável |
| Decidir solicitação | Excepcional justificado | Global | Equipes geridas | Não |
| Kanban gerencial | Auditoria/escopo autorizado | Global | Equipes geridas | Não |
| Minhas Tarefas | Próprias | Próprias | Próprias | Próprias |
| Auditoria global | Sim | Conforme política expressa | Não | Não |

## Autorização obrigatória
Para toda consulta e alteração: verificar papel + vínculo com equipe + responsabilidade atual + ciclo atual + estado + versão. Retornar 404 em recursos fora do escopo quando apropriado para reduzir enumeração. Filtros de escopo no SQL, não apenas no frontend.

## Proteção de dados
Validação de payload, queries parametrizadas (Prisma e `$queryRaw` parametrizado), limite de upload e verificação real de MIME/assinatura, antivírus conforme política institucional, armazenamento privado com autorização e URL temporária. Sanitizar HTML e limitar dados de auditoria; não registrar senhas, tokens ou conteúdo sensível desnecessário.

## Auditoria
Append-only para mutações críticas: ator, horário, entidade, ação, motivo, valores relevantes antes/depois, correlationId, IP/user-agent apenas conforme política de privacidade. Acesso restrito. Intervenções excepcionais de ADMIN MASTER sempre justificadas.

## Proteção operacional
Rate limit por usuário/IP; CORS estrito; cabeçalhos seguros; CSRF se autenticação via cookie; proteção contra enumeração; backup criptografado; princípio do menor privilégio para credenciais MySQL e storage.

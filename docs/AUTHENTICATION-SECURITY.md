# Autenticação e segurança — revisão da política da Fase 9

Data: 2026-11-12 (America/Cuiaba). Status: implementação técnica autorizada pelo responsável; exceção institucional de segurança **pendente de aprovação formal**. Não autoriza produção.

**Política técnica solicitada:** autenticação do ADMIN MASTER somente por e-mail e senha.

**Risco residual:** ausência de autenticação multifator em contas administrativas críticas.

**Situação institucional:** exceção de segurança pendente de aprovação formal.

**Prontidão para produção:** NÃO APTO enquanto permanecerem requisitos institucionais ou controles críticos não homologados.

## Proposta de alteração dos contratos

O SDD 07 exigia MFA nas ações críticas do ADMIN MASTER. A estabilização anterior ampliou a verificação para o login desse perfil e implementou TOTP/códigos de recuperação mediante autorização técnica anterior. A solicitação atual substitui essa política técnica por e-mail e senha para os quatro perfis. Isso é **mudança de requisito**, não cumprimento do requisito anterior de MFA. A instituição ainda precisa aceitar formalmente a exceção ou determinar outra política antes de produção.

Arquivos afetados, em `docs/sdds/docs/` e na cópia `docs/sdds/SEAF-SDD-Codex/docs/`:

| SDD | Alteração proposta e situação |
| --- | --- |
| 03 — Modelagem | Estruturas de MFA passam a arquivos legados preservados, sem autenticação ativa. Tokens de recuperação de senha continuam ativos. Pendente de aceite institucional da política. |
| 04 — Backend/API | Login de todos os perfis emite sessão diretamente após e-mail/senha válidos; nenhuma rota de segundo fator. Autorizações continuam obrigatórias. |
| 07 — Segurança | Retirada da obrigatoriedade de MFA no login e nas ações críticas na política técnica solicitada. Exigência anterior registrada como referência; exceção institucional pendente. |
| 10 — Implantação | Aprovação formal da exceção de MFA torna-se condição de liberação, além de HTTPS, SMTP e infraestrutura. |
| 12 — Decisões | Registro da decisão do responsável e da distinção entre autorização técnica e aprovação institucional. |

Não se alteraram escopos organizacionais, estados de negócio ou permissões: ADMIN MASTER não acessa dashboard/relatórios gerenciais. Intervenções excepcionais continuam exigindo justificativa, autorização e auditoria conforme as operações existentes; a retirada do fator elimina sua prova adicional de posse.

## Contrato em execução

- `POST /api/v1/auth/login`: e-mail/senha; sucesso retorna access token, validade e usuário. Refresh apenas em cookie, nunca no JSON. Não há desafio, cadastro TOTP, QR Code nem códigos de segundo fator.
- `POST /api/v1/auth/refresh`: token opaco com hash persistido e rotação atômica; replay do token anterior falha.
- `POST /api/v1/auth/logout`: revoga a sessão; JWT dessa sessão e refresh deixam de autenticar.
- `GET /api/v1/auth/me`: consulta a sessão vigente e o perfil atual no backend.
- `/api/v1/auth/mfa`, `/mfa/verify` e demais caminhos de segundo fator não possuem handlers e retornam 404, autenticados ou não. Não há flag para reativá-los.
- Recuperação de senha preservada em `/auth/password/forgot`, `/auth/password/reset` e `/recuperar-senha`: resposta genérica, token temporário/uso único, hash no banco, ciphertext na outbox, entrega configurável por e-mail e revogação de sessões no reset. Não constitui segundo fator.

Os serviços criptográficos AES-256-GCM e `AUTH_DATA_ENCRYPTION_KEY` continuam necessários à entrega segura de recuperação. A remoção de TOTP não autoriza remover ou substituir essa chave em instalações existentes. Login por senha não depende dela em desenvolvimento/teste; produção continua recusando configuração insegura e a recuperação exige chave válida.

## Controles compensatórios existentes e seus limites

| Controle preservado | Limite |
| --- | --- |
| Argon2id; política de senha de 12–128 caracteres com maiúscula, minúscula e número | Protege armazenamento e reduz ataques offline; não impede phishing ou reutilização de senha vazada. |
| Rate limiting compartilhado de login/recuperação; falhas genéricas; hash fictício para conta inexistente | Limite em memória por IP/processo; cadeia do proxy e múltiplas instâncias precisam de homologação. Não equivale a MFA. |
| JWT de curta duração (padrão 900 s), refresh opaco rotativo armazenado como hash | Roubo de sessão continua sendo risco. A sessão é revalidada no banco e pode ser revogada. |
| Cookie HttpOnly, SameSite=Strict e Secure configurado/exigido em produção | Exige HTTPS e topologia institucional homologada; HttpOnly não impede ações realizadas por XSS no navegador da vítima. |
| CORS estrito, validação de Origin nos fluxos aplicáveis, headers, validação de entradas e queries parametrizadas | Defesa em camadas, sem prova adicional da identidade administrativa. |
| RBAC, escopo por equipe, responsabilidade, versões, idempotência e locks | Contém permissões e concorrência; um invasor com senha válida pode exercer o papel comprometido. |
| Auditoria de login bem-sucedido, recuperação e operações críticas; histórico append-only | Detecção/investigação; não impede uso malicioso de credencial válida. Retenção e alertas dependem de operação institucional. |

Riscos residuais: phishing, credential stuffing distribuído, senha reutilizada/compartilhada, comprometimento do e-mail de recuperação e maior impacto de uma conta administrativa comprometida. Não foi implementado outro fator disfarçado, fallback por e-mail, autorização gerencial adicional ou atalho de suporte.

## Migrações e retenção segura

1. Manter integralmente `20261112233000_auth_mfa_sessions`, já executada, inclusive seu checksum.
2. Aplicar, somente no destino autorizado e em janela sem gravações, a compensatória `20261113001000_retire_mfa_preserve_history` após as anteriores. Nesta revisão o único destino foi `seaf_gestao_test` no MariaDB 10.11.16 local.
3. A compensatória renomeia `auth_challenges` → `legacy_mfa_auth_challenges`, `mfa_credentials` → `legacy_mfa_credentials` e `user_sessions.mfaVerifiedAt` → `legacyMfaVerifiedAt`. Preserva linhas, ciphertexts, hashes, timestamps, índices e FKs; não contém DROP/DELETE/TRUNCATE. Não altera tokens de senha, auditoria ou dados operacionais.
4. Os modelos/coluna legados usam `@@ignore`/`@ignore` no Prisma. Não há delegates gerados, consulta por autenticação ou reativação automática desses registros. O enum remanescente descreve somente o arquivo histórico.
5. Não descartar segredos cifrados ou hashes de recuperação: dados reais não foram classificados nem têm descarte autorizado. Restringir acesso aos arquivos e backups via DBA/ACL, preservar chaves existentes sob custódia e obter autorização específica de retenção/descarte. A renomeação e o ignore não substituem controle de acesso do banco.
6. `quality/mfa-retirement-check.js before` registra contagens/hashes sem conteúdo; `after` confirma preservação de todas as linhas e checksums após a migração; `verify-archives` confirma que as suítes não alteraram os arquivos. Resultados em `.artifacts/`, ignorado pelo Git. O modo `before` é para destino ainda não migrado; não reexecutá-lo após a compensação.

Não foram modificados `seaf_gestao_dev`, o `.env` local ou `bdseaf.sql`. Não executar `db push`, reset ou recriação de banco. Bancos novos também devem aplicar toda a cadeia versionada, incluindo a compensatória, sem suprimir a migração histórica.

Rollback não é apenas retornar o código TOTP: ele esperaria tabelas/coluna anteriores. Exige plano DBA autorizado, backup e janela, mantendo dados novos de sessões/auditoria e segredos históricos. Não renomear de volta nem excluir a compensatória silenciosamente; produzir procedimento/migração futura revisada se necessário. Nenhuma reversão foi executada.

## Aprovação institucional necessária

Registrar autoridade e responsável de segurança, escopo das contas/ações afetadas, avaliação de risco, controles efetivamente homologados, prazo de validade/revisão da exceção e critério de revogação. Este documento é proposta para análise; não contém assinatura ou aceite institucional presumido. Permanecem pendentes SMTP real, HTTPS/proxy, cofre, menor privilégio, monitoramento e recuperação coordenada de banco/imagens/chaves. A implantação permanece bloqueada.

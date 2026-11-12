# SEAF — Preparação para implantação e recuperação

Data: 2026-11-12. Este documento é um procedimento para revisão institucional, não uma autorização de implantação. Nenhuma infraestrutura externa foi configurada na Fase 9.

> Política vigente solicitada em 2026-11-12: login somente por e-mail e senha, inclusive ADMIN MASTER. TOTP foi removido por mudança explícita de requisito; a exceção ao MFA do SDD 07 está **pendente de aprovação institucional formal**. Produção permanece **NÃO APTO**. Consulte `AUTHENTICATION-SECURITY.md` e a seção 14 de `PHASE-9-VALIDATION.md`. Recuperação por e-mail e ensaio SQL local foram preservados; SMTP real, HTTPS e operação institucional continuam pendentes.

## Pré-condições e bloqueios

- Aprovar o relatório `PHASE-9-VALIDATION.md`, a versão do código e a janela de mudança.
- Definir domínio, responsáveis, volume, disponibilidade, retenção, RPO e RTO. Os números de carga local não dimensionam um servidor institucional.
- Obter aprovação institucional formal da exceção de MFA: a política técnica solicitada usa apenas e-mail/senha, com risco residual em contas administrativas críticas. Não tratar a retirada de TOTP como homologação ou cumprimento de MFA.
- Recuperação está integrada à outbox; homologar SMTP real e entrega ao destinatário institucional antes de liberar produção.
- O restore SQL local foi ensaiado; homologar restauração coordenada com imagens/cofre, tempos e evidências no ambiente institucional.
- O modelo inicial é uma instância de API. Rate limit é em memória por processo; proxy e múltiplas réplicas exigem validação específica.

## Infraestrutura

Node.js >=22.12, npm compatível com o lockfile e MariaDB 10.11.x InnoDB são os requisitos de software atuais. A atualização de `file-type` exige Node >=22; o ambiente validado usa Node 24.16. Windows/PowerShell é suportado para desenvolvimento. XAMPP com root sem senha é somente configuração local e não é recomendação de produção.

Separar teste, homologação e produção, com contas de banco e diretórios diferentes. O usuário runtime do banco deve ter somente os privilégios de leitura/gravação exigidos; uma conta de migração separada aplica DDL e triggers na janela de manutenção. Não usar root, phpMyAdmin público ou portas MariaDB expostas externamente. Restringir acesso à API ao proxy/firewall; o servidor atual escuta a porta configurada e não implementa TLS próprio.

Executar a API como serviço sob usuário dedicado sem privilégios administrativos, com restart controlado e diretório de trabalho `backend`. Servir somente `frontend/dist` pelo servidor web. Reservar volume persistente privado para imagens e volume separado para backups criptografados; não usar o diretório de release como storage persistente.

## Variáveis de ambiente

Segredos pertencem ao cofre institucional ou ao arquivo local protegido por ACL; nunca ao Git, pacote público, screenshot ou log. Copiar `.env.example` apenas como modelo e preencher localmente. Não levar o `.env` pessoal ao serviço.

| Variável | Configuração de produção |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | Porta interna da API; liberar somente ao proxy |
| `DATABASE_URL` | URL `mysql://` da conta runtime no banco aprovado; caracteres especiais da senha devem ser codificados para URL |
| `TEST_DATABASE_URL` | Exclusivamente `seaf_gestao_test`; não é usada pelo runtime |
| `RUN_DATABASE_INTEGRATION` | `0` no runtime; `1` apenas no processo de teste |
| `JWT_ACCESS_SECRET` | Segredo aleatório exclusivo de pelo menos 32 bytes; guardado em cofre |
| `AUTH_DATA_ENCRYPTION_KEY` | 32 bytes aleatórios em 64 caracteres hexadecimais; chave independente para recuperação de senha via outbox, com backup protegido; não descartar chaves históricas de arquivos MFA sem autorização |
| `ACCESS_TOKEN_TTL_SECONDS` | Padrão atual 900; validar política institucional |
| `REFRESH_TOKEN_TTL_DAYS` | Padrão atual 30; refresh opaco rotativo, hash no banco |
| `PASSWORD_RESET_TTL_MINUTES` | Padrão atual 30; entrega via outbox/Nodemailer requer SMTP configurado |
| `COOKIE_SECURE` | `1`; HttpOnly e SameSite Strict já definidos pelo código |
| `CORS_ORIGINS` | Origens HTTPS exatas aprovadas; sem wildcard |
| `APP_BASE_URL` | URL HTTPS pública aprovada, utilizada nos links de notificações |
| `VITE_API_URL` | Definir no build; preferir `/api/v1` com proxy na mesma origem |
| `IMAGE_STORAGE_PATH` | Caminho absoluto privado, persistente, com ACL da conta de serviço |
| `MAIL_ENABLED` | `1` somente após aprovação e teste do SMTP |
| `MAIL_HOST`, `MAIL_PORT` | SMTP institucional; 465 usa TLS direto, demais portas exigem STARTTLS; certificado válido e TLS >=1.2 |
| `MAIL_USER`, `MAIL_PASS` | Conta dedicada, segredo em cofre |
| `MAIL_FROM`, `MAIL_FROM_NAME` | Remetente institucional autorizado; validar SPF/DKIM/DMARC com a equipe de correio |
| `LOGIN_RATE_WINDOW_MINUTES`, `LOGIN_RATE_MAX_ATTEMPTS` | Padrões atuais 15 minutos/10 tentativas; medir comportamento atrás do proxy |

O código recusa startup em `production` com segredo JWT curto/modelo, cookie sem Secure, URLs HTTP ou lista de CORS vazia. Isso não verifica certificado, qualidade aleatória do segredo, conectividade SMTP ou segurança do host.

## HTTPS, domínio e proxy

Usar certificado válido, redirecionamento HTTP → HTTPS e renovação monitorada. Manter SPA e API na mesma origem evita diferenças de site nos cookies Strict. Não alterar SameSite para acomodar uma topologia sem revisão e testes.

O proxy deve:

1. Encaminhar `/api/v1/` para a API preservando método, caminho, headers e cookies; não fazer cache de respostas autenticadas.
2. Servir assets versionados com cache longo e `index.html` com revalidação. Para rotas SPA, retornar `index.html`; nunca usar esse fallback em `/api/v1`.
3. Limitar upload a um valor ligeiramente acima de 10 MiB por causa do multipart (por exemplo, 12 MiB). A API continua limitando cada imagem a 10 MiB e a dez imagens ativas por ciclo.
4. Definir timeouts coerentes com transações curtas e upload, e bloquear acesso direto externo à API e ao banco.
5. Aplicar headers também ao frontend estático: CSP revisada (`script-src 'self'`, conexões para a API aprovada e `img-src 'self' blob:` como ponto de partida), `nosniff`, política de referer e proteção contra framing. Helmet da API não configura headers do servidor estático.
6. Validar rate limiting com clientes distintos. `trust proxy` não está habilitado: não confiar automaticamente em `X-Forwarded-For` recebido do cliente. Atrás de proxy, o limite da API pode agregar todos os usuários no IP do proxy; impor limites adicionais no proxy e homologar a cadeia de confiança antes da liberação.

## Sequência de implantação (não executada)

1. Confirmar commit aprovado e ausência de segredos/backups na release. Fazer snapshot de configuração protegida e backup consistente de banco + imagens. Pausar gravações e o worker durante o snapshot quando não houver estratégia coordenada.
2. Em homologação separada, executar `npm.cmd ci`, gerar o Prisma Client, rodar as validações e produzir `frontend/dist` com `VITE_API_URL` definitivo.
3. Conferir host, nome do banco, versão e checksums de migrações. A conta de migração executa `npm.cmd run db:migrate:deploy`; nunca `db push` ou reset. Não executar isso no banco pessoal por engano.
4. Executar `npm.cmd run db:seed` quando necessário: sincroniza somente os perfis. Não há credencial administrativa padrão. Na instalação inicial, fornecer as variáveis `SEAF_BOOTSTRAP_ADMIN_*` só no processo de bootstrap e removê-las depois.
5. Instalar a release e configurar serviço da API (`npm.cmd start --workspace backend`) e servidor estático. Não usar `npm run dev`, `node --watch` ou Vite dev server em produção.
6. Validar `/api/v1/health`, conexão de banco, login/refresh/logout e cookie Secure no navegador HTTPS. O health atual verifica o processo HTTP, não disponibilidade do banco, SMTP ou fila; conferir esses componentes separadamente.
7. Validar perfis e escopos, upload e leitura autenticada, entrega de notificações e SMTP com contas institucionais de homologação aprovadas. Liberar tráfego somente após aceite.

## Outbox e arquivos

O servidor atual inicia um worker embutido que processa outbox e agenda lembretes a cada minuto. Não existe CLI de worker independente nesta versão. Planejar uma única instância inicialmente. Claim usa CAS; envios SMTP têm semântica pelo menos uma vez, e uma falha após envio antes da confirmação pode gerar duplicação externa. O desligamento chama `stop()`, mas não aguarda explicitamente todos os efeitos em andamento: pausar e verificar a fila antes de manutenção.

Monitorar `PENDING`, `PROCESSING`, `FAILED`, idade do evento mais antigo, número de tentativas e `email_deliveries`. A recuperação de `PROCESSING` órfão ocorre após 30 minutos. Não editar manualmente eventos de negócio ou histórico para destravar a fila; investigar e definir procedimento de replay idempotente com auditoria.

Imagens usam staging, metadados transacionais, promoção e compensação de falhas capturadas. Não há job periódico de reconciliação após crash abrupto. Até existir esse job, prever inventário por leitura de staging/objects versus metadados, quarentena e revisão autorizada; não excluir arquivos automaticamente. A exclusão lógica preserva arquivos e histórico. Storage nunca deve ser publicado como pasta estática. Antivírus, quota e retenção dependem de política institucional.

## Backup, recuperação e rollback

Definir RPO/RTO, responsáveis, criptografia, rotação, retenção e cópia fora do host. Preservar também a chave JWT e a configuração por canal seguro separado; não colocar segredos em dumps compartilhados.

Para MariaDB InnoDB, planejar dump consistente com `mariadb-dump`/`mysqldump`, `--single-transaction`, `--routines`, `--triggers` e `--events`, incluindo `_prisma_migrations`. Não passar senha na linha de comando; usar arquivo de opções protegido. Evitar DDL concorrente durante o dump. Capturar imagens na mesma janela de consistência, manifestar checksums e testar a leitura do backup. Não usar `bdseaf.sql`: ele não contém os dados necessários à recuperação.

O ensaio de recuperação deve ocorrer em instância descartável aprovada, separada dos bancos existentes. Confirmar destino antes de importar, restaurar banco + objetos compatíveis, conferir versão e migrações, FKs, triggers, contagens, hashes de arquivos, histórico, sessões e login; medir RTO e perda de dados em relação ao RPO. Não foi executado um restore destrutivo em `seaf_gestao_test` ou em desenvolvimento nesta fase.

Rollback de código: pausar tráfego e worker, preservar logs saneados, retornar à release anterior somente se compatível com o schema. A estabilização adicionou a migração MFA e, posteriormente, a compensatória de arquivamento descrita abaixo. O código TOTP antigo espera outros nomes de tabelas/coluna; não basta retornar o código. Rollback com mudança incompatível de banco exige plano DBA e recuperação coordenada do backup, com aprovação por possível perda de gravações posteriores. Não apagar migrações, remover triggers, executar SQL inverso improvisado ou resetar o banco.

## Monitoramento e segurança operacional

Monitorar latência p50/p95/p99, 4xx/5xx/429/409, pool de conexões, deadlocks, tempo de consultas, CPU/RSS/heap, disco, quota de imagens, idade da outbox, falhas SMTP, expiração de certificado e sucesso/idade dos backups. Encaminhar logs para destino protegido com rotação e retenção; alertas precisam de responsável e teste de acionamento.

Os logs HTTP de falha incluem identificador de correlação, tipo e código; não incluem stack/query/payload. Não habilitar debug Prisma com argumentos em produção nem registrar Authorization, cookies, token de recuperação, senha, destinatário ou conteúdo de e-mail. Erros internos genéricos exigem diagnóstico em canal restrito sem reintroduzir payloads nos logs.

Checklist de liberação:

- [x] Login por e-mail/senha e recuperação preservados e testados localmente; TOTP removido tecnicamente.
- [ ] Exceção de segurança para ausência de MFA aprovada formalmente pela instituição, com risco e controles aceitos.
- [ ] Recuperação de senha e controles de autenticação homologados na infraestrutura institucional.
- [ ] SMTP institucional, remetente e TLS aprovados; e-mail real de teste autorizado entregue.
- [ ] Domínio, certificado, CORS, cookie Secure e proxy validados.
- [ ] Contas de serviço e banco com menor privilégio; acesso administrativo restrito.
- [ ] Volume privado persistente, quota, retenção e recuperação de imagens definidas.
- [ ] Backup e restore ensaiados, RPO/RTO aprovados.
- [ ] Monitoramento e alertas testados; procedimento de incidentes e replay da fila aprovado.
- [ ] Fluxos por perfil aprovados pelos usuários, incluindo gestão de usuários/equipes e política de auditoria.
- [ ] Navegadores/dispositivos institucionais e carga representativa homologados.
- [ ] Segurança de dependências revisada, release e rollback aprovados.
- [ ] Autorização explícita para implantação obtida.

## Estabilização — procedimento atualizado de autenticação e SMTP

**Migrações:** manter `20261112233000_auth_mfa_sessions` exatamente como aplicada. A revisão por senha adiciona `20261113001000_retire_mfa_preserve_history`: renomeia `auth_challenges` → `legacy_mfa_auth_challenges`, `mfa_credentials` → `legacy_mfa_credentials` e `user_sessions.mfaVerifiedAt` → `legacyMfaVerifiedAt`. Apenas arquiva; nenhum dado é descartado, nenhum índice/FK/trigger é removido. Modelos e coluna arquivados são ignorados pelo cliente Prisma e não participam da autenticação. As cinco migrações estão aplicadas exclusivamente em `seaf_gestao_test`. Para outro destino, obter autorização específica, backup, janela sem gravações e conferir a conexão antes de aplicar toda a cadeia. Não editar/pular migrações antigas, usar `db push`, reset ou recriar bancos. Desenvolvimento não foi modificado nesta revisão.

**Chave de proteção:** provisionar `AUTH_DATA_ENCRYPTION_KEY`, exatamente 64 caracteres hexadecimais de 32 bytes aleatórios, independentemente de `JWT_ACCESS_SECRET`. Não há fallback ou chave padrão. Guardá-la em cofre com backup separado e ACL restrita; sem a chave, a recuperação padrão por e-mail não funciona e em produção o startup é recusado. Login por senha não usa essa chave. Rotação exige procedimento de recifragem dos tokens pendentes; manter chaves históricas dos arquivos legados até decisão formal de retenção/descarte. Nenhum valor real foi adicionado a `.env.example` ou ao Git.

**Autenticação solicitada:** todos os perfis, inclusive ADMIN MASTER, usam e-mail/senha e recebem a sessão normal após validação. Não cadastrar aplicativo, QR Code ou códigos de segundo fator. TOTP não tem opção de reativação nesta versão. Argon2id, falhas genéricas, rate limiting, JWT curto, refresh rotativo, cookie HttpOnly/SameSite/Secure em HTTPS, revogação e autorização backend foram preservados. ADMIN MASTER continua sem acesso gerencial irrestrito.

**Segundo fator retirado e arquivos preservados:** serviços TOTP, cadastro, códigos e endpoints `/auth/mfa*` foram removidos; rotas antigas retornam 404. Credenciais, hashes de códigos e desafios existentes foram preservados sem classificação/descarte; não utilizá-los para autenticar. Restringir acesso aos arquivos legados/backups via ACL e privilégios do DBA; o ignore do Prisma não substitui essas proteções. Não divulgar segredos nem apagar registros manualmente. A aprovação institucional da exceção continua obrigatória.

**Recuperação de senha:** `/recuperar-senha` solicita o e-mail com resposta genérica. O serviço grava hash do token e evento de outbox na mesma transação; o token da mensagem é cifrado. O worker entrega o link temporário por Nodemailer, respeitando expiração e invalidando mensagens de tokens antigos/usados. O link usa `#token=...`, removido da URL pela interface, sem token em query string ou logs. Reset é de uso único, invalida os demais tokens pendentes e revoga sessões. Não consulta nem modifica arquivos MFA. O notifier padrão deixou de ser no-op; não configurar callbacks de teste no servidor de produção.

**SMTP:** TLS direto em porta 465; nas demais, STARTTLS é obrigatório. Certificados são verificados, TLS mínimo 1.2, `logger`/`debug` desligados e acesso de anexos por URL/arquivo desativado. Configurações adicionais: `MAIL_CONNECTION_TIMEOUT_MS=10000`, `MAIL_GREETING_TIMEOUT_MS=10000`, `MAIL_SOCKET_TIMEOUT_MS=30000`. Alterações devem ser positivas e compatíveis com a rede aprovada. Falhas geram estado de entrega `FAILED` e backoff da outbox; mensagens de erro são genéricas e não contêm token/senha. Sem SMTP ativo, a recuperação não registra sucesso fictício; ficará em retry/falha até configuração e deve gerar alerta.

**Informações necessárias da SEAF:** host/FQDN e porta, TLS direto ou STARTTLS, cadeia de certificados/CA institucional, método de autenticação ou relay autorizado, usuário/segredo entregues por cofre, remetente autorizado, SPF/DKIM/DMARC, limites de envio, conectividade/firewall, domínio público do link, responsáveis por falhas e retenção. OAuth2, se exigido pela instituição, requer integração específica antes da liberação; não foram usados credenciais reais ou servidores externos nesta fase.

**Sessões existentes:** em janela coordenada e somente após aceite institucional, aplicar a cadeia de migrações e liberar o código compatível. O campo histórico não condiciona sessões; sessões ainda ativas permanecem sujeitas à validade/revogação existente, sem exigir recadastro. Sessões revogadas não são reativadas. Não alterar permissões da Fase 8. O backup deve incluir chaves necessárias por canal separado do dump. Um rollback deve ser planejado com o DBA, preservando novos dados e arquivos legados.

## Ensaio de restauração isolado executado

Comando local: `node quality/restore-rehearsal.js`. O script valida origem `seaf_gestao_test`, cria destino novo `seaf_restore_test_<UUID>` e recusa nome já existente. Exporta com `--single-transaction --routines --events --triggers --hex-blob --skip-add-drop-table`, sem `--databases`/USE. Não importa em desenvolvimento nem no banco de testes. Credenciais são transmitidas somente ao processo local; dump e relatório permanecem em `.artifacts/`, ignorado pelo Git.

O ensaio compara dados de todas as tabelas por contagem e SHA-256, histórico/ciclos, migrações, definições de triggers (somente CRLF/LF normalizado), índices e constraints. FKs compostas são verificadas em conjunto com a semântica de NULL do MariaDB. A proteção append-only da auditoria é testada no clone. Não há operação de exclusão/recriação de banco, e clones de tentativas anteriores ficam preservados para inspeção. Os números finais e nomes dos destinos constam no relatório de validação e `.artifacts/restore-result.json`.

Isso é ensaio local de **banco**, não certificação do backup operacional de produção. Arquivos privados de imagens, chaves de cofre, agendamento criptografado/off-host, RPO/RTO institucional, restauração em host independente e teste de alertas continuam exigindo homologação institucional. Os dados sintéticos de MFA restaurados são cifrados com chaves efêmeras de teste e não constituem credenciais operacionais recuperáveis.

## Repetição na máquina do serviço sem implantação

Para continuar o desenvolvimento amanhã: transportar somente código versionado e lockfile, instalar Node compatível/XAMPP, criar os bancos locais vazios somente se ausentes, configurar um `.env` próprio e aplicar migrações e seed nos destinos conferidos. Se já existirem dados, preservar e verificar compatibilidade; não importar estrutura que contém `DROP TABLE`. Criar o administrador por bootstrap somente quando não houver outro. Os usuários criados no banco pessoal não acompanham o Git.

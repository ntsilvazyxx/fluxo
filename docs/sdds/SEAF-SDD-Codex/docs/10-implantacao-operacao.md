# SDD 10 — Implantação e operação (planejamento)

## Ambientes
`development`, `test`, `staging`, `production`, com configurações e segredos separados. MySQL InnoDB com backup automatizado; API Node.js, frontend React servido estaticamente, worker de outbox e scheduler de lembretes; armazenamento de imagens privado. Escolha de hospedagem e provedor de e-mail pendentes de aprovação.

## Variáveis previstas
`DATABASE_URL`, `JWT_ACCESS_SECRET`/chaves de assinatura, `JWT_REFRESH_SECRET`/chaves, `CORS_ORIGINS`, `APP_BASE_URL`, `STORAGE_*`, `MAIL_*`, `LOG_LEVEL`, `TZ=UTC`, `NODE_ENV`. Nunca commitar `.env` real.

## Migrações
Gerar schema Prisma a partir do SDD 03, migrações Prisma e SQL suplementar de constraints. Aplicar em staging antes de produção, com backup e rollback documentado. Não usar `prisma db push` como substituto de migrações de produção.

## Observabilidade
Logs estruturados com correlationId, métricas de latência/erro, tamanho da outbox, e-mails com falha, jobs atrasados, conflitos 409, deadlocks, tempo de consultas. Alertas para falha de backup, fila acumulada e erros persistentes.

## Recuperação
Definir RPO/RTO institucionais; ensaiar restauração; armazenamento de imagens e metadados com estratégia consistente. Plano de retenção e descarte alinhado à LGPD e normas internas.

## Requisitos de produção a validar
Domínio, HTTPS, CORS, política de cookies, políticas de retenção, MFA, SMTP, volume de usuários, disponibilidade, horário local institucional, acessibilidade e autorização de uso da logomarca.

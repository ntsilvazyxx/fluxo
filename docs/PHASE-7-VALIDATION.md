# Homologação da Fase 7 — Notificações, Outbox e E-mails

Data: 12/11/2026
Ambiente: Windows + XAMPP
Banco de testes: MariaDB 10.11.16 (`seaf_gestao_test`)

## Escopo homologado

- Notificações internas paginadas, leitura individual e leitura em massa com escopo obrigatório por destinatário.
- Outbox transacional com claim por CAS, backoff, recuperação de eventos em processamento e deduplicação por chave.
- Notificações idempotentes por evento e destinatário e entregas de e-mail registradas por evento/destinatário.
- Adaptador SMTP com modo de teste quando `MAIL_ENABLED=0`.
- Lembretes de prazo próximo e atraso, sem ciclos encerrados.
- Worker iniciado apenas pelo servidor e encerrado durante o shutdown.

## Validações executadas

- Integração MariaDB completa: 66 testes aprovados, nenhuma falha ou teste ignorado.
- Backend sem integração: 25 testes aprovados.
- Frontend: 6 testes aprovados.
- ESLint: aprovado.
- Prisma Validate: schema válido.
- Build Vite: aprovado; permanece apenas aviso não bloqueante de bundle acima de 500 kB.
- `git diff --check`: aprovado.

## Observações

- Cada execução da suíte da Fase 7 usa UUID próprio nas `dedupeKey`s, evitando interferência de eventos históricos sem removê-los.
- O envio SMTP real depende de configuração institucional futura; em teste nenhum e-mail externo é enviado.

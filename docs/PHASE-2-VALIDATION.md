# Homologação da Fase 2 — Autenticação, Usuários e Permissões

Data: 11/11/2026  
Ambiente: Windows + XAMPP  
Banco de testes: MariaDB 10.11.16 (`seaf_gestao_test`)  
Prisma: 7.10.1

## Escopo entregue

- Login Argon2id, JWT expirável, refresh opaco rotativo, logout e revogação.
- Recuperação de senha com token temporário de uso único.
- Limite de tentativas em login e recuperação.
- RBAC e escopo por equipe no backend.
- Cadastro/inativação lógica de usuários e vínculos históricos.
- Interface mobile-first com login, sessão em memória e navegação por perfil.

## Verificações

- `npm run lint`: aprovado.
- `npm run build`: aprovado.
- `npm test`: aprovado.
- `npm run prisma:validate`: aprovado.
- Testes de integração reais: aprovados no MariaDB.

Os testes cobrem login, usuário inativo, expiração, logout, recuperação, rotação concorrente, IDOR, RBAC, vínculo duplicado e as garantias da Fase 1.

## Banco

Nenhuma nova migração foi necessária. O banco `seaf_gestao_dev` não foi apagado, recriado ou usado pela suíte automatizada.

## Pendências

- Integrar envio real do e-mail de recuperação; o backend fornece adaptador injetável e não registra tokens em log.
- Definir e implementar MFA para perfis críticos após decisão aprovada.
- Homologação visual manual nos navegadores e dispositivos institucionais.

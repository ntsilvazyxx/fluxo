# Homologação da Fase 1 — Persistência

Data: 11/11/2026  
Ambiente: Windows + XAMPP  
Servidor homologado: MariaDB 10.11.16  
Prisma ORM: 7.10.1

## Bancos isolados

- `seaf_gestao_test`: migrações, seed e testes de integração/concorrência.
- `seaf_gestao_dev`: migrações limpas e seed para desenvolvimento.

Nenhum banco preexistente do XAMPP foi alterado.

## Migrações aplicadas

1. `20261111170000_init_persistence`
2. `20261111171000_add_integrity_constraints`

O banco de desenvolvimento recebeu as duas migrações em uma execução limpa. `prisma migrate status` informou que o schema está atualizado.

## Ajustes de compatibilidade MariaDB

- Chaves geradas derivadas de IDs `CHAR(36)` passaram a usar `VARCHAR(36)` e `RTRIM(id)`, evitando dependência do preenchimento de `CHAR` pelo `sql_mode`.
- As mesmas garantias foram preservadas com índices únicos compostos para vínculos ativos e solicitações pendentes.
- Diretivas `DELIMITER`, específicas de clientes SQL interativos, foram removidas. O executor Prisma aceita diretamente os blocos `CREATE TRIGGER ... BEGIN ... END`.

Nenhuma regra de negócio foi flexibilizada.

## Resultados reais

- Seed executado duas vezes no teste: quatro perfis, sem duplicação.
- Um ciclo aberto por tarefa sob duas conexões simultâneas: aprovado.
- Uma atribuição atual por ciclo sob duas conexões simultâneas: aprovado.
- Solicitação vinculada a atribuição de outro ciclo: bloqueada.
- Subtarefa de subtarefa: bloqueada.
- Sobreposição de versões de calendário: bloqueada.
- Alteração de evento de auditoria append-only: bloqueada.
- Exclusão física de usuário referenciado: bloqueada.

Resultado da suíte de banco: 6 aprovados, 0 reprovados, 0 ignorados.


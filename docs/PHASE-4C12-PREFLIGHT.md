# Fase 4C.12 — Preflight real do guard

## Parecer

**BLOQUEADO — ambiente não aprovado para solicitar a aplicação das seis migrações.**

O primeiro probe proibido (`test`) não foi classificado pelo guard como negação MariaDB 1044. O guard encerrou a verificação de forma fail-closed, como deve fazer diante de erro inesperado. Os demais probes e a revalidação dos bancos protegidos foram interrompidos. Nenhuma migração, fixture ou escrita em banco foi executada.

## 1. Estado verificado

- Branch: `feature/kanban-refactor`.
- MariaDB disponível em `127.0.0.1:3306`: `10.11.16-MariaDB`.
- Conexão restrita selecionou `seaf_gestao_integration_2` e confirmou `CURRENT_USER() = seaf_it2_run@127.0.0.1`.
- `_2`: zero tabelas; `_prisma_migrations` não existe.
- A autenticação das duas contas restritas foi confirmada:
  - `seaf_it2_run`: `SELECT, INSERT, UPDATE, DELETE` somente no schema literal `_2`.
  - `seaf_it2_migrate`: privilégios DML e DDL necessários somente no schema literal `_2`.
  - `USAGE` global não concede acesso global; não foram encontrados grants globais de dados nessas contas.
- `SELECT DATABASE()` teve sucesso em `_2` com ambas as contas.
- Nenhum probe foi executado com root. As credenciais restritas foram recuperadas em memória do arquivo DPAPI local; segredos não foram registrados neste documento.
- Hashes atuais coincidem com os registrados em 4C.10.3:
  - `.env`: `a26660a0f9cbd8606ea7c91b9bc1a000c603910337ab7986bdc7f72bf48f0f52`
  - `bdseaf.sql`: `26b28e46a9811fddbbb206a5a92395a27f48a704cef0acf63b8995bf217bed86`

## 2. Probes reais

As conexões foram feitas com as contas restritas e em modo somente leitura. O resultado de cada tentativa foi:

| Conta | Schema | Resultado |
|---|---|---|
| `seaf_it2_run` | `test` | **Falha não classificada** pelo guard; não aceita como 1044 |
| `seaf_it2_migrate` | `test` | **Falha não classificada**; não aceita como 1044 |

No erro observado com `seaf_it2_run`, o Prisma apresentou `P2010` e o adaptador expôs o código interno `45028`, em vez de um `errno`/`originalCode` 1044 ou 1049 reconhecível pelo extrator do guard. Não se concluiu que o servidor tenha retornado 1044: a evidência disponível não permite essa classificação.

Por fail-closed, **não foram tentados** `test_<identificador>`, banco de controle, os quatro bancos protegidos, `mysql` ou `phpmyadmin`. O erro 1049 não foi observado em conexão real; os testes unitários da Fase 4C.11 cobrem sua rejeição simulada.

## 3. Comportamento do guard e migrações

Uma chamada do guard real contra a conexão de `_2` foi bloqueada durante a leitura do histórico, antes dos probes, pois `_prisma_migrations` não existe. Essa ausência é o estado esperado antes da migração, mas significa que a validação real completa da campanha ainda não pode ser aprovada.

Para diagnosticar apenas a etapa dos probes, foi chamada a lógica do guard com conexão de controle injetada: identidade do servidor e grants vieram das consultas reais, mas o histórico de seis migrações foi simulado exclusivamente para alcançar essa etapa. O probe real de `test` falhou com erro não classificado e o guard interrompeu a sequência. Esse diagnóstico **não** representa aprovação da validação completa, nem substitui o histórico real exigido para executar a campanha.

Os seis arquivos locais continuam sendo os esperados pelo guard; os SHA-256 calculados são:

| Migração | SHA-256 local |
|---|---|
| `20261111170000_init_persistence` | `a5a4c2f4f6244de5fa12c2a6cba289c820ff202190a08cd964e32ef0279c18db` |
| `20261111171000_add_integrity_constraints` | `4a126d353386b6b566164276c538727345bb9793dc2de425179811f64d97466d` |
| `20261112110000_calendar_history_guards` | `c7c3e1e34938419397a0a26168e008194155914ba841154d757c614728c9b151` |
| `20261112233000_auth_mfa_sessions` | `364dbd98df3440577d732e904a0ad67d75064049df0c4fe40089fed625bac259` |
| `20261113001000_retire_mfa_preserve_history` | `cdaa45f6754630db3343adfc41660b992aa8aca74ad5d42c532f9b873caf0634` |
| `20261113120000_running_clock_attachments` | `83cac05665079bdddc1d6dbd7ffd97267a91d44771849ca8faf2ef1de18fb4de` |

Como o histórico real não existe, não há checksums aplicados a comparar. A verificação de checksums exigida para uma campanha com seis migrações não foi enfraquecida.

## 4. Integridade, limites e alterações

- A revalidação dos checksums dos quatro bancos protegidos não foi executada: a interrupção ocorreu no primeiro probe. Os checksums em [PHASE-4C103-ISOLATION.md](./PHASE-4C103-ISOLATION.md) são evidência histórica, não uma verificação desta fase.
- `.env` e `bdseaf.sql` foram apenas lidos para calcular os hashes acima; os valores coincidem com o registro anterior.
- Não houve criação ou alteração de bancos, schemas, tabelas, usuários ou grants.
- Não houve alteração de código/configuração, migração, fixture, execução dos 108 cenários, commit ou push.
- O worktree já continha alterações locais de fases anteriores; foram preservadas.

## 5. Problema e próxima condição

O formato de erro efetivamente produzido pelo Prisma/MariaDB para o probe de acesso negado não está sendo reconhecido pela classificação de 1044/1049 do guard. A falha atual é segura (bloqueia a campanha), mas impede comprovar o isolamento real e prosseguir.

É necessária uma correção autorizada do tratamento do erro, acompanhada por regressão baseada no formato real do adaptador, sem aceitar 1049, falhas de conexão ou erros inesperados como negação válida. Depois disso, será necessário repetir os probes reais completos e revalidar a integridade dos bancos protegidos antes de solicitar autorização de migração.

**Conclusão:** a Fase 4C.12 não está aprovada. Não aplicar as seis migrações; aguardar autorização para corrigir o guard e repetir o preflight.

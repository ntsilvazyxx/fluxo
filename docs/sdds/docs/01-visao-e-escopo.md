# SDD 01 — Visão, contexto e escopo

## Objetivo
Aplicação web institucional de gestão e acompanhamento de tarefas administrativas (ex.: preparar eventos, relatórios, documentos, revisões). **Não** é um sistema de chamados de suporte: usar sempre os termos *tarefa*, *atribuição*, *aceite*, *solicitação*, *execução* e *conclusão*.

## Atores
- **ADMIN MASTER**: administração de perfis, ativação/inativação, auditoria, parâmetros críticos e intervenção excepcional justificada; não executa tarefas de terceiros rotineiramente.
- **SECRETÁRIO**: visão global; cria, edita, atribui, reatribui, cancela, acompanha e decide solicitações; pode cadastrar contas operacionais, mas não alterar perfis/ativação.
- **GESTOR**: opera somente nas equipes sob sua gestão; cria tarefas, atribui a membros elegíveis, decide solicitações e gerencia calendários das equipes autorizadas.
- **TÉCNICO**: visualiza e executa apenas suas atribuições; não cria tarefas e não usa Kanban gerencial.
Secretário e Gestor também podem executar tarefas atribuídas a si próprios, sem permissão de executar por outro usuário.

## Funcionalidades incluídas
Usuários e equipes; tarefas e subtarefas de um nível; atribuição individual; aceite/rejeição; devolução e prorrogação; conclusão e cancelamento; ciclos de reabertura/restauração; prazos; cronômetros com expediente; calendário versionado; histórico/auditoria; imagens de conclusão; notificações internas e e-mail; dashboard e filtros; Kanban operacional.

## Fora do MVP
WhatsApp; anexos PDF/DOC e outros documentos; múltiplos responsáveis simultâneos; níveis profundos de subtarefas; colunas customizáveis no Kanban; pontuação automática de desempenho individual; aplicativo mobile nativo. PWA é possibilidade futura, não requisito de MVP.

## Princípios
- Autorização no backend para toda leitura e mutação.
- Uma única fonte de verdade para estado do ciclo, responsável atual e prazos.
- Histórico preservado: reabertura cria novo ciclo, não apaga o anterior.
- Data-limite é absoluta; horas de responsabilidade são calculadas no expediente da equipe.
- Acessibilidade, UX mobile-first e feedback explícito para conflitos.
- Operações críticas transacionais, auditáveis e idempotentes.

## Glossário
**Tarefa**: identidade permanente. **Ciclo**: execução numerada da tarefa. **Atribuição**: período em que um usuário foi responsável. **Solicitação**: pedido de devolução ou prorrogação. **Atrasada**: sinalização derivada, não status. **Subtarefa**: tarefa ligada a um ciclo da tarefa principal.

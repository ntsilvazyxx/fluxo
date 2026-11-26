# Revisão de UI/UX do SEAF

**Data:** 25 de novembro de 2026  
**Escopo:** sistema web React e sua experiência responsiva/mobile  
**Status:** revisão diagnóstica; nenhuma alteração de interface foi aplicada  
**Privacidade:** análise local, sem envio de código, telas privadas, credenciais ou dados operacionais a serviços externos

## 1. Resumo executivo

O SEAF possui uma base visual consistente, identidade institucional clara, controles de formulário com rótulos e estados básicos de erro, foco visível global e boa adaptação da tela de login. O teste automatizado da rota pública `/login` não encontrou violações axe nem overflow em 1280 x 800 e 390 x 844.

Os maiores riscos estão no fluxo autenticado:

1. **Recursos gerenciais importantes não são descobertos pela navegação:** existem rotas para Dashboard e Relatórios, mas não há links para elas na navegação principal.
2. **O Kanban mobile depende de uma grade fixa de 768 px e rolagem horizontal com scrollbar ocultada:** o usuário precisa descobrir por tentativa que há mais colunas fora da tela.
3. **O gerenciamento de foco dos diálogos é inconsistente:** há muitos elementos com `role="dialog"` e `aria-modal="true"`, mas vários fluxos simples não prendem o foco, não restauram o foco ao gatilho e não fecham com Escape.
4. **A hierarquia do aplicativo autenticado é horizontal e densa:** cabeçalho institucional, utilidades e navegação competem por altura e atenção, principalmente no celular.
5. **Estados e visualizações de dados nem sempre têm alternativa equivalente:** o carregamento de notificações é visualmente confundido com estado vazio, e os gráficos gerenciais não oferecem uma tabela/resumo completo dos dados.

Não existe aplicativo nativo Android, iOS, Flutter ou React Native neste repositório. Neste relatório, “mobile” significa o frontend web responsivo.

## 2. Evidências e limites

### Executado

- Inspeção de 80 arquivos frontend pelo verificador de cobertura de estados.
- Smoke test HTTP de `http://localhost:5173/login`: HTTP 200 e HTML não vazio.
- Capturas locais em 1280 x 800 e 390 x 844.
- axe-core na tela de login, nos dois viewports: **0 violações encontradas**.
- Verificação de overflow da tela de login: largura do conteúdo igual à largura do viewport nos dois tamanhos.
- Inspeção do código de rotas, shell, navegação, Kanban, dashboard, relatórios, notificações, usuários, equipes e modais de tarefas.

### Não executado

- Fluxos autenticados renderizados, porque não foi usada conta operacional nem criada sessão artificial contra o banco funcional.
- Testes com leitor de tela real, VoiceOver/TalkBack ou navegação completa somente por teclado.
- Lighthouse e métricas de desempenho.
- Testes com usuários reais, analytics ou tempo de conclusão de tarefas.
- Avaliação de app nativo, pois esse artefato não existe no repositório analisado.

### Artefatos de evidência

- `.artifacts/ui-ux-audit/login-desktop.png`
- `.artifacts/ui-ux-audit/login-mobile.png`
- `.artifacts/ui-ux-audit/login-a11y.json`
- `reports/ui-ux/state-coverage.json`
- `reports/ui-ux/visual-smoke/summary.json`

## 3. Pontos fortes atuais

- Identidade institucional clara na tela de login, sem excesso de elementos decorativos.
- Formulário de login simples, com rótulos visíveis, autocomplete e estados de envio/erro.
- Tokens centrais de cor, borda, tipografia e sombra.
- Foco visível global e suporte a `prefers-reduced-motion`.
- Controles principais com altura mínima de 44 px (`min-h-11`).
- Rotas protegidas por perfil e nomes acessíveis em vários botões de ícone.
- Estados de erro, vazio, desabilitado, envio e sucesso aparecem no código do produto.
- Kanban, relatórios e listas usam filtros próximos do conteúdo afetado.

## 4. Matriz de severidade

| Prioridade | Problema | Evidência | Impacto para o usuário | Recomendação | Verificação sugerida |
|---|---|---|---|---|---|
| P1 | Dashboard e Relatórios não aparecem na navegação principal | Fonte: `App.tsx` registra as rotas; `NavHorizontal.tsx` não contém os links | Gestores podem não descobrir recursos centrais ou depender de URL direta | Incluir os destinos conforme o perfil; em desktop usar rail/sidebar e em mobile colocar destinos menos frequentes em “Mais” | Teste de navegação por perfil e teste de encontrabilidade com 5 usuários |
| P1 | Kanban mobile exige rolagem horizontal em uma grade de 768 px e oculta a scrollbar | Fonte: `index.css` e `KanbanPage.tsx` | Colunas fora da tela ficam invisíveis; alternar status exige arrastar lateralmente e perde contexto | Em até 767 px, trocar a grade por abas/segmentos “Pendente”, “Em andamento” e “Concluída”; manter uma coluna visível por vez | Testar em 320, 390 e 430 px, zoom 200% e teclado |
| P1 | Modais não usam um contrato único de foco | Fonte: vários `role="dialog"`; apenas alguns componentes têm lógica explícita de Escape/foco | Usuários de teclado/leitor de tela podem alcançar o conteúdo atrás do modal ou perder o ponto de retorno | Criar componente `AccessibleDialog` com foco inicial, ciclo de Tab, Escape, restauração ao gatilho e bloqueio de scroll | Testes com Tab/Shift+Tab/Escape e axe em cada tipo de modal |
| P1 | Navegação horizontal no mobile não sinaliza overflow | Fonte: `overflow-x-auto` junto de `.no-scrollbar` | Itens podem ficar fora da tela sem pista visual; navegação exige precisão e descoberta | Preferir barra inferior com 3–5 destinos; usar “Mais” para funções secundárias; se mantiver scroll, mostrar fade/indicador | Captura em 320 px e teste de descoberta sem instrução |
| P2 | Cabeçalho móvel ocupa duas faixas persistentes | Fonte: `Header.tsx` com barra institucional + navegação, ambas dentro de header sticky | Reduz área útil do Kanban e pode encobrir foco/conteúdo em zoom | Usar app bar compacta no mobile e navegação inferior; preservar cabeçalho completo a partir de tablet/desktop | Testar altura útil, scroll e foco com zoom de 200–400% |
| P2 | Botões de notificações e sair têm 36–40 px | Fonte: `NotificationsMenu.tsx` e `UserMenu.tsx` (`min-h-9`/`min-h-10`) | Toques imprecisos, especialmente próximos entre si | Padronizar área interativa em 44 x 44 px, mesmo que o ícone permaneça com 18–20 px | Medição no DOM e teste em dispositivo touch |
| P2 | Notificações mostram “Sem notificações” durante carregamento inicial | Fonte: `NotificationsPage.tsx` usa `notifications.length === 0` sem separar `busy` | O sistema comunica vazio antes de saber o resultado, causando mudança brusca e dúvida | Ordem de estado: erro -> loading/skeleton -> vazio -> lista; preservar lista durante refetch | Testes de loading inicial, vazio real, refetch e erro |
| P2 | Gráficos não têm alternativa tabular completa | Fonte: `DashboardPage.tsx` usa Recharts; não há tabela ligada aos gráficos | Usuários de leitor de tela ou que não distinguem cores perdem valores e tendências | Adicionar resumo textual e tabela recolhível “Ver dados do gráfico”; não depender somente de cor/tooltip | axe + leitura com NVDA e comparação dos valores gráfico/tabela |
| P2 | Relatório mobile mantém tabela larga com scroll horizontal | Fonte: `ReportsPage.tsx` usa `overflow-x-auto` e tabela de seis colunas | Comparar tarefa, prazo, status e responsável requer arrastar repetidamente | Em mobile, renderizar lista de cartões compactos; manter tabela em desktop com cabeçalho sticky | Testar leitura de 20 itens em 390 px e tempo para localizar tarefa atrasada |
| P2 | Não há link “Pular para o conteúdo” | Fonte: shell e header sem skip link | Usuários de teclado repetem todos os itens do cabeçalho em cada rota | Adicionar skip link visível ao foco apontando para `main#main-content` | Primeiro Tab deve revelar o link e mover foco ao conteúdo |
| P2 | Feedback de falha de notificações é silencioso no menu | Fonte: `NotificationsMenu.tsx` captura e ignora erros de rede/marcação | Usuário pode acreditar que marcou como lida quando a ação falhou | Mostrar estado inline não intrusivo e oferecer “Tentar novamente”; manter estado anterior | Simular 500 e offline, confirmar mensagem e ausência de falso sucesso |
| P2 | Duplicação de telas/fluxos de detalhe aumenta inconsistência | Fonte: `TaskDetailPage`, `TaskDetailModal` e `TaskDetailShared` coexistem | Mesma tarefa pode ter ações, layout e foco diferentes conforme a entrada | Definir uma única composição compartilhada e dois invólucros: página e dialog, com o mesmo modelo de estados | Testes de paridade de ações e conteúdo entre página/modal |
| P3 | Login não oferece mostrar/ocultar senha ou aviso de Caps Lock | Screenshot + fonte | Pequena fricção e mais erros de digitação em dispositivos móveis | Adicionar alternância com nome acessível e aviso de Caps Lock sem expor o valor | Teste teclado, leitor de tela e mobile |
| P3 | Dashboard usa muitas superfícies com peso visual semelhante | Fonte/manual: cartões de KPI, alertas, quatro gráficos e métricas | A pergunta “o que exige ação agora?” não tem uma resposta dominante | Criar faixa “Atenção agora”, reduzir bordas/sombras secundárias e agrupar histórico abaixo | Teste de cinco segundos: identificar atraso e ação seguinte |

## 5. Navegação e arquitetura da informação

### Problema atual

A navegação principal contém Kanban, Arquivadas, Usuários (por perfil) e Equipes. Dashboard e Relatórios existem, porém ficam sem ponto de entrada. Notificações têm um ícone no cabeçalho e uma página separada. Esse modelo mistura:

- destinos principais;
- administração;
- utilidades globais;
- páginas analíticas.

### Estrutura recomendada

**Desktop/tablet largo**

1. Operação: Kanban, Minhas tarefas, Arquivadas.
2. Gestão: Dashboard, Relatórios.
3. Administração: Equipes, Usuários.
4. Utilidades no topo: Notificações, ajuda e perfil.

**Mobile**

- Barra inferior: Kanban, Minhas, Notificações, Mais.
- “Mais”: Dashboard, Relatórios, Arquivadas, Equipes, Usuários, perfil e sair.
- Mostrar apenas destinos permitidos pelo perfil.

## 6. Hierarquia visual

### Manter

- Azul institucional como cor primária.
- Tipografia de sistema e títulos compactos.
- Cartões brancos sobre fundo neutro.
- Campos e ações principais com dimensões estáveis.

### Melhorar

- Reservar azul preenchido para uma ação primária por região.
- Reduzir sombras profundas em tabelas e painéis operacionais.
- Usar bordas e superfícies neutras para agrupamento; cor semântica apenas para estado.
- Diferenciar “informação”, “atenção” e “ação” por estrutura, ícone e texto, não apenas por cor.
- Criar um cabeçalho de página padrão: breadcrumb opcional, título, descrição curta, ação primária e ações secundárias.

## 7. Wireframes propostos

### 7.1 Desktop - shell operacional

```text
+----------------------+----------------------------------------------------+
| SEAF                 | [Busca global]             [Sino] [Perfil]         |
+----------------------+----------------------------------------------------+
| OPERAÇÃO             | Kanban / Visão atual                            [+]|
|  ● Kanban            | [Buscar........] [Equipe] [Responsável] [Filtros]  |
|    Minhas tarefas    +----------------------------------------------------+
|    Arquivadas        | Atenção agora: 3 atrasadas · 2 aguardando aceite   |
|                      +----------------------------------------------------+
| GESTÃO               | Pendente       Em andamento       Concluída         |
|    Dashboard         | [cartão]       [cartão]           [cartão]          |
|    Relatórios        | [cartão]       [cartão]           [cartão]          |
|                      |                                                    |
| ADMINISTRAÇÃO        |                                                    |
|    Equipes           |                                                    |
|    Usuários          |                                                    |
+----------------------+----------------------------------------------------+
```

**Objetivo:** tornar todas as áreas encontráveis e manter o conteúdo operacional com largura útil.

### 7.2 Mobile - Kanban sem rolagem horizontal

```text
+----------------------------------+
| SEAF                    [Sino][A] |
| Kanban                    [+ Nova]|
| [Buscar tarefas................]  |
| [Equipe] [Responsável] [Filtros]  |
|                                  |
| [Pendente 8][Andamento 5][Fim 12]|
|                                  |
| #142  Atualizar cadastro          |
| Urgente · vence hoje              |
| Equipe X · Responsável Y          |
| [Abrir detalhes]                  |
|                                  |
| #139  Revisar processo            |
| Alta · amanhã                     |
+----------------------------------+
| [Kanban] [Minhas] [Avisos] [Mais]|
+----------------------------------+
```

**Objetivo:** uma coluna por vez, estado selecionado claro e ações alcançáveis com uma mão.

### 7.3 Mobile - detalhe como página/sheet focada

```text
+----------------------------------+
| [Voltar] Tarefa #142       [•••]  |
| Atualizar cadastro                |
| Urgente · Em andamento            |
|----------------------------------|
| Resumo | Conversa | Arquivos      |
|                                  |
| Responsável                       |
| Nome da pessoa                    |
| Prazo                             |
| 25/11/2026 17:00                  |
|                                  |
| Histórico e ações...              |
|                                  |
|----------------------------------|
| [Solicitar ajuste] [Concluir]     |
+----------------------------------+
```

**Objetivo:** reduzir modais empilhados, manter contexto e fixar as ações mais importantes no rodapé.

## 8. Plano de melhoria prático

### Fase 1 - 0 a 2 semanas: acesso e previsibilidade

1. Adicionar Dashboard e Relatórios à navegação conforme RBAC.
2. Adicionar skip link e `id` no conteúdo principal.
3. Criar `AccessibleDialog` e migrar primeiro Usuários, Equipes e confirmações do Kanban.
4. Separar loading/vazio/erro de Notificações.
5. Aumentar alvos do header para 44 x 44 px.
6. Criar testes de teclado para navegação e diálogos.

**Critérios de aceite:** todas as rotas autorizadas são alcançáveis pela UI; Tab não sai do modal; Escape fecha e restaura foco; nenhuma tela comunica vazio durante loading.

### Fase 2 - 3 a 6 semanas: mobile operacional

1. Substituir o Kanban horizontal por segmentos/abas em telas pequenas.
2. Implementar app bar compacta e barra inferior mobile.
3. Criar variante de cartões para Relatórios no mobile.
4. Transformar detalhes complexos em página full-screen no mobile.
5. Validar 320, 390, 430, 768 e 1280 px, além de zoom 200% e 400%.

**Critérios de aceite:** fluxo principal sem scroll bidimensional em 320 px; destinos principais acessíveis com uma mão; nenhuma ação essencial escondida sem sinal visual.

### Fase 3 - 7 a 12 semanas: dados, consistência e pesquisa

1. Adicionar alternativas tabulares aos gráficos.
2. Consolidar `TaskDetailPage`, `TaskDetailModal` e componentes compartilhados.
3. Padronizar cabeçalho de página, filtros, empty states e feedback de ações.
4. Executar testes moderados com usuários de cada perfil.
5. Medir: tempo para localizar tarefa, concluir ação, recuperar erro e encontrar relatório.

**Critérios de aceite:** paridade de conteúdo entre visualizações; gráficos compreensíveis sem cor/tooltip; redução mensurável do tempo e dos erros nas tarefas prioritárias.

## 9. Backlog recomendado

| Ordem | Entrega | Esforço estimado | Valor |
|---|---|---:|---:|
| 1 | Links de Dashboard/Relatórios + testes RBAC | P | Alto |
| 2 | Componente de diálogo acessível | M | Alto |
| 3 | Estados de Notificações | P | Médio/alto |
| 4 | Alvos de toque e skip link | P | Médio |
| 5 | Kanban mobile por segmentos | G | Muito alto |
| 6 | Navegação mobile inferior | M | Alto |
| 7 | Relatórios em cartões mobile | M | Alto |
| 8 | Tabelas/resumos dos gráficos | M | Alto |
| 9 | Consolidação de detalhes da tarefa | G | Alto |
| 10 | Testes com usuários e métricas de UX | M contínuo | Muito alto |

Legenda: P = pequeno, M = médio, G = grande.

## 10. Plano de validação

- **Automático:** axe nas rotas autenticadas, testes de foco, snapshots de estados e regressão responsiva.
- **Teclado:** Tab, Shift+Tab, Enter, Espaço e Escape nos fluxos centrais.
- **Leitor de tela:** NVDA + Chrome no desktop; TalkBack + Chrome no Android.
- **Visual:** 320 x 568, 390 x 844, 768 x 1024, 1280 x 800 e 1440 x 900.
- **Zoom/reflow:** 200% e 400%, verificando conteúdo não encoberto pelo header sticky.
- **Usabilidade:** cinco participantes por grupo de perfil para localizar, aceitar, concluir e consultar tarefas.

## 11. Referências de boas práticas

- [WCAG 2.2 - Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow)
- [WCAG 2.2 - Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum)
- [WAI-ARIA APG - Modal Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- [WAI - Complex Images and Charts](https://www.w3.org/WAI/tutorials/images/complex/)
- [Material Design 3 - App bars](https://m3.material.io/components/app-bars/)
- [Material Design 3 - Desktop adaptation](https://m3.material.io/foundations/desktop/components)

## 12. Risco residual

As conclusões sobre telas autenticadas são baseadas em código-fonte e julgamento especializado, não em screenshots ou DOM autenticado. Antes de implementar mudanças grandes, recomenda-se uma rodada curta de observação com dados sintéticos em ambiente isolado. O resultado do axe na tela de login não deve ser interpretado como certificação de acessibilidade do sistema inteiro.

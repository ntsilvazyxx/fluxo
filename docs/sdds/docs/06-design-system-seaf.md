# SDD 06 — Identidade visual SEAF e tokens

## Origem
Paleta extraída visualmente da logomarca fornecida pelo usuário (`assets/logomarca-seaf-original.png`): azul institucional escuro predominante, branco e preto de fundo da composição. **Não alterar o arquivo original**. O preto visto na imagem é parte do fundo da arte enviada e não precisa ser cor de fundo do sistema.

## Paleta aprovada para arquitetura (proposta)
| Token | HEX | Uso |
|---|---|---|
| `brand-900` | `#1A3281` | azul institucional principal, sidebar, cabeçalho |
| `brand-700` | `#25449B` | links e estados ativos em fundo claro |
| `brand-100` | `#E9EEFA` | seleção discreta, fundo de filtros |
| `surface` | `#FFFFFF` | cartões e painéis |
| `background` | `#F5F7FB` | fundo geral |
| `text` | `#17233C` | texto principal |
| `muted` | `#64748B` | texto secundário |
| `border` | `#DCE3EF` | bordas |
| `success` | `#217A55` | concluído/sucesso |
| `warning` | `#A8620A` | prazo próximo/atenção |
| `danger` | `#B42332` | atraso/cancelamento/erro |

**Ajuste pedido:** trocar qualquer tema genérico multicolorido ou dourado por **azul SEAF + branco + cinza claro**. Verde, âmbar e vermelho ficam restritos a significados funcionais, nunca como cores dominantes. Prioridade urgente pode usar vermelho apenas como indicador discreto.

## Diretrizes
- Visual institucional, moderno e sóbrio, com bastante espaço em branco e bordas suaves; evitar gradientes fortes, dourado e sombras pesadas.
- Contraste AA: validar pares reais de texto/fundo; não usar azul claro como texto pequeno sobre branco sem teste.
- Sidebar desktop azul institucional, área de conteúdo clara; mobile header azul e navegação compacta.
- Fonte sugerida: Inter ou fonte de sistema, com fallback; evitar dependência de arquivo de fonte privado.
- Raio padrão de cartões 10–12 px; espaçamentos em escala de 4/8 px; foco visível de alto contraste.
- Status e prioridades devem usar **texto + ícone**, nunca somente cor.
- Logomarca completa é horizontal e muito larga: no mobile não reduzi-la a ponto de ficar ilegível; preferir versão textual "SEAF · Gestão de Tarefas" no cabeçalho e marca completa em login/desktop. Qualquer recorte oficial exige aprovação institucional.

## Exemplo de variáveis CSS (referência, não código de produção)
```css
:root {
  --brand-primary: #1A3281;
  --brand-active: #25449B;
  --brand-soft: #E9EEFA;
  --page-bg: #F5F7FB;
  --surface: #FFFFFF;
  --text-primary: #17233C;
  --text-muted: #64748B;
  --border: #DCE3EF;
  --success: #217A55;
  --warning: #A8620A;
  --danger: #B42332;
}
```

## Aplicações
Login: marca institucional e formulário limpo. Kanban: colunas em fundo cinza suave, cartões brancos, chips azuis. Dashboard: números em azul e estados sem excesso de cor. Formulários: primário azul; destrutivo vermelho com confirmação.

# SEAF — Contrato da API de Anexos do Chat
## Fase 5.1.6 — Homologação Integrada e Especificação Canônica

Este documento define a especificação canônica, os contratos de requisição/resposta, os limites operacionais, as políticas de segurança e as diretrizes de integração para o consumo de anexos no módulo de Chat do **SEAF — Sistema de Gestão e Acompanhamento de Tarefas**.

---

## 1. Visão Geral e Arquitetura em Duas Etapas

O ciclo de vida dos anexos no Chat adota o padrão **Staging $\rightarrow$ Publicação Definitiva**, garantindo validação de integridade, inspeção de segurança e transacionalidade antes da persistência definitiva:

```
[ Frontend ]
     │
     │ 1. POST /attachments/staged (Multipart com clientUploadId)
     ▼
[ Storage Temporário: staging/ ] ── Validação MIME/Magic Number & Antivírus
     │
     │ Retorna: uploadId + status "STAGED" + expiresAt (TTL 24h)
     ▼
[ Frontend ]
     │
     │ 2. POST /messages (JSON com content + stagedAttachmentIds)
     ▼
[ Transação Atômica MariaDB ]
     ├── Valida propriedade do stagedId pelo usuário
     ├── Valida limites agregados (≤ 5 anexos, ≤ 50 MB)
     ├── Move arquivos físicos: staging/ -> attachments/{taskId}/
     └── Cria Message + ChatAttachment no banco (Status: PUBLISHED)
```

---

## 2. Autenticação, Autorização e Matriz RBAC

### 2.1. Credenciais
Todas as rotas exigem autenticação via:
- Header HTTP: `Authorization: Bearer <jwt_access_token>`, ou
- Cookie seguro `access_token` (HTTP-only, SameSite=Strict).

### 2.2. Matriz de Acesso RBAC e Histórico de Participação
O acesso às mensagens e anexos de uma tarefa é estritamente controlado pela política do Chat (`chat.policy.js`):

| Perfil / Papel | Permissão no Chat da Tarefa | Download de Anexos | Envio de Anexos |
| :--- | :--- | :--- | :--- |
| **ADMIN_MASTER** | Acesso irrestrito a todas as conversas | Permitido | Permitido |
| **SECRETARY / MANAGER** | Acesso irrestrito à secretaria/setor | Permitido | Permitido |
| **TECHNICIAN (Responsável Atual)** | Acesso total à tarefa atribuída | Permitido | Permitido |
| **TECHNICIAN (Participante Histórico)** | Histórico visível no intervalo de participação | Permitido (no período) | Bloqueado se desatribuído |
| **TECHNICIAN (Não Participante)** | Sem acesso à tarefa | **403 Proibido** | **403 Proibido** |
| **VIEWER / EXTERNAL** | Somente leitura de tarefas autorizadas | Permitido (se na tarefa) | **403 Proibido** |

> **Nota de Privacidade Histórica:** Técnicos que foram responsáveis pela tarefa no passado mantêm acesso às mensagens e anexos gerados durante o seu período de participação, mas não visualizam mensagens trocadas após sua desatribuição.

---

## 3. Limites Canônicos e Quotas Operacionais

| Parâmetro | Limite Oficial | Código de Violação |
| :--- | :--- | :--- |
| **Tamanho Máximo por Arquivo** | 20 MB (20.971.520 bytes) | `422 CHAT_ATTACHMENT_TOO_LARGE` |
| **Quantidade Máxima por Mensagem** | 5 arquivos | `422 CHAT_ATTACHMENT_LIMIT_EXCEEDED` |
| **Tamanho Agregado por Mensagem** | 50 MB (52.428.800 bytes) | `422 CHAT_ATTACHMENT_MESSAGE_TOO_LARGE` |
| **Quota Temporária de Staging (Usuário)** | 100 MB (104.857.600 bytes) | `429 CHAT_ATTACHMENT_QUOTA_EXCEEDED` |
| **Quota Temporária de Staging (Conversa)** | 250 MB (262.144.000 bytes) | `429 CHAT_ATTACHMENT_QUOTA_EXCEEDED` |
| **TTL de Staging (Uploads não publicados)** | 24 horas (1.440 minutos) | Expira e limpa via reconciliação |

---

## 4. Tipos de Arquivo Permitidos

Apenas **7 formatos** são estritamente permitidos no backend (`chat-attachment.validation.js`). Todos são validados por extensão e assinatura binária (*magic numbers*):

| Extensão | MIME Type Oficial | Assinatura / Validação |
| :--- | :--- | :--- |
| `.jpg` / `.jpeg` | `image/jpeg` | Magic bytes `FF D8 FF` |
| `.png` | `image/png` | Magic bytes `89 50 4E 47` |
| `.webp` | `image/webp` | Header `RIFF....WEBP` |
| `.pdf` | `application/pdf` | Magic bytes `%PDF-` |
| `.docx` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | Container ZIP `50 4B 03 04` + Word XML |
| `.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | Container ZIP `50 4B 03 04` + Excel XML |
| `.txt` | `text/plain` | Validação de charset UTF-8 sem bytes nulos |

> **Proibição Absoluta:** Arquivos SVG, GIF, CSV, PPTX, executáveis (`.exe`, `.bat`, `.sh`, `.cmd`), scripts (`.js`, `.php`, `.py`) e HTML são rejeitados com HTTP 422 `CHAT_ATTACHMENT_EXTENSION_NOT_ALLOWED`.

---

## 5. Endpoints da API

### 5.1. Upload para Staging (Etapa 1)
- **Método / Path:** `POST /api/v1/tasks/:taskId/chat/attachments/staged`
- **Content-Type:** `multipart/form-data`
- **Campos do Formulário:**
  - `attachment` ou `file`: Arquivo binário a ser enviado.
  - `clientUploadId`: UUID v4 gerado pelo frontend (para idempotência).

#### Exemplo de Resposta — `201 Created`
```json
{
  "data": {
    "id": "c1f7b029-3714-41d8-a89a-65369bb409d5",
    "clientUploadId": "a90df1b3-469b-4e1a-8c54-72e272bbbe13",
    "originalName": "relatorio-campo.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 2048500,
    "status": "STAGED",
    "expiresAt": "2026-11-24T14:00:00.000Z"
  }
}
```

---

### 5.2. Detalhes de Anexo em Staging
- **Método / Path:** `GET /api/v1/tasks/:taskId/chat/attachments/staged/:uploadId`

#### Exemplo de Resposta — `200 OK`
```json
{
  "data": {
    "id": "c1f7b029-3714-41d8-a89a-65369bb409d5",
    "originalName": "relatorio-campo.pdf",
    "mimeType": "application/pdf",
    "sizeBytes": 2048500,
    "status": "STAGED",
    "expiresAt": "2026-11-24T14:00:00.000Z"
  }
}
```

---

### 5.3. Cancelamento de Upload em Staging
- **Método / Path:** `DELETE /api/v1/tasks/:taskId/chat/attachments/staged/:uploadId`
- **Ação:** Remove o arquivo físico do disco imediatamente e marca o registro como `EXPIRED`.

#### Exemplo de Resposta — `200 OK`
```json
{
  "data": {
    "id": "c1f7b029-3714-41d8-a89a-65369bb409d5",
    "status": "EXPIRED"
  }
}
```

---

### 5.4. Publicação da Mensagem com Anexos (Etapa 2)
- **Método / Path:** `POST /api/v1/tasks/:taskId/chat/messages`
- **Content-Type:** `application/json`
- **Payload:**
```json
{
  "clientMessageId": "8f88ce12-1f48-43f1-b9cb-9be4d6a69ef1",
  "content": "Segue o relatório consolidado e a planilha de medição.",
  "stagedAttachmentIds": [
    "c1f7b029-3714-41d8-a89a-65369bb409d5",
    "e2d8c119-4825-42e9-b90b-76470cc510e6"
  ]
}
```

#### Semântica de Resposta
- **`201 Created`:** A mensagem e todos os anexos foram processados e publicados de imediato com status `PUBLISHED`.
- **`202 Accepted`:** A mensagem foi registrada como `PENDING` e aguarda processamento assíncrono (ex.: escaneamento por antivírus em fila).

#### Exemplo de Resposta — `201 Created`
```json
{
  "data": {
    "id": "3b7b2520-21a4-4ea0-9842-83b3558c4222",
    "taskId": "7a356396-f94d-4e9d-9cf9-fb1935e2363b",
    "senderId": "5e13589b-734e-4f11-8fc2-a28efbc2e911",
    "senderName": "Nathan Silva",
    "content": "Segue o relatório consolidado e a planilha de medição.",
    "status": "PUBLISHED",
    "createdAt": "2026-11-23T14:02:15.000Z",
    "attachments": [
      {
        "id": "d047e112-98aa-4752-9477-d7790b1c9443",
        "originalName": "relatorio-campo.pdf",
        "mimeType": "application/pdf",
        "sizeBytes": 2048500,
        "status": "PUBLISHED",
        "downloadUrl": "/api/v1/tasks/7a356396-f94d-4e9d-9cf9-fb1935e2363b/chat/messages/3b7b2520-21a4-4ea0-9842-83b3558c4222/attachments/d047e112-98aa-4752-9477-d7790b1c9443/download"
      }
    ]
  }
}
```

---

### 5.5. Listagem de Mensagens do Chat
- **Método / Path:** `GET /api/v1/tasks/:taskId/chat/messages`
- **Query Params:**
  - `limit`: Inteiro (padrão 50, máx 100).
  - `cursor`: ID da mensagem para paginação baseada em cursor.
  - `direction`: `before` (padrão) ou `after`.

#### Exemplo de Resposta — `200 OK`
```json
{
  "data": {
    "items": [
      {
        "id": "3b7b2520-21a4-4ea0-9842-83b3558c4222",
        "taskId": "7a356396-f94d-4e9d-9cf9-fb1935e2363b",
        "senderId": "5e13589b-734e-4f11-8fc2-a28efbc2e911",
        "senderName": "Nathan Silva",
        "content": "Segue o relatório consolidado.",
        "status": "PUBLISHED",
        "createdAt": "2026-11-23T14:02:15.000Z",
        "attachments": [
          {
            "id": "d047e112-98aa-4752-9477-d7790b1c9443",
            "originalName": "relatorio-campo.pdf",
            "mimeType": "application/pdf",
            "sizeBytes": 2048500,
            "status": "PUBLISHED",
            "downloadUrl": "/api/v1/tasks/7a356396-f94d-4e9d-9cf9-fb1935e2363b/chat/messages/3b7b2520-21a4-4ea0-9842-83b3558c4222/attachments/d047e112-98aa-4752-9477-d7790b1c9443/download"
          }
        ]
      }
    ],
    "pagination": {
      "limit": 50,
      "cursor": "3b7b2520-21a4-4ea0-9842-83b3558c4222",
      "hasMore": false,
      "totalCount": 1
    }
  }
}
```

---

### 5.6. Download Seguro e Streaming de Anexo
- **Método / Path:** `GET /api/v1/tasks/:taskId/chat/messages/:messageId/attachments/:attachmentId/download`
- **Operação:** Streaming direto do disco via `Stream.Readable` do Node.js sem acúmulo em memória RAM.

#### Headers Obrigatórios de Resposta
```http
HTTP/1.1 200 OK
Content-Type: application/pdf
Content-Disposition: attachment; filename="relatorio-campo.pdf"; filename*=UTF-8''relatorio-campo.pdf
Content-Length: 2048500
X-Content-Type-Options: nosniff
Cache-Control: private, no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0
```

---

## 6. Concorrência, Idempotência e Bloqueios Pessimistas

1. **`clientUploadId` e `clientMessageId`:** Ambos devem ser gerados como UUID v4 no frontend. Se o cliente reenviar uma requisição idêntica com o mesmo UUID, o backend retorna a entidade original já processada sem duplicar arquivos ou registros.
2. **Locks Pessimistas (`FOR UPDATE`):**
   - Ao publicar a mensagem, o backend bloqueia as linhas da tabela `ChatMessageStagedAttachment` com `SELECT ... FOR UPDATE`.
   - Impede que múltiplos cliques ou requisições concorrentes tentem consumir o mesmo anexo temporário em mensagens diferentes.
3. **Validação de Propriedade:** Um usuário não pode consumir no payload de mensagem um `stagedAttachmentId` enviado por outro usuário (retorna `404/422`).

---

## 7. Política de Antivírus e Comportamento Fail-Closed

1. **Driver ClamAV:** O backend possui o driver `createClamAvChatAttachmentScanner` configurado com política **fail-closed**.
2. **Detecção de Ameaça:** Se o scanner acusar infecção (`Infected`), o upload é rejeitado com `422 CHAT_ATTACHMENT_REJECTED`.
3. **Falha do Scanner:** Se o binário `clamscan` ou daemon do antivírus estiver indisponível e configurado como obrigatório, o sistema bloqueia o upload com `503 CHAT_ATTACHMENT_SCANNER_UNAVAILABLE`.
4. **Ressalva de Ambiente:** No ambiente de desenvolvimento local sem o daemon do ClamAV ativo, o scanner é executado em modo simulado/mock nos testes de unidade e homologação. A integração com daemon ClamAV real em produção é um requisito de infraestrutura que será ativado no deploy.

---

## 8. Tabela Canônica de Erros HTTP

| Código HTTP | Código Interno do Erro | Significado Técnico | Sugestão de Mensagem para o Usuário |
| :--- | :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Parâmetros ou campos obrigatórios ausentes | "Por favor, revise os dados informados." |
| `401` | `UNAUTHORIZED` | Token ausente, inválido ou expirado | "Sessão expirada. Faça login novamente." |
| `403` | `FORBIDDEN` | Usuário sem permissão nesta conversa | "Você não tem permissão para acessar o chat desta tarefa." |
| `404` | `NOT_FOUND` | Tarefa, mensagem ou anexo não encontrado | "O arquivo ou mensagem solicitada não foi encontrada." |
| `422` | `CHAT_ATTACHMENT_TOO_LARGE` | Arquivo excede 20 MB | "O arquivo selecionado é maior que o limite de 20 MB." |
| `422` | `CHAT_ATTACHMENT_LIMIT_EXCEEDED` | Mais de 5 arquivos por mensagem | "Você pode anexar no máximo 5 arquivos por mensagem." |
| `422` | `CHAT_ATTACHMENT_MESSAGE_TOO_LARGE` | Soma dos arquivos excede 50 MB | "O tamanho total dos arquivos excede o limite de 50 MB por mensagem." |
| `422` | `CHAT_ATTACHMENT_EXTENSION_NOT_ALLOWED` | Extensão não autorizada (ex: svg, exe) | "Formato de arquivo não suportado. Envie apenas JPG, PNG, WEBP, PDF, DOCX, XLSX ou TXT." |
| `422` | `CHAT_ATTACHMENT_REJECTED` | Arquivo rejeitado pelo antivírus | "O arquivo foi recusado por políticas de segurança." |
| `429` | `CHAT_ATTACHMENT_QUOTA_EXCEEDED` | Quota de staging atingida (100MB/250MB) | "Limite temporário de envio atingido. Aguarde a publicação das mensagens pendentes." |
| `503` | `CHAT_ATTACHMENT_SCANNER_UNAVAILABLE` | Scanner de vírus indisponível | "Serviço de validação de arquivos temporariamente indisponível. Tente novamente mais tarde." |

---

## 9. Diretrizes de Segurança para o Frontend

1. **Nunca Renderizar SVG ou HTML:** A interface **jamais** deve renderizar arquivos como SVG inline ou HTML em iframes não isolados.
2. **Forçar Download Seguro:** O download deve sempre utilizar o atributo `download` ou abrir a URL do endpoint de streaming, aproveitando os headers `nosniff` e `attachment`.
3. **Validação Antecipada no Cliente:** O componente de upload do React deve validar tamanho (`<= 20 MB`) e tipo antes de disparar a requisição de staging, melhorando a experiência do usuário.
4. **Sanitização de Nomes:** Nomes de arquivo contendo caracteres especiais ou sequências de *path traversal* (`../`) são normalizados pelo backend e devem ser escapados pelo frontend na exibição visual.

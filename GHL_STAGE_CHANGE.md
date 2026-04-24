# GHL → Supabase: sincronização quando muda de stage (6 status)

Quando alguém arrasta uma Opportunity no pipeline do GHL, o status do ticket
no Supabase atualiza automaticamente. O GHL dispara um workflow e esse
workflow faz um **POST numa RPC function** do Supabase (não PATCH, porque o
Custom Webhook do GHL não oferece PATCH).

---

## Visão geral

```
[Usuário arrasta card no pipeline]
        │
        ▼
[Workflow "Ticket Stage Sync"] ── If/Else por stage ──► [Webhook POST Supabase RPC]
                                                              │
                                                              ▼
                                        [função update_ticket_status faz UPDATE]
                                                              │
                                                              ▼
                                        [Supabase Realtime atualiza dashboard]
```

Mapeamento **Stage do Pipeline ↔ status no Supabase**:

| Stage do Pipeline | status no Supabase |
|-------------------|--------------------|
| Novo              | `novo`             |
| Em Análise        | `em_analise`       |
| Em Andamento      | `em_andamento`     |
| Aguardando        | `aguardando`       |
| Solucionado       | `solucionado`      |
| Fechado           | `fechado`          |

---

## Pré-requisitos (em ordem)

1. **Rodar o `migration_v6.sql`** no SQL Editor do Supabase (cria a função
   `update_ticket_status`). Faz isso UMA vez.
2. **Pipeline do GHL** com **6 stages** (criados no próximo passo).
3. **Ter em mãos:**
   - `VITE_SUPABASE_URL` (ex: `https://abcd1234.supabase.co`) — pega na Vercel
   - `VITE_SUPABASE_ANON_KEY` (chave anon do Supabase) — pega na Vercel

---

## Passo 1 — Criar os 6 stages no pipeline

1. GHL → **Opportunities → Pipelines** (ou Settings → Pipelines)
2. Escolhe o pipeline **CS** (o que você já usa)
3. Confere se os 6 stages existem na ordem abaixo. Se faltar algum,
   clica em **Add Stage**:
   - Novo
   - Em Análise
   - Em Andamento
   - Aguardando
   - Solucionado
   - Fechado
4. **Save**

> OBS: no workflow atual (Inbound Ticklet), o ticket cai no stage **Novo**.
> Se o stage inicial hoje tá com outro nome ("Novo Ticket"), ou você
> renomeia pra "Novo", ou ajusta o nome na condição do If/Else no passo 3.

---

## Passo 2 — Custom Field "Numero Ticket" + atualizar o workflow Inbound Ticklet

O workflow de sync precisa saber o `numero_ticket` pra atualizar o ticket
certo. A gente guarda ele num campo customizado **da Opportunity** (NÃO do
Contact — em Contact, o valor seria sobrescrito a cada novo ticket do mesmo
cliente).

### 2.1 Criar o custom field

1. Settings → **Custom Fields**
2. **+ Add Custom Field**:
   - **Name:** `Numero Ticket`
   - **Field Type:** `Single line`
   - **Add to object:** `Opportunity`  ← importante!
3. **Save**
4. Anota o **Key** que aparece (`numero_ticket`).

### 2.2 Popular o campo quando criar a Opportunity

1. Abre o workflow **Inbound Ticklet** (o que já funciona)
2. Clica na ação **Create Opportunity**
3. **+ Add field** → escolhe **Numero Ticket**
4. No valor, cola:
   ```
   {{inboundWebhookRequest.record.numero_ticket}}
   ```
5. **Save action** → **Publish** o workflow

> **Pras Opportunities antigas** (sem o custom field preenchido): ou você
> edita na mão uma por uma, ou apaga e cria de novo abrindo um ticket novo
> no app. Pra tickets criados a partir de agora fica automático.

---

## Passo 3 — Criar o workflow "Ticket Stage Sync"

### 3.1 Criar e configurar trigger

1. **Automation → Workflows → + Create Workflow → Start from Scratch**
2. Nome: `Ticket Stage Sync`
3. **Add New Trigger** → busca **Pipeline Stage Changed**
4. Configura:
   - **Workflow Trigger Name:** `Stage changed`
   - **In pipeline:** escolhe **CS**
   - **Move to stage:** deixa em branco (dispara em qualquer mudança de stage)
5. **Save Trigger**

### 3.2 Adicionar If/Else com 6 branches

1. **+ Add Action → If/Else**
2. Cria 6 branches (clica no **+** pra adicionar). Em cada um, a condição é:
   `Opportunity` → `Current stage` → `is` → `<nome do stage>`
3. Os 6 branches ficam assim:
   - Branch 1: Current stage is **Novo**
   - Branch 2: Current stage is **Em Análise**
   - Branch 3: Current stage is **Em Andamento**
   - Branch 4: Current stage is **Aguardando**
   - Branch 5: Current stage is **Solucionado**
   - Branch 6: Current stage is **Fechado**

### 3.3 Adicionar Custom Webhook em cada branch

Em cada uma das 6 branches, adiciona uma ação **Custom Webhook**:

**Configuração comum a TODAS as branches:**

- **Method:** `POST`
- **URL:**
  ```
  https://SEU_PROJETO.supabase.co/rest/v1/rpc/update_ticket_status
  ```
  (troca `SEU_PROJETO` pelo subdomínio da `VITE_SUPABASE_URL`)
- **Headers** (os mesmos em todas):
  ```
  apikey:         SUA_ANON_KEY
  Authorization:  Bearer SUA_ANON_KEY
  Content-Type:   application/json
  ```

**A ÚNICA coisa que muda por branch é o Body (JSON):**

| Branch          | Body                                                                                     |
|-----------------|------------------------------------------------------------------------------------------|
| Novo            | `{"p_numero": "{{opportunity.numero_ticket}}", "p_status": "novo"}`                      |
| Em Análise      | `{"p_numero": "{{opportunity.numero_ticket}}", "p_status": "em_analise"}`                |
| Em Andamento    | `{"p_numero": "{{opportunity.numero_ticket}}", "p_status": "em_andamento"}`              |
| Aguardando      | `{"p_numero": "{{opportunity.numero_ticket}}", "p_status": "aguardando"}`                |
| Solucionado     | `{"p_numero": "{{opportunity.numero_ticket}}", "p_status": "solucionado"}`               |
| Fechado         | `{"p_numero": "{{opportunity.numero_ticket}}", "p_status": "fechado"}`                   |

> Dica: configura o webhook de uma branch inteira, depois **duplica** a ação
> pra as outras branches e troca só o `p_status` no body. Mais rápido que
> digitar 6 vezes.

### 3.4 Publicar

- **Save action** em cada webhook
- **Save** do workflow
- Toggle **Draft → Publish** no canto superior direito

---

## Passo 4 — Testar

1. Abre o app → cria um ticket novo (anota o número, ex: `TK-2026-0030`)
2. Confirma no dashboard admin que o status tá **Novo**
3. Vai no pipeline do GHL → acha a Opportunity `[TK-2026-0030]...`
4. Arrasta pra **Em Andamento**
5. Em 1-2 segundos:
   - Dashboard admin reflete **Em Andamento** (se a aba tiver aberta, muda na hora via Realtime)
   - Dashboard cliente também atualiza
6. Arrasta pra outros stages pra testar cada um

---

## Troubleshooting

### Nada acontece quando arrasto

1. GHL → Workflow "Ticket Stage Sync" → **Execution Logs**
2. Deve aparecer uma execução com cada webhook. Se não aparecer:
   - Workflow tá em **Draft**? Publica.
   - Trigger tá no pipeline certo? Confere.

### Webhook roda mas ticket não atualiza

Clica em **View Details** da ação do webhook e olha o **status code**:

- **`401 / 403`:** chave `apikey` ou `Authorization` errada/faltando. A
  mesma `anon key` tem que estar nos DOIS headers.
- **`404`:** endpoint errado. Confere se a URL termina com
  `/rest/v1/rpc/update_ticket_status` e se o `migration_v6.sql` já rodou
  no Supabase.
- **`200 / 204` mas sem mudança no banco:** o body foi ok mas o
  `numero_ticket` não achou nenhum ticket. Isso normalmente é porque o
  custom field `Numero Ticket` da Opportunity tá vazio (Opportunity foi
  criada antes de você configurar o Passo 2). Solução: edita a Opportunity
  na mão e preenche o campo, ou cria um ticket novo (com o workflow Inbound
  Ticklet já atualizado).
- **`400 / 500`:** body JSON malformado ou status inválido. Confere:
  - aspas duplas (`"`), não simples
  - campos exatos: `p_numero` e `p_status`
  - valor do `p_status` bate exatamente com um dos 6 aceitos (minúsculo,
    underline, sem acento)

### Funciona nos stages novos mas não nos antigos

Opportunities antigas não têm o custom field `Numero Ticket` preenchido.
Edita na mão ou recria o ticket.

### O merge `{{opportunity.numero_ticket}}` não parece funcionar

Pode ser que o field key seja diferente. Pra descobrir:
1. Settings → Custom Fields → abre o campo **Numero Ticket**
2. Confere o **Key** (deve ser `numero_ticket`) e o **Add to object**
   (tem que ser **Opportunity**, não Contact)
3. Se o key for outro, usa ele:
   ```json
   {"p_numero": "{{opportunity.seu_key_aqui}}", "p_status": "novo"}
   ```

---

## Por que POST numa RPC e não PATCH direto?

O Custom Webhook do GHL só oferece `POST`, `GET`, `PUT`, `DELETE` — não tem
`PATCH`. A documentação do Supabase recomenda PATCH pra updates, mas a
gente contorna criando uma função Postgres (`update_ticket_status`) e
chamando ela via POST no endpoint de RPC do PostgREST
(`/rest/v1/rpc/<nome>`). Funcionalmente é equivalente e tem a vantagem de
validar o status dentro da própria função.

---

## Segurança (nota)

Estamos usando a `anon key` do Supabase direto no workflow. Ok no nosso
caso porque a função `update_ticket_status` valida o status e só mexe na
tabela `tickets`. Se quiser endurecer depois:

- Adiciona um parâmetro `p_secret` na função e exige ele bater com uma
  string guardada
- Ou move a chamada pra uma Edge Function que valida um token antes de
  invocar a RPC

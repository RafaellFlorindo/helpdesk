# Integração com Pipeline do GoHighLevel

Cada vez que um ticket novo é aberto, o app dispara um webhook (POST JSON)
para a URL configurada em `VITE_GHL_WEBHOOK_URL`.

No GHL, um **Workflow** recebe esse webhook e cria uma **Opportunity**
dentro do pipeline que você quiser na subconta admin.

---

## Passo a passo

### 1. Criar o Workflow no GHL

1. Abra a **subconta admin** (onde o pipeline central vai ficar)
2. Vá em **Automation → Workflows → Create Workflow → Start from Scratch**
3. **Trigger:** `Inbound Webhook`
   - Clique em "Copy URL" — essa é a URL que vamos colocar no app
   - Clique em "Save Trigger"
4. Abra outra aba e gere um ticket de teste no app — assim o GHL recebe
   um payload de exemplo e consegue mapear os campos. (Você pode colar
   o JSON de exemplo abaixo manualmente em "Sample Request" também.)

### 2. Adicionar a ação "Create Opportunity"

Ainda dentro do workflow:

1. **+ Add Action → Create/Update Opportunity**
2. Configure:
   - **Pipeline:** escolha o pipeline onde os tickets devem cair
   - **Stage:** escolha o estágio inicial (ex: "Novo")
   - **Opportunity Name:** `{{inboundWebhookRequest.opportunity_name}}`
     (ex: `[TK-2026-0015] Bug na instância`)
   - **Status:** `Open`
   - **Contact:** crie/atualize o contato usando
     `{{inboundWebhookRequest.email_cliente}}` como identificador
     e `{{inboundWebhookRequest.nome_cliente}}` como nome
3. (Opcional) No passo "Create/Update Contact", adicione campos customizados
   pra guardar `location_name`, `numero_ticket`, `prioridade_label`, etc.
4. **Save** e **Publish** o workflow.

### 3. Configurar a URL do webhook no app

Na Vercel:

1. Abre o projeto **helpdesk-one-orcin** → **Settings → Environment Variables**
2. Adiciona uma nova variável:
   - **Name:** `VITE_GHL_WEBHOOK_URL`
   - **Value:** (URL que você copiou no passo 1.3)
   - **Environments:** Production, Preview, Development (marca os três)
3. Clica em **Save**
4. Vá em **Deployments** → no último deploy, clica nos três pontinhos
   → **Redeploy** (sem isso a env var não entra em vigor)

### 4. Testar

Abre o app logado por qualquer subconta:

```
https://helpdesk-one-orcin.vercel.app/cliente?location_id=TESTE&location_name=Subconta%20de%20Teste&email=teste@teste.com&nome=Rafael
```

Clica em **Novo Ticket**, preenche, e salva. Em poucos segundos a Opportunity
deve aparecer no pipeline configurado, na subconta admin.

---

## Exemplo do payload enviado

```json
{
  "numero_ticket":    "TK-2026-0015",
  "titulo":           "Bug na instância",
  "descricao":        "Descrição completa do problema aqui...",
  "categoria":        "bug",
  "categoria_label":  "Bug",
  "prioridade":       "urgente",
  "prioridade_label": "Urgente",
  "status":           "novo",
  "status_label":     "Novo",
  "email_cliente":    "cliente@fulano.com",
  "nome_cliente":     "Fulano",
  "location_id":      "xYz123Abc",
  "location_name":    "Cliente Fulano LTDA",
  "sla_deadline":     "2026-04-24T17:36:00.000Z",
  "created_at":       "2026-04-23T17:36:00.000Z",
  "opportunity_name": "[TK-2026-0015] Bug na instância"
}
```

No workflow, acesse qualquer campo com `{{inboundWebhookRequest.NOME_DO_CAMPO}}`.

---

## Se der errado

**A Opportunity não aparece:**
- Confere se a env var `VITE_GHL_WEBHOOK_URL` está na Vercel e se houve
  redeploy depois de adicionar
- Abre o console do navegador (F12) ao abrir um ticket — se aparecer
  "[Ticket] Falha ao enviar webhook para GHL:" a requisição foi bloqueada
- No GHL Workflow, olhe "Enrollment History" pra ver se o webhook foi recebido

**O workflow recebe mas não cria Opportunity:**
- Verifique se o campo "Pipeline" e "Stage" foram preenchidos
- Verifique se o contato está sendo criado antes da Opportunity
- A Opportunity precisa de um contato, senão falha silenciosamente

**CORS bloqueou o POST:**
- O GHL Inbound Webhook aceita CORS, então isso normalmente não
  acontece. Se acontecer, considere mover o POST pra uma Edge Function
  do Supabase ou pra um trigger no banco.

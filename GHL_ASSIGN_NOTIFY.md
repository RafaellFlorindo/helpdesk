# GHL: Roteamento por Categoria + Notificação

Quando chega um ticket novo, o responsável correto é atribuído à Opportunity
(conforme a categoria escolhida pelo cliente) e recebe uma notificação.

Tudo isso é configurado no workflow **Inbound Ticklet** que já existe —
sem mudanças no código nem no banco.

---

## Fluxo

```
[Database Webhook dispara do Supabase]
        │
        ▼
[Create Contact]
        │
        ▼
[Create Opportunity]
        │
        ▼
[If/Else por categoria]
    ├─ bug              → Assign User A → Notify User A
    ├─ duvida           → Assign User B → Notify User B
    ├─ problema_tecnico → Assign User A → Notify User A
    ├─ customizacao     → Assign User C → Notify User C
    ├─ sugestao         → Assign User B → Notify User B
    └─ outro            → Assign Default → Notify Default
```

Se duas categorias vão pra mesma pessoa, pode repetir o usuário em mais
de um branch — ou agrupar as condições com "OR" no mesmo branch.

---

## Passo 1 — Abrir workflow

Automation → Workflows → **Inbound Ticklet** → Edit

---

## Passo 2 — Adicionar If/Else depois do Create Opportunity

Clica no **+** logo abaixo da ação **Create Opportunity** → escolhe **If/Else**.

Cria 6 branches. Em cada um, a condição é:

- **Field:** `Inbound Webhook Data` → `record.categoria`
- **Operator:** `is`
- **Value:** um dos valores abaixo

| Branch              | Value (record.categoria is) |
|---------------------|-----------------------------|
| Bug                 | `bug`                       |
| Dúvida              | `duvida`                    |
| Problema Técnico    | `problema_tecnico`          |
| Customização        | `customizacao`              |
| Sugestão            | `sugestao`                  |
| Outro               | `outro`                     |

> IMPORTANTE: os valores são sempre minúsculos e sem acento, igual o
> schema do banco. Se digitar "Bug" com B maiúsculo a condição não bate.

---

## Passo 3 — Em cada branch: Assign Opportunity User

Dentro de cada branch, **+ Add Action** → busca **Assign Opportunity User**:

- **Assigned User:** escolhe o responsável pela categoria
- **Save action**

---

## Passo 4 — Em cada branch: notificação

Logo depois do assign, **+ Add Action**. Escolhe uma (ou as duas):

### Opção A — In-App Notification

- Action: **Send Internal Notification**
- To User: **Assigned User** (dinâmico — usa o usuário que acabou de ser atribuído)
- Título:
  ```
  Novo Ticket: {{inboundWebhookRequest.record.numero_ticket}}
  ```
- Mensagem:
  ```
  Novo ticket chegou pra você.

  Número: {{inboundWebhookRequest.record.numero_ticket}}
  Cliente: {{inboundWebhookRequest.record.email_cliente}}
  Subconta: {{inboundWebhookRequest.record.location_name}}
  Categoria: {{inboundWebhookRequest.record.categoria}}
  Assunto: {{inboundWebhookRequest.record.titulo}}
  ```

### Opção B — Email

- Action: **Send Email**
- To: email do responsável (pode ser `{{assigned_user.email}}` se a merge tag existir no teu GHL, senão escolhe manualmente)
- Subject:
  ```
  [Novo Ticket] {{inboundWebhookRequest.record.titulo}}
  ```
- Body: mesma mensagem da Opção A

> Recomendado: In-App + Email. Assim a pessoa é avisada dentro do GHL e
> também fora dele (por email), mesmo se não tiver o CRM aberto.

---

## Passo 5 — Save + Publish

- **Save action** em cada ação
- **Save** do workflow
- Toggle **Draft → Publish** no canto superior direito

---

## Atalho de produtividade

Configura 1 branch inteiro (Assign + Notify) primeiro. Depois, em vez de
refazer tudo nos outros 5, clica no ícone de **duplicar ação** e arrasta a
cópia pra cada branch. Só troca o **Assigned User**.

---

## Testar

1. Abre o app → cria um ticket novo com categoria **Bug**
2. O responsável por "Bug" deve receber a notificação:
   - In-app: aparece no sininho 🔔 ou em Notifications
   - Email: chega na caixa de entrada
3. Abre a Opportunity no pipeline → confere o **Assigned User**
4. Repete com outras categorias pra testar cada branch

---

## Troubleshooting

### Ninguém recebe notificação

1. Workflow tá em **Publish**? (não Draft)
2. Execution Logs mostra que o If/Else entrou no branch certo? Se entrou no
   branch errado (ou em nenhum), confere se o valor em `record.categoria`
   bate exatamente com o valor do banco (sempre minúsculo, sem acento).

### Todos os tickets caem no mesmo branch

A condição do If/Else tá usando o campo errado. Confirma que é
`Inbound Webhook Data → record.categoria` e não outra coisa.

### Ticket sem categoria não dispara nenhum branch

Adiciona um branch final **ELSE** (default) sem condição pra capturar
tickets com `categoria` vazia. Atribui ao responsável geral.

### Quero agrupar categorias

No If/Else, em vez de 6 branches, cria branches combinados:

- Branch 1: record.categoria is `bug` **OR** record.categoria is `problema_tecnico` → User A
- Branch 2: record.categoria is `duvida` **OR** record.categoria is `sugestao` → User B
- etc.

---

## Mudar responsável depois

Se mudar quem cuida de cada categoria:
1. Abre o workflow Inbound Ticklet
2. Vai no branch da categoria correspondente
3. Edita a ação **Assign Opportunity User** → troca o Assigned User
4. Edita também a notificação se estiver hardcoded
5. Save + Publish

Não afeta tickets já existentes — só vale pra tickets novos.

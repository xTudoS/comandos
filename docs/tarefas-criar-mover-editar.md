# Tarefas — Criar, Mover e Editar

> Detalhamento dos três fluxos centrais de tarefas no **Comando**, do ponto de vista do
> usuário **e** do código. Complementa o panorama em [documentacao-funcional.md](./documentacao-funcional.md) §2.
>
> Princípio que atravessa os três fluxos: **tudo é otimista e offline-first**. A UI
> reage na hora; a rede acontece em segundo plano; quando offline, a ação é
> enfileirada e reproduzida ao reconectar (ver §4).

---

## 0. Anatomia mínima da tarefa

Campos relevantes para estes fluxos (schema completo em `server/db/schema/tasks.ts`):

| Campo | Valores | Papel |
|---|---|---|
| `title` / `description` | texto | o que é a tarefa |
| `horizon` | `core30` · `core60` · `core90` · `micro` · `backlog` · `hibernating` | **prioridade temporal** — é o que o "mover" altera |
| `type` | `ceo` · `delegate` · `personal` | quem executa (própria / delegada / pessoal) |
| `projectId` **ou** `goalId` | id \| null | vínculo (exclusivo: um ou outro, nunca ambos) |
| `companyId` | id \| null | empresa |
| `scheduledDate` / `scheduledTime` / `durationMinutes` | data/hora/min | **agenda** (aparece em Calendário/Timeline) |
| `followupActive` / `followupDate` / `followupHolderPersonId` | — | lembrete/cobrança |
| `lifeArea` / `lifeItemId` | área da vida | integra com o módulo Vida |
| `done` / `completedAt` / `archived` | bool / ts | estado |

> **Horizonte ≠ agenda.** Mover de horizonte muda a *prioridade* (`horizon`). Agendar
> muda *data/hora* (`scheduledDate`/`scheduledTime`). São coisas independentes.
> Os rótulos de UI ("Core 30 dias", "Hibernando") e o mapa UI↔DB estão em
> `app/utils/horizontes.ts` (o banco usa `hibernating`; a UI usa `hibernando`).

---

## 1. Criar tarefa

### 1.1 As três portas de entrada

| Entrada | Onde | O que faz | Campos |
|---|---|---|---|
| **Captura rápida (Inbox)** | campo "O que precisa fazer? (Enter)" no topo do Board e da Lista | cria **instantânea** ao apertar Enter | só título → default `type: ceo`, `horizon: core30` |
| **"Nova tarefa"** | botão na topbar (todas as páginas) | abre o **modal completo** vazio | todos |
| **"+ Adicionar"** | cabeçalho de cada coluna/grupo de horizonte | abre o **modal completo** vazio | todos |

Componentes: `app/components/tarefas/InboxQuick.vue` (captura rápida) e
`app/components/tarefas/TaskModal.vue` (modal). O estado do modal (`open`/`editing`)
vive em `app/composables/useTaskModal.ts` → `openNew()` / `openEdit(task)` / `close()`.

> Nota: hoje o "+ Adicionar" de uma coluna abre o modal **sem pré-selecionar** aquele
> horizonte (`onAddTo` chama `openNew()` e ignora o horizonte clicado, em
> `app/pages/trabalho.vue`). Melhoria fácil se quiser: passar o horizonte ao `openNew`.

### 1.2 Captura rápida — passo a passo
1. Usuário digita e aperta **Enter** (`InboxQuick.onKey`).
2. O campo é **limpo antes de emitir** e o Enter de composição de IME/acento é ignorado
   (proteção anti-duplicação — ver §4.3).
3. `trabalho.vue → onInbox(title)` chama `create({ title, type: 'ceo', horizon: 'core30' })`.

### 1.3 Modal completo — campos (aba **Detalhes**)
Título · Descrição · **Horizonte** · **Tipo** · **Área da vida** · **Projeto/Meta**
(+ atalhos "＋ Novo projeto" / "＋ Nova meta") · **Empresa** (buscar ou criar) ·
**Data/Hora/Duração** · **Marcar como follow-up**. Salvar via botão **Salvar**.
As abas **Checklist/Anotações/Anexos/Histórico** só habilitam depois de salvar (precisam
de um `id` real).

### 1.4 O que acontece ao criar (`useTasks.create`, `app/composables/useTasks.ts`)
```
1. Gera um id no cliente (crypto.randomUUID()).
2. Insere a tarefa OTIMISTA no topo da lista local na hora (online E offline).
3. POST /api/tasks com { ...input, id }.
   ├─ sucesso  → reconcileRow(id, row): faz MERGE da linha do servidor sobre a
   │             otimista (preserva campos de join como delegatePersonName).
   ├─ erro real (ex.: validação) → remove a otimista e propaga o erro.
   └─ offline  → mantém a otimista e enfileira o POST (queueRequest).
```
Por que o **id vem do cliente**: ele é a fonte da verdade. Assim, um PATCH/complete
feito offline logo após o create não dá 404 depois do sync, e o **replay é idempotente**
no servidor (`onConflictDoNothing` no `id` — `server/utils/tasksService.ts → createTask`).

---

## 2. Mover tarefa (entre horizontes)

"Mover" = trocar o `horizon` da tarefa (sua prioridade temporal). Duas formas:

### 2.1 Arrastar e soltar (Board e Lista)
- Implementado com **SortableJS**, mesmo `group: 'horizontes'` nas colunas do Board
  (`app/components/base/BoardColumn.vue`) e nos grupos da Lista
  (`app/components/tarefas/HorizonteList.vue`).
- Ao soltar numa coluna, o `onAdd` do Sortable remove o nó arrastado e emite
  `drop-task(id)`.
- `trabalho.vue → onDrop(taskId, horizonteDestino)` chama `moveHorizon(taskId, ui)`.
- Existe ainda um wrapper HTML5-DnD genérico em `app/composables/useDragTask.ts`
  (`useDragSource`/`useDropTarget`) para arrastos fora do Sortable.

### 2.2 Menu de contexto (botão direito no card)
`TaskCard` (`app/components/tarefas/TaskCard.vue`) abre um `BaseContextMenu` com o item
**"Mover horizonte"** → submenu com os 6 horizontes (o atual aparece marcado). Selecionar
chama `update(id, { horizon })`. O mesmo menu tem: Concluir/Reabrir, Editar,
**Tirar da agenda** (quando agendada), Arquivar, Apagar.

### 2.3 O que acontece ao mover (`useTasks.moveHorizon`)
```
1. Move o card para o destino OTIMISTA (atualiza horizon na lista local).
2. PATCH /api/tasks/{id} { horizon }.
   ├─ sucesso → reconcileRow (merge de 1 linha; SEM refetch da lista).
   └─ offline → mantém o otimista e enfileira o PATCH.
3. Erro real → reverte o card pro horizonte anterior.
```
**Por que reconcilia 1 linha em vez de `refresh()`**: o refetch lia a lista do
servidor (cache do Hyperdrive) e às vezes voltava com o horizonte antigo → o card
"pulava de volta". Reconciliando só a linha alterada, o movimento é estável.

### 2.4 E reagendar (mudar data/hora)?
**Não é por arrasto.** Os modos Calendário/Timeline posicionam as tarefas por
`scheduledDate`/`scheduledTime`, mas a mudança de data/hora se faz:
- pelo **modal** (campos Data/Hora), ou
- por **"Tirar da agenda"** no menu de contexto (`update(id, { scheduledDate: null, scheduledTime: null })`).

(Oportunidade futura: drag-to-reschedule no Calendário.)

---

## 3. Editar tarefa

### 3.1 Como abrir
- **Clique no card** → expande/recolhe o card (`emit('toggle')`).
- **"Editar"** no menu de ações (•••) ou no menu de contexto, ou o atalho **↵**.
- Qualquer um chama `openEdit(task)` → abre o modal **"Editar tarefa"** com os campos
  preenchidos a partir da tarefa.

### 3.2 As 5 abas do modal
| Aba | Conteúdo | Backend |
|---|---|---|
| **Detalhes** | todos os campos (iguais ao criar) | `PATCH /api/tasks/{id}` |
| **Checklist** | subitens com checkbox, adicionar/remover (UI otimista) | `/api/tasks/{id}/checklist` |
| **Anotações** | comentários/discussão | `/api/tasks/{id}/annotations` |
| **Anexos** | upload de arquivos (presign S3) | `/api/attachments` |
| **Histórico** | trilha de auditoria (quem/quando/o quê) | `/api/tasks/{id}/timeline` |

### 3.3 O que acontece ao salvar (`TaskModal.onSave`)
```
0. Guarda anti-duplo: ignora reentrância (saving) — além do botão já desabilitado.
1. Se mudou TIPO ou DELEGADO → reassign(id, ...) (POST /api/tasks/{id}/reassign).
2. update(id, patch) → PATCH /api/tasks/{id}, OTIMISTA:
   - aplica o patch na lista local na hora;
   - sucesso → reconcileRow (merge da linha do servidor);
   - offline → mantém otimista + enfileira;
   - erro real → reverte para o estado anterior.
3. close() fecha o modal.
```

### 3.4 Outras edições de estado (direto do card, sem abrir o modal)
| Ação | Gatilho | Composable | Endpoint | Otimista? |
|---|---|---|---|---|
| **Concluir / Reabrir** | botão de check no card / menu | `complete(id, done)` | `POST /api/tasks/{id}/complete` | sim |
| **Arquivar** | menu (•••) / contexto (pede confirmação) | `archive(id, true)` | `POST /api/tasks/{id}/archive` | sim |
| **Apagar** | menu (pede confirmação, irreversível) | `remove(id)` | `DELETE /api/tasks/{id}` | sim (remove e re-insere se falhar) |
| **Tirar da agenda** | contexto | `update(id, { scheduledDate:null, scheduledTime:null })` | `PATCH` | sim |
| **Reatribuir (delegar)** | mudar tipo/pessoa no modal | `reassign(...)` | `POST /api/tasks/{id}/reassign` | refaz `refresh()` |

---

## 4. Comportamento offline / otimista (vale p/ os 3 fluxos)

### 4.1 Otimista sempre
Toda mutação (`create`/`update`/`complete`/`archive`/`remove`/`moveHorizon`) altera a
lista local **antes** da rede e reconcilia depois. Online não espera ida-e-volta para
"pintar" a mudança.

### 4.2 Offline → fila (outbox)
Quando o erro é de rede (`isOfflineError`), a ação é gravada em `db.syncQueue`
(IndexedDB/Dexie, `app/lib/offlineQueue.ts`) com a requisição completa
(`method`/`url`/`body`). Ao reconectar, `useSyncManager.processQueue`
(`app/composables/useSyncManager.ts`) reproduz item a item na ordem; para no 1º erro e
tenta de novo na próxima rodada. O painel **Sincronização** (rodapé) mostra o tamanho
da fila ("Nada na fila" / "Sincronizar agora").

Enquanto há itens pendentes de uma entidade, os `refresh()` **não sobrescrevem** o
estado otimista (`hasPendingForEntity`), pra a mudança não "sumir" ao reabrir offline.

### 4.3 Idempotência / anti-duplicação
- **Replay seguro**: o create enfileira o `id` do cliente; o servidor faz
  `onConflictDoNothing` nesse `id` → reenviar o mesmo POST não cria 2ª linha.
- **Anti-duplo na UI** (corrigido recentemente): `InboxQuick` limpa o campo antes de
  emitir e ignora Enter de composição; `TaskModal.onSave` tem guarda de reentrância.

---

## 5. Referência rápida (ação → código → endpoint)

| Ação do usuário | Composable (`useTasks`) | HTTP |
|---|---|---|
| Criar (inbox ou modal) | `create(input)` | `POST /api/tasks` |
| Editar campos | `update(id, patch)` | `PATCH /api/tasks/{id}` |
| Mover horizonte (arrasto/menu) | `moveHorizon(id, ui)` / `update` | `PATCH /api/tasks/{id}` |
| Concluir/Reabrir | `complete(id, done)` | `POST /api/tasks/{id}/complete` |
| Arquivar | `archive(id, bool)` | `POST /api/tasks/{id}/archive` |
| Apagar | `remove(id)` | `DELETE /api/tasks/{id}` |
| Reatribuir/Delegar | `reassign(id, payload)` | `POST /api/tasks/{id}/reassign` |
| Listar/criar/alterar/remover item de checklist | `useChecklist` | `GET/POST /api/tasks/{id}/checklist` · `PATCH/DELETE /api/tasks/{id}/checklist/{cid}` |
| Listar/criar/remover anotação | `useAnnotations` | `GET/POST /api/tasks/{id}/annotations` · `DELETE /api/tasks/{id}/annotations/{aid}` |
| Anexos | `useAttachments` | `GET /api/attachments` · `POST /api/attachments/presign` · `GET /api/attachments/{id}/download` · `DELETE /api/attachments/{id}` |
| Histórico (auditoria) | `useTaskTimeline` | `GET /api/tasks/{id}/timeline` |
| Histórico de reagendamentos | — (sem UI) | `GET /api/tasks/{id}/reschedules` |

**Arquivos-chave:** `app/composables/useTasks.ts` · `app/composables/useTaskModal.ts` ·
`app/components/tarefas/{TaskModal,TaskCard,InboxQuick,HorizonteList,ListView}.vue` ·
`app/components/base/BoardColumn.vue` · `app/composables/useDragTask.ts` ·
`app/composables/useSyncManager.ts` · `app/lib/offlineQueue.ts` · `server/utils/tasksService.ts`.

---

## 6. Sub-recursos da tarefa (em profundidade)

Tudo abaixo vive nas abas do modal de edição (precisa de uma tarefa já salva) ou nos
campos da aba **Detalhes**.

### 6.1 Checklist (aba **Checklist**)
`app/components/tarefas/Checklist.vue` + `app/composables/useChecklist.ts`.

- **Adicionar**: digitar + Enter. Em erro, o texto é devolvido ao campo (não se perde).
- **Colar multi-linha**: colar um texto com várias linhas cria **um item por linha**
  (cada linha vira um checklist item) — útil pra jogar uma lista pronta.
- **Marcar/desmarcar**: clicar no círculo (`toggle`) — itens concluídos ficam riscados.
- **Renomear**: clicar no texto entra em edição inline; Enter confirma, Esc cancela.
- **Remover**: botão ✕ no item.
- Cada item tem `position` (ordem), `text`, `done`. Endpoints:
  `GET/POST /api/tasks/{id}/checklist`, `PATCH/DELETE /api/tasks/{id}/checklist/{cid}`.
- **Otimista** (aplica na hora e reconcilia com a linha do servidor). ⚠️ **Sem fila
  offline**: ao contrário das mutações da tarefa, operações de checklist **não** entram
  no outbox — em erro de rede elas revertem. (Lacuna conhecida se quiser checklist 100%
  offline.)

### 6.2 Anotações / comentários (aba **Anotações**)
`app/components/tarefas/Anotacoes.vue` + `useAnnotations`.

- Lista cronológica de comentários, cada um com **autor** e **data/hora**.
- **Adicionar**: textarea "Nova anotação…" + botão Adicionar.
- **Remover**: ✕ no item.
- Endpoints: `GET/POST /api/tasks/{id}/annotations`, `DELETE /api/tasks/{id}/annotations/{aid}`.
- Serve de "log de discussão" da tarefa (ex.: "Time topou reduzir de 5 p/ 3 telas").

### 6.3 Anexos (aba **Anexos**)
`app/components/anexos/AnexosList.vue` + `useAttachments`.

- **Upload** por seleção de arquivo **ou arrastar-e-soltar** na área; aceita vários de
  uma vez. Usa **URL pré-assinada (S3/R2)** — `POST /api/attachments/presign`, depois o
  blob vai direto pro storage.
- **Baixar** (`GET /api/attachments/{id}/download`) e **Remover** (`DELETE`).
- Polimórfico: o mesmo componente serve task/nota/pagamento/projeto (aqui `entity="task"`).
- O backup (`/settings/backup`) exporta **só os metadados** dos anexos, não os blobs.

### 6.4 Delegação (campo **Tipo** = `Delego`/`Pessoal`)
`app/components/delegacao/PessoaAutocomplete.vue` + `POST /api/tasks/{id}/reassign`.

- **`Delego` (delegate)** → aparece o campo **"Pessoa"** (autocomplete que **exclui** o
  assistente). Você pode:
  - escolher uma pessoa existente, ou
  - **criar na hora** digitando um nome, ou um **email** (a opção "criar com email"
    surge quando o texto é um email) → vira um contato em Pessoas. O `delegateName`/
    `delegateEmail` viajam no payload e o servidor resolve/cria a pessoa.
- **`Pessoal` (personal)** → campo **"Assistente"** (autocomplete que mostra **só
  assistentes**; assistentes não são criados por aqui — definidos em
  `/settings/people`).
- **Reatribuir** uma tarefa já existente (mudar tipo ou pessoa) passa por
  `reassign(...)` em vez de um PATCH simples (mantém a consistência do vínculo de
  pessoa); o card mostra o avatar/inicial do responsável.
- Pessoas com conta vinculada (`linkedUserId`) recebem a tarefa no próprio app (o
  broadcast em tempo real entrega só a quem tem acesso: dono + usuário do delegado).

### 6.5 Follow-up (cobrança/lembrete)
Toggle **"Marcar como follow-up"** na aba Detalhes.

- Campos: **Data de cobrança** (`followupDate`) e **Descrição** (`followupDescription`).
- Semântica da descrição: **vazio = você** mesmo; **com nome = aguardando aquela
  pessoa**. (Há ainda `followupHolderPersonId` no schema para apontar o "dono" do
  follow-up.)
- Visual: a tarefa **aparece em amarelo na Agenda** e conta no badge "Agenda" da sidebar.
- É independente do agendamento normal (`scheduledDate`): uma tarefa pode ter follow-up
  sem estar agendada.

### 6.6 Vínculos da tarefa (aba Detalhes)
- **Projeto _ou_ Meta** (`form.vinculo`): seletor único agrupado em "Projetos" e "Metas"
  — exclusivo (o servidor rejeita ter os dois). Botões **＋ Novo projeto / ＋ Nova meta**
  criam inline sem sair do modal.
- **Empresa** (`CompanyAutocomplete`): buscar ou **criar** empresa na hora; serve de
  reuso entre tarefas/metas/projetos/pagamentos.
- **Área da vida** (`lifeArea` + `lifeItemId`): liga a tarefa a Corpo/Mente/etc. e ela
  passa a contar nas tarefas daquela área no módulo **Vida**.

### 6.7 Histórico e reagendamentos (aba **Histórico**)
`app/components/tarefas/HistoricoTimeline.vue` + `useTaskTimeline`.

- **Histórico/auditoria** (`GET /api/tasks/{id}/timeline`): trilha de eventos da tarefa
  **e** de seus sub-itens (checklist, anotações) — ação, autor, mudanças, quando.
- **Reagendamentos** (`GET /api/tasks/{id}/reschedules`): o backend deriva o histórico
  de mudanças de `scheduledDate` a partir do `audit_log`. ⚠️ **Endpoint sem UI hoje** —
  capacidade pronta no servidor, mas nenhuma tela consome. (Candidato a "linha do tempo
  de remarcações" no modal.)

---

## 7. Cobertura — o que tem e o que falta

| Recurso da tarefa | Suportado? | UI |
|---|---|---|
| Criar (rápida / modal / por coluna) | ✅ | ✅ |
| Editar campos | ✅ | ✅ |
| Mover horizonte (arrasto + menu) | ✅ | ✅ |
| Concluir / Reabrir | ✅ | ✅ |
| Arquivar / Apagar | ✅ | ✅ |
| Agendar (data/hora/duração) | ✅ | ✅ |
| Follow-up (cobrança) | ✅ | ✅ |
| Delegar / Reatribuir (+ criar pessoa por email) | ✅ | ✅ |
| Vínculo a Projeto/Meta/Empresa/Área da vida | ✅ | ✅ |
| Checklist (CRUD + colar multi-linha) | ✅ | ✅ (⚠️ sem offline) |
| Anotações (comentários) | ✅ | ✅ |
| Anexos (upload/baixar/remover) | ✅ | ✅ |
| Histórico/auditoria | ✅ | ✅ |
| Histórico de **reagendamentos** | ✅ (backend) | ❌ **sem tela** |
| Reagendar por **arrasto** no Calendário/Timeline | ❌ | ❌ |
| Reordenar checklist (drag) | ❌ (só `position` no schema) | ❌ |

> Em resumo: **todas as funções de tarefa estão documentadas** acima. As únicas lacunas
> são de produto, não de documentação: (1) o endpoint de reagendamentos não tem UI;
> (2) não há drag-to-reschedule; (3) checklist não usa o outbox offline; (4) não há
> reordenação de checklist por arrasto.

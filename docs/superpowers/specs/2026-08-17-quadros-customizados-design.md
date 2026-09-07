# Quadros customizados — design

Data: 2026-08-17

## Problema

Hoje `/trabalho` tem um único board, com cinco colunas fixas derivadas do enum
`tasks.horizon` (core7/core30/core60/core90/hibernando). A ordem dentro de cada
coluna é sempre derivada dos dados (data+hora, A–Z), não existe campo de posição,
e por isso o Sortable roda com `sort: false` (`app/components/base/BoardColumn.vue:29`).

Falta ao usuário poder montar as próprias visões: "quadro da Empresa X", com as
colunas que fizerem sentido para aquele contexto, e com a ordem que ele escolher.
Uma mesma tarefa precisa poder aparecer em vários quadros, com posição
independente em cada um.

## Escopo

Quadros criados pelo usuário, no modelo Trello:

- Pertencimento **manual**: a tarefa entra no quadro porque alguém a colocou lá.
  Não há regra/filtro salvo que popule o quadro automaticamente.
- Colunas **próprias de cada quadro** (criar, renomear, reordenar, apagar). O
  `horizon` da tarefa continua existindo como eixo independente: mover um card
  entre colunas de um quadro **não** altera o horizonte.
- Uma tarefa aparece no máximo uma vez por quadro, e pode estar em vários
  quadros, com `position` própria em cada um.
- Quadros são **compartilháveis**, e estar no quadro **dá acesso** às tarefas
  que estão nele.

Fora de escopo neste ciclo: papéis configuráveis por membro, quadros por regra
(filtro salvo), etiquetas/labels próprias de quadro, capa de card, limites de WIP.

## Decisões e alternativas descartadas

**Pertencimento manual, não por filtro salvo.** Um quadro por regra tornaria a
posição manual instável (a tarefa entra e sai sozinha da coluna conforme os
campos mudam). O usuário quer curadoria, não uma consulta salva.

**Colunas próprias, não reuso das colunas de horizonte.** Reusar horizonte
deixaria o quadro sendo apenas um filtro sobre o board atual — mais simples, mas
não atende "colunas que fazem sentido para aquele contexto".

**Cards magros; a tarefa vem da lista global.** `GET /api/boards/:id` devolve
apenas `{ board, columns, cards, members }`, com `cards` contendo `taskId`,
`columnId` e `position`. A view resolve `taskId` → `Task` na lista que `useTasks`
já mantém. Isso funciona **porque** estar no quadro dá acesso à tarefa: com o
quarto ramo do `taskFilter`, `GET /api/tasks` já devolve as tarefas dos quadros
compartilhados. Uma fonte da verdade só, e as edições otimistas e o broadcast já
refletem no quadro sem trabalho extra.

Alternativa descartada: o endpoint do quadro devolver as tarefas enriquecidas.
Seria auto-contido, mas criaria duas cópias da mesma tarefa em memória — cada
patch otimista, broadcast e item de fila offline teria que atualizar as duas.

**Posições inteiras, reindexadas no servidor.** Cada movimento envia
`{ taskId, columnId, toIndex }` e o servidor reescreve as posições da coluna de
destino (e da de origem, quando muda de coluna) dentro de uma transação,
devolvendo o resultado normalizado. Descartados: posição fracionária (deriva de
casas decimais ao longo do tempo) e LexoRank (complexidade sem retorno para
colunas de dezenas de cards).

**Consequência aceita:** como estar no quadro dá acesso à tarefa, as tarefas de
quadros compartilhados passam a aparecer também no board de horizontes de
`/trabalho` de todos os membros. É o mesmo comportamento que tarefas delegadas e
de convidado já têm, mas é uma mudança visível.

## Modelo de dados

Arquivo novo `server/db/schema/boards.ts`, exportado pelo `index.ts` do schema.
Migração Drizzle nova (a próxima da sequência, `0030_*`).

### `boards`

| coluna | tipo | notas |
| --- | --- | --- |
| `id` | uuid PK | `defaultRandom()`; o cliente envia o id na criação |
| `owner_user_id` | uuid NOT NULL | FK `users.id`, `onDelete: cascade` |
| `name` | text NOT NULL | |
| `icon` | text NOT NULL default `'columns-3'` | nome de ícone do `BaseIcon` |
| `color` | text NULL | cor de destaque na sidebar |
| `position` | integer NOT NULL default 0 | ordem na sidebar |
| `archived` | boolean NOT NULL default false | |
| `created_at` / `updated_at` | timestamptz NOT NULL | |

Índices: `boards_owner_idx (owner_user_id, archived)`; único
`boards_owner_name_lower_unique (owner_user_id, lower(name))`, seguindo
`projects`.

### `board_columns`

| coluna | tipo | notas |
| --- | --- | --- |
| `id` | uuid PK | |
| `board_id` | uuid NOT NULL | FK `boards.id`, cascade |
| `name` | text NOT NULL | |
| `position` | integer NOT NULL default 0 | |
| `created_at` / `updated_at` | timestamptz NOT NULL | |

Índices: `board_columns_board_idx (board_id, position)`; único
`board_columns_board_id_id_unique (board_id, id)` — existe apenas para ser
destino da FK composta de `board_cards`.

### `board_cards`

| coluna | tipo | notas |
| --- | --- | --- |
| `board_id` | uuid NOT NULL | FK `boards.id`, cascade |
| `task_id` | uuid NOT NULL | FK `tasks.id`, cascade |
| `column_id` | uuid NOT NULL | ver FK composta abaixo |
| `position` | integer NOT NULL default 0 | |
| `added_by_user_id` | uuid NOT NULL | FK `users.id`, cascade |
| `created_at` | timestamptz NOT NULL | |

Chave primária composta `(board_id, task_id)`: é ela que garante no banco que
uma tarefa aparece no máximo uma vez por quadro, permitindo ao mesmo tempo a
mesma tarefa em vários quadros.

FK composta `(board_id, column_id)` → `board_columns (board_id, id)`. Sem ela é
possível gravar um card apontando para a coluna de outro quadro, e o defeito só
aparece quando alguém abre o quadro.

Índices: `board_cards_column_idx (column_id, position)` e
`board_cards_task_idx (task_id)` — este último atende o predicado de acesso.

### `board_members`

| coluna | tipo | notas |
| --- | --- | --- |
| `board_id` | uuid NOT NULL | FK `boards.id`, cascade |
| `person_id` | uuid NOT NULL | FK `people.id`, cascade |
| `created_at` | timestamptz NOT NULL | |

PK composta `(board_id, person_id)`, índice `board_members_person_idx (person_id)`.
Espelha `task_participants`: o acesso só vale quando `people.linked_user_id`
aponta para uma conta.

### Regras de ciclo de vida

- Apagar tarefa remove os cards por cascade.
- Arquivar tarefa não mexe no card; a tarefa some do quadro porque some da lista
  global de tarefas ativas.
- Tarefa concluída permanece no card, com o mesmo tratamento riscado que o
  `BoardCard` já aplica, sob um toggle "mostrar concluídas" por quadro (estado
  local, mesmo padrão de `/trabalho`).
- Apagar uma coluna com cards move os cards para a primeira coluna restante,
  com confirmação. A última coluna do quadro não pode ser apagada.
- Criar um quadro cria três colunas padrão junto, na mesma transação.

## Acesso e compartilhamento

### Quarto ramo do `taskFilter`

`server/utils/accessFilter.ts:21` ganha mais um `EXISTS`, cobrindo dono do
quadro e membros vinculados de uma vez:

```sql
EXISTS (
  SELECT 1 FROM board_cards bc
  JOIN boards b ON b.id = bc.board_id
  WHERE bc.task_id = tasks.id
    AND (b.owner_user_id = $user
      OR EXISTS (SELECT 1 FROM board_members bm
                 JOIN people p ON p.id = bm.person_id
                 WHERE bm.board_id = b.id AND p.linked_user_id = $user))
)
```

É um `EXISTS` como os outros três, então a tarefa não duplica quando a pessoa é
convidada **e** membro do quadro. O índice `board_cards_task_idx` atende o
predicado.

### Acesso ao quadro em si

`canAccessBoard(userId, boardId)`: verdadeiro para o dono ou para membro cuja
`person` tem `linked_user_id` igual ao usuário.

Divisão de poderes:

- **Dono**: renomear, arquivar e apagar o quadro; adicionar e remover membros.
- **Membro**: criar, renomear, reordenar e apagar colunas; adicionar, mover e
  remover cards.

Sem papéis configuráveis. Adicionar granularidade depois não exige migrar dados.

### Convite de membro

Reusa o fluxo de convidado de tarefa: escolher uma `person` existente ou criar
por nome/e-mail, com o convite saindo pelo `server/api/invitations` já existente.

### Compartilhamento explícito na UI

Colocar uma tarefa em um quadro com membros **é compartilhar a tarefa**. Portanto:

- Quadro com membros exibe um selo de compartilhado, na sidebar e no cabeçalho.
- A primeira vez em cada sessão que um card é adicionado a um quadro
  compartilhado, aparece um aviso nomeando quem passa a enxergar a tarefa.

### Saída de membro

Remover um membro **não** retira do quadro as tarefas que ele colocou lá: o card
permanece e continua dando acesso aos demais membros. A contrapartida é a regra
inversa, sempre disponível: o dono de uma tarefa pode removê-la de qualquer
quadro, pela ação "remover do quadro" no card e no modal da tarefa.

### Tempo real

`server/plugins/realtimeBroadcast.ts` passa a conhecer a entidade `boards` no
`ENTITY_BY_SEGMENT`, com fan-out para o dono e os membros vinculados (mesmo
cálculo do `canAccessBoard`).

`taskForBroadcast` passa a incluir no `access` os usuários que enxergam a tarefa
por quadro. Sem isso a edição feita por um membro não chega aos demais.

## API

Rotas em `server/api/boards/`, no formato arquivo-por-método do projeto.

```
GET    /api/boards                      → quadros onde sou dono ou membro (sem cards)
POST   /api/boards                      → cria quadro + 3 colunas padrão
PATCH  /api/boards/:id                  → name, icon, color, position, archived
DELETE /api/boards/:id                  → só o dono

GET    /api/boards/:id                  → { board, columns, cards, members }
POST   /api/boards/:id/columns          → nova coluna no fim
PATCH  /api/boards/:id/columns/:colId   → renomear
DELETE /api/boards/:id/columns/:colId   → move os cards para a primeira coluna restante
POST   /api/boards/:id/columns/reorder  → { columnIds: [...] }, reindexa em transação

POST   /api/boards/:id/cards            → adiciona card
POST   /api/boards/:id/cards/move       → { taskId, columnId, toIndex }
DELETE /api/boards/:id/cards/:taskId    → remove do quadro

POST   /api/boards/:id/members          → { personId } ou { name, email }
DELETE /api/boards/:id/members/:personId
```

Colunas ficam aninhadas sob `/:id` mesmo com `colId` já sendo único: o `boardId`
na rota permite checar acesso sem um SELECT extra.

### `POST /api/boards/:id/cards`

Aceita **ou** `{ taskId, columnId, toIndex? }` **ou** `{ task, columnId, toIndex? }`,
onde `task` é o mesmo `CreateTaskInput` de hoje. No segundo caso, cria a tarefa e
o card na mesma transação.

Isso faz o "+" da coluna ser uma requisição só. Duas requisições encadeadas
virariam duas entradas na fila offline, e a segunda referenciaria um id que a
primeira ainda não confirmou.

Com `taskId`, verifica `canAccessTask` antes de gravar.

Com `task`, o `task.id` vem do cliente e o insert em `tasks` é
`ON CONFLICT (id) DO NOTHING`, para que o reenvio da fila offline não crie uma
segunda tarefa. O insert do card segue a mesma regra de `ON CONFLICT` descrita
em "Idempotência".

### `POST /api/boards/:id/cards/move`

Corpo `{ taskId, columnId, toIndex }`. Reindexa a coluna de destino (e a de
origem, quando há mudança de coluna) dentro de uma transação e responde
`{ cards: [{ taskId, columnId, position }] }` com as colunas afetadas já
normalizadas. O cliente aplica esse resultado por cima do estado otimista, então
a ordem na tela nunca diverge da ordem gravada.

### Lógica pura extraída

O cálculo de destino e a reindexação saem dos handlers para funções puras,
testáveis sem banco:

- `server/utils/boardOrder.ts` — dada a lista atual de cards da coluna e o
  destino pedido, devolve a lista de `(taskId, position)` a gravar.
- `app/utils/boardDrop.ts` — dado o evento do Sortable, devolve
  `{ columnId, toIndex }`. É onde mora o erro clássico de um a mais ao arrastar
  para baixo dentro da mesma coluna.

## Cliente

### Composables

- `useBoards()` — lista de quadros em `useState('boards:list')` e CRUD. Alimenta
  a sidebar.
- `useBoard(id)` — estado do quadro aberto (`useState('board:' + id)`): colunas,
  cards e membros, com as mutações otimistas.

Ambos seguem a estrutura de `useTasks`: estado otimista primeiro, reconciliação
por linha depois, `applyRemote`/`removeRemote` para o broadcast e `queueRequest`
no ramo de erro offline.

### Componentes

Novos em `app/components/quadros/`:

- `QuadroBoard.vue` — a faixa horizontal de colunas.
- `QuadroColumn.vue` — header editável, botão "+", menu de renomear/apagar.
- `QuadroCardAdd.vue` — input inline que alterna entre "criar tarefa" e "buscar
  tarefa existente".
- `QuadroSettingsModal.vue` — nome, ícone, cor, membros, arquivar, apagar.

`app/components/base/BoardCard.vue` é reaproveitado como está, ganhando apenas
uma prop opcional de ações extras no menu de contexto, para a entrada "remover
do quadro".

### Páginas e navegação

- `app/pages/quadros/[id].vue` — o quadro.
- `app/pages/quadros/index.vue` — enxuta: criar quadro e ver arquivados. Sem ela
  não há como recuperar um quadro arquivado.
- `app/layouts/default.vue` — grupo "Quadros" gerado de `useBoards().list`,
  colapsável como os demais, com "Novo quadro" no fim.

O modal de tarefa (`app/components/tarefas/TaskModal.vue`) ganha um campo
"Quadros", que marca em quais quadros a tarefa está. Marcar coloca o card no fim
da primeira coluna do quadro.

### Arrastar e soltar

**Card entre colunas do quadro.** Sortable com `group: 'quadro-<id>'` e
`sort: true` — diferente do board de horizontes, aqui a posição é dado real e a
reordenação dentro da coluna persiste. O `revertSortableMove` continua sendo
aplicado: a regra de o Vue ser dono do DOM (documentada em
`app/components/base/BoardColumn.vue:24-29`) segue valendo. A diferença é que
aqui o estado otimista muda antes do revert, então o Vue repinta o card já na
posição nova.

**Reordenar colunas.** Sortable no container horizontal, com o header da coluna
como handle.

**Arrastar de `/trabalho` para um quadro.** A sidebar mora no layout, ou seja, no
mesmo documento que o board de horizontes. Cada item de quadro da sidebar vira
uma lista Sortable no grupo `'horizontes'` com `put: true, pull: false`; no
`onAdd`, reverte o nó e adiciona o card na primeira coluna do quadro. Sem drag
entre páginas e sem biblioteca nova. Como toca o layout global, é a última fatia
a implementar.

### Offline

Toda mutação de quadro, coluna, card e membro usa a entidade `'boards'` na fila
(`queueRequest`), e o guard `hasPendingForEntity('boards')` protege o estado
otimista de ser sobrescrito por leitura vinda do cache do service worker.

Quadro, coluna e card recebem id gerado no cliente com `crypto.randomUUID()`,
como já é feito em `useTasks.create()` (`app/composables/useTasks.ts:208`). Sem
isso a sincronização depois de reconectar referencia ids que o servidor nunca viu.

### Carregamento

Um card cujo `taskId` ainda não está na lista global não renderiza. Para isso não
virar "quadro vazio ao abrir", `/quadros/[id]` dispara `useTasks().refresh()`
junto com o carregamento do quadro, e a coluna mostra esqueleto enquanto qualquer
um dos dois estiver em voo.

## Erros e casos de borda

### Idempotência

A fila offline reenvia requisições; cada mutação precisa aguentar chegar duas vezes.

- `POST /cards` com uma tarefa que já está no quadro não responde 409: faz
  `ON CONFLICT` e move o card para a coluna/índice pedidos. O reenvio vira no-op.
- `POST /cards/move` é naturalmente idempotente — o mesmo destino duas vezes
  produz o mesmo resultado.
- `DELETE /cards/:taskId` de um card inexistente responde 204.
- `POST /columns/reorder` com a mesma lista duas vezes produz o mesmo resultado.

### Erros

| Situação | Resposta |
| --- | --- |
| Adicionar tarefa sem acesso | 403 (`canAccessTask` antes de gravar) |
| Mover card para coluna de outro quadro | 400; a FK composta segura no banco mesmo se o handler falhar |
| Apagar a última coluna | 400 |
| Não-dono tentando gerenciar membros ou apagar o quadro | 403 |
| Abrir quadro apagado por outra pessoa | 404; a página redireciona para `/quadros` com toast |

### Concorrência

Sem locks. Dois membros movendo cards na mesma coluna ao mesmo tempo: cada
`move` reindexa a coluna dentro da transação e devolve o resultado; o último a
chegar vence, e o broadcast corrige a tela do outro em seguida. Vale o mesmo para
o caso offline — o move enfileirado sobrescreve o que aconteceu online durante a
desconexão. É a mesma regra de último-a-escrever usada no resto do app.

## Testes

Por decisão do usuário, **não haverá testes de integração** nesta feature.

Risco registrado: o quarto ramo do `taskFilter` é a parte mais sensível — é ele
que decide quem enxerga tarefa de quem — e ficará sem cobertura automatizada. A
verificação desse comportamento passa a ser manual.

Cobertura automatizada, em `tests/unit/`:

- `boardOrder.test.ts` — reindexação da coluna: inserir no início, no meio e no
  fim; mover dentro da mesma coluna para cima e para baixo; mover entre colunas;
  remover.
- `boardDrop.test.ts` — tradução do evento do Sortable para
  `{ columnId, toIndex }`, incluindo o caso de arrastar para baixo dentro da
  mesma coluna.

Verificação manual antes de considerar pronto: criar quadro, criar/renomear/
reordenar/apagar colunas, adicionar tarefa pelos quatro caminhos, mover cards
(inclusive offline e reconectando), compartilhar quadro com uma segunda conta e
confirmar que ela enxerga a tarefa, remover o card e confirmar que ela deixa de
enxergar.

## Ordem de implementação sugerida

1. Schema, migração e `boardOrder.ts` com os testes unitários.
2. API de quadros e colunas + `useBoards()` + grupo na sidebar e
   `/quadros/index.vue`.
3. Cards, `GET /api/boards/:id`, `useBoard()`, `/quadros/[id].vue` com colunas e
   drag dentro do quadro.
4. Quarto ramo do `taskFilter`, membros, selo de compartilhado e aviso de
   compartilhamento.
5. Broadcast (`boards` no `ENTITY_BY_SEGMENT` e acesso por quadro no
   `taskForBroadcast`) e fila offline.
6. Campo "Quadros" no `TaskModal` e drag de `/trabalho` para a sidebar.

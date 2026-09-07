# Comando — Documentação Funcional

> Plataforma de gestão de trabalho + vida, **offline-first**, com sincronização em tempo real.
> Documentação levantada por navegação no app (localhost:3000, conta **demo@comando.app**) cruzada com análise do código-fonte.

## Visão geral

**Comando** organiza a rotina de um operador/CEO em torno de dois eixos:

- **Trabalho** — tarefas, projetos, metas, empresas e pagamentos.
- **Vida** — check-in diário e equilíbrio entre 5 áreas da vida.

O app é um **Nuxt 4 + Vue 3** (Pinia, TypeScript) com backend **Nitro + PostgreSQL (Drizzle ORM)** e autenticação **Better-auth (OTP por e-mail + passkeys)**. A camada offline usa Service Worker (cache SWR), fila de escrita (outbox) e WebSocket (Durable Object) para realtime.

### Navegação (menu lateral)

| Seção | Itens |
|---|---|
| **PRINCIPAL** | Agenda · Trabalho · Vida |
| **GESTÃO** | Empresas · Metas · Pagamentos · Projetos |
| **CONHECIMENTO** | Arquivo · Notas |
| **Rodapé** | Configurações · Pessoas · Sincronização · conta (Demo Comando) |

Cada item de menu exibe um **contador** (Trabalho 14, Metas 3, Pagamentos 1, Projetos 3, Notas 5). O cabeçalho tem busca global (⌘F), **Importar**, **Exportar** e **Nova tarefa** em todas as páginas. Um *pill* de status de sincronização ("Pronto · offline", ~50–80 ms) aparece fixo no rodapé.

---

## 1. Autenticação (`/login`)

Três formas de entrar:

1. **Entrar como demo** — bypass de OTP (apenas dev, `NUXT_DEMO_BYPASS=1`) que loga em `demo@comando.app` com dados de exemplo.
2. **Entrar com passkey** — WebAuthn (Face ID / Touch ID / PIN).
3. **Código por e-mail (OTP)** — informa o e-mail → recebe código de 6 dígitos → verifica.

Fluxos relacionados:
- **Aprovação de dispositivo** — ao logar de um dispositivo novo, é exigida aprovação a partir de um dispositivo confiável (`/login/waiting` faz polling).
- **Onboarding de passkey** (`/onboarding/passkey`) — registro de passkey no 1º acesso.
- **Convites** (`/invite/[token]`) — novos membros aceitam convite e entram no fluxo de OTP.

> **Observação técnica:** sem sessão válida, o app-shell renderiza normalmente (offline-first) mas as chamadas de API retornam **401** (ex.: `GET /api/tasks` 401). É esperado — basta autenticar.

---

## 2. Trabalho (`/trabalho`) — hub principal

> Aprofundamento dos fluxos de **criar / mover / editar** tarefa (UI + código + offline):
> [tarefas-criar-mover-editar.md](./tarefas-criar-mover-editar.md).

A página central do app. Composta por:

### 2.1 Check-in diário (topo)
Painel "Boa tarde" com a data e controles rápidos:
- **Sono** (slider, horas) · **Treino** (Não treinei / Leve / Forte)
- **Alimentação**, **Energia**, **Humor** (sliders 0–10, com emoji)
- **Nota do dia** (texto opcional) · botão **Salvar check-in**

Mesmo check-in da página **Vida** (compartilham dados).

### 2.2 Painel de métricas (cards editáveis)
Quatro cards com mini-gráficos; cada um tem **Editar / Expandir / Mais opções**:
- **Status das tarefas** — distribuição por horizonte (ex.: 5 Core 30, 2 Micro, 2 Backlog).
- **Conclusão** — % concluído (ex.: 22%, "4 de 18 concluídas") + tendência.
- **Pagamentos** — total a pagar (ex.: R$ 1.680,00) e variação.
- **Carga por horizonte** — nº de tarefas, divisão CEO/delegadas.

Avatares dos colaboradores (D, C, J, M) no canto superior direito. Filtro **"Todas as empresas"** (Acme Holding, Nimbus Tech, Studio Lumen).

### 2.3 Quatro visualizações das tarefas
Abas **Lista · Board · Calendário · Timeline**:

| Visão | Descrição |
|---|---|
| **Board** (Kanban) | Colunas por horizonte (Core 30/60/90 dias, Micro, Backlog, Hibernando). Cada coluna tem "+ Adicionar"; cards com ID (ex.: `MDS-C39A`), tipo (CEO/Delego/Pessoal), empresa, prazo e botão Concluir/Reabrir. Suporte a arrastar entre colunas ("Arraste tarefas aqui"). |
| **Lista** | Tabela agrupada por horizonte: **Tarefa · Descrição · Responsável · Prazo · Status** (Pendente/Concluída), com check de conclusão por linha. |
| **Calendário** | Grade semanal com linhas por hora; blocos de tarefas agendadas posicionados por horário (ex.: 9:30–10:30). Navegação por semana + botão **Hoje**. |
| **Timeline** | Gantt horizontal com colunas por dia, cartões posicionados por hora, linha de "agora", granularidade **Dia / Semana / Mês**. |

Acima das visões há o **INBOX · Captura rápida** ("O que precisa fazer? (Enter)") para criar tarefa instantânea.

### 2.4 Modal de tarefa (Nova / Editar)
Abas: **Detalhes · Checklist · Anotações · Anexos · Histórico** (as 4 últimas só ativam após salvar).

**Detalhes:**
- Título e Descrição
- **Horizonte:** Core 30 / Core 60 / Core 90 / Micro / Backlog / Hibernando
- **Tipo:** CEO / Delego / Pessoal
- **Área da vida:** nenhuma / Corpo / Mente / Relacionamentos / Recursos / Experiências
- **Projeto ou Meta** (lista combinada) + atalhos **＋ Novo projeto** / **＋ Nova meta**
- **Empresa** (buscar ou criar)
- **Agendamento:** data, hora e **duração** (min)
- **Marcar como follow-up** (lembrete atribuível a uma pessoa)

**Checklist:** subitens com checkbox (concluídos riscados), adicionar via Enter, excluir por item (UI otimista).
**Anotações:** comentários/discussão na tarefa.
**Anexos:** upload de arquivos (S3 presign).
**Histórico:** trilha de auditoria (quem, quando, o quê — ex.: "Demo Comando concluiu a tarefa").
**Mais ações:** **Arquivar** e **Apagar**.

---

## 3. Agenda (`/agenda`)
"Linha do tempo e calendário dos seus compromissos e follow-ups — tudo offline-first."

- Alternância **Timeline / Calendário**
- Granularidade **Dia / Semana / Mês** + botão **Hoje** e navegação por período
- Switch **Mostrar concluídas**
- Filtro por empresa, contador de eventos
- Mostra tarefas agendadas e **follow-ups** com empresa/projeto e avatar do responsável

---

## 4. Vida (`/vida`)
"Seu check-in diário e o equilíbrio entre as áreas da vida."

- **Saudação + streak** (ex.: 🔥 5 dias) e resumo do check-in de hoje (7h, Leve, 7/10, 8/10, 7/10) com **Editar**.
- **Equilíbrio Geral** — score 0–100 (ex.: 50/100) com gráfico de anel e resumo ("3 áreas em equilíbrio · 2 precisam de atenção").
- **Áreas da Vida** — 5 cards expansíveis, cada um com pontuação, itens em equilíbrio, alertas de atenção e tarefas vinculadas (abertas/concluídas):
  - **Corpo** · **Mente** · **Relacionamentos** · **Recursos** · **Experiências**

O score de cada área é a média dos seus itens (0–10) × 10; o geral é a média das áreas. Itens podem ser criados/editados/removidos. Há integração direta com tarefas (via "Área da vida" no modal).

---

## 5. Empresas (`/empresas`)
"Catálogo central. Vincule tarefas, metas e projetos a uma empresa."

- Campo inline **Nome da empresa… + Adicionar**
- Filtros **Ativas / Arquivadas / Todas** + busca
- Cada empresa exibe **contadores de vínculos** (tarefas concluídas/total, projetos, metas)
- Ações: arquivar / excluir

São a entidade canônica referenciada por tarefas, metas, projetos e pagamentos (únicas por nome, case-insensitive).

---

## 6. Metas (`/metas`)
"Objetivos com prazo. Tarefas e projetos ligados aqui se agregam no progresso."

- Filtros **Ativas / Concluídas / Todos / Vencendo (30d) / Vencidas** + empresa + busca
- Botão **Nova meta**
- Cards com **% de progresso** (barra), prazo, badges (DESTAQUE/ATIVA) e contadores de **ações / tarefas / projetos** vinculados
- O progresso é **agregado automaticamente** dos itens ligados (ex.: "Lançar o App v2" 50%)
- Ações por card: editar / arquivar / excluir (exclusão em cascata afeta filhos)

Categorias: geral / empresa / produto / pessoal.

---

## 7. Pagamentos (`/pagamentos`)
"Entradas, saídas e provisionamento."

- **KPIs:** Saldo atual confirmado, Entradas a receber, Saídas a pagar (com previsto/realizado do mês)
- Alerta de **pagamentos atrasados** com atalho "Ver atrasados"
- Resumo **A vencer / Atrasado / Pago no mês**
- Abas **Lista / Extrato** e sub-abas **Todos / Saídas / Entradas**
- Tabela: **Descrição · Tipo (Saída/Entrada) · Vencimento · Valor · Status** (A vencer/Pago/Atrasado/Recebido), com **recorrência** (Mensal/Semanal/Trimestral/Anual) e ação de **marcar como pago**

Valores armazenados em centavos; recorrências geram lançamentos-filho.

---

## 8. Projetos (`/projetos`)
"Empresas, produtos e iniciativas pessoais."

- Filtros **Todos / Empresas / Produtos / Geral / Pessoal** + empresa + busca
- Agrupados por **categoria**; produtos podem aparecer sob empresas
- Cada projeto: cor, contagem de **tarefas abertas**, expansão
- Suporta **projetos aninhados** (projeto-pai), vínculo a meta e empresa
- Botão **Novo projeto**

---

## 9. Notas (`/notas`)
"Playbooks, credenciais, contatos, decisões e referências."

- Layout **mestre-detalhe** (lista à esquerda, conteúdo à direita)
- Filtros por tipo: **Playbook / Credencial / Contato / Decisão / Referência** + busca
- Cada nota: tipo (badge), vínculo a projeto/empresa, data de atualização
- Painel de detalhe com **editar / arquivar / excluir**
- Suporta anexos; status ativo/rascunho
- Botão **Nova nota**

---

## 10. Arquivo (`/arquivo`)
"Tudo arquivado. Restaure itens ou exclua-os em definitivo."

- Toggle **Lista / Grade**
- Cards por tipo: **Todos / Tarefas / Projetos / Notas / Pagamentos** (com contagem)
- Permite **restaurar** ou **excluir definitivamente** itens arquivados

---

## 11. Configurações (`/settings`)
Hub com três áreas:

### 11.1 Pessoas e assistente (`/settings/people`)
- Adicionar pessoa inline (Nome + Adicionar)
- **Convidar por e-mail** (vincula uma conta de membro; status *Pendente* até aceitar)
- Marcar **Assistente** (1 por owner) que recebe encaminhamentos automáticos
- Usado para **delegação de tarefas** e **follow-ups**

### 11.2 Dispositivos e passkeys (`/settings/devices`)
- Lista de **passkeys** registradas (+ Adicionar passkey)
- **Histórico de aprovações** de dispositivos

### 11.3 Backup (`/settings/backup`)
- **Exportar** — Baixar JSON com pessoas, projetos, notas, pagamentos, tarefas, checklists, anotações e metadados de anexos
- **Importar** — aditivo (insere com novos IDs, não sobrescreve; blobs de anexos não são copiados, só metadados)

> Há também páginas **admin** (owner-only): `/admin/users` e `/admin/users/[id]` para gestão de usuários do tenant e reset de aprovações de dispositivo.

---

## 12. Recursos transversais

### Busca global (⌘F)
Command-palette que retorna resultados **agrupados por tipo** (Tarefas, Projetos, Notas, e demais entidades), navegável por teclado.

### Sincronização (rodapé)
Painel com estado da **fila offline** ("Tudo sincronizado · Nada na fila"), botões **Sincronizar agora** e **Atualizar versão do app** (busca a última versão publicada e recarrega — atualiza o Service Worker).

### Importar / Exportar (cabeçalho)
Atalhos globais de importação/exportação de dados.

---

## 13. Arquitetura (resumo técnico)

- **Frontend:** Nuxt 4, Vue 3, Pinia, TypeScript
- **Backend:** Nitro, PostgreSQL, Drizzle ORM, Better-auth
- **Auth:** OTP por e-mail + Passkeys (WebAuthn) + aprovação de dispositivo; papéis **owner / delegate**
- **API:** ~81 endpoints REST sob `server/api/` (tasks, goals, projects, notes, companies, payments, people, life, agenda, attachments, backup, admin, sync, auth)
- **Offline-first:**
  - Service Worker com cache NetworkFirst para `GET /api/*` (TTL ~2 semanas; `/api/auth/*` excluído)
  - **Outbox** (IndexedDB) com escrita otimista e rollback
  - **Realtime (Fase 2):** token via `/api/sync/token` → WebSocket no worker `comando-sync` (Durable Object por usuário, Hibernation), com reconexão e *ping*; fallback para **polling (Fase 1)**

### Modelo de dados (entidades principais)
`users`, `sessions`, `accounts`, `passkeys`, `deviceApprovals` · `tasks` (+ `checklistItems`, `taskAnnotations`) · `goals` · `projects` · `notes` · `companies` · `payments` · `people` (+ `personInvitations`) · `lifeItems`, `lifeCheckins` · `attachments`.

---

## 14. Achados durante a navegação (QA)

1. **Sobreposição no menu lateral** — "Arquivo" e "Notas" se sobrepõem visualmente a "Configurações" e "Pessoas" no rodapé do menu (z-index/altura). Reproduzível em todas as páginas. *(prioridade: visual)*
2. **Tarefas duplicadas** — itens "Tarefa criada offline" e "Preparar reunião de board" aparecem em duplicidade no Board/Lista; provável reenvio da fila offline (idempotência da outbox a revisar). *(prioridade: dados)*
3. **401 sem sessão** — esperado pela arquitetura offline-first (shell renderiza, API nega), mas pode confundir; vale um *empty state* explícito de "sessão expirada".

---

*Screenshots de apoio em `scratchpad/screenshots/` (01–32): cada página, as 4 visões de Trabalho, o modal de tarefa (Detalhes/Checklist/Histórico/Mais ações), busca global e painel de sincronização.*

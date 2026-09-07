/**
 * O item que a agenda desenha — lógica pura, sem banco e sem Vue.
 *
 * Antes existiam DUAS projeções da agenda, e elas divergiram: `AgendaEvent` no
 * servidor (`server/utils/agendaService.ts`) e `TimelineEvent` no cliente
 * (`app/composables/useAgendaTimeline.ts`), este último com dois campos a mais
 * porque os filtros de empresa precisavam deles. `AgendaItem` substitui os dois.
 *
 * A diferença de fundo em relação ao `TimelineEvent`: ele carregava um objeto
 * `task` aninhado, o que amarrou os cinco componentes de agenda a tarefas — a
 * ponto de `/metas` ter precisado duplicar calendário e timeline (ver o
 * comentário no topo de `app/components/metas/MetaCalendar.vue`). Aqui o item é
 * plano e agnóstico de tipo: quem desenha lê `title`/`tone`/`done`, não
 * `task.title`/`task.type`/`task.done`.
 */

import { addDays } from './rrule'

/** O que o item É — governa ícone, cor e o texto do card. */
export type AgendaItemKind = 'task' | 'followup' | 'goal' | 'project' | 'payment'

/** O que o clique ABRE. `followup` pertence a uma tarefa, então some daqui. */
export type AgendaEntityType = 'task' | 'goal' | 'project' | 'payment'

/**
 * Como o item ocupa o tempo:
 * - `block`     — tem hora e (talvez) fim: vai na grade horária.
 * - `span`      — atravessa dias: vira barra na faixa de dia todo.
 * - `milestone` — um ponto no dia, sem duração (prazo de meta, vencimento).
 */
export type AgendaItemShape = 'block' | 'span' | 'milestone'

/**
 * Chave visual do card. Os quatro primeiros já existiam (`task.type` + `'fup'`);
 * os demais entram com a agenda multi-entidade. Pagamento se divide em entrada e
 * saída porque a cor é a informação principal num vencimento.
 */
export type AgendaTone =
  | 'ceo'
  | 'delegate'
  | 'personal'
  | 'fup'
  | 'goal'
  | 'project'
  | 'payment-in'
  | 'payment-out'

export type AgendaItem = {
  /**
   * Estável entre renders. Ocorrência virtual de uma série recorrente usa
   * `${entryId}:${date}` — ela não existe no banco, então não tem id próprio.
   */
  id: string
  kind: AgendaItemKind
  entityType: AgendaEntityType
  entityId: string
  /** `null` enquanto o item vier das colunas de data legadas (Fase 1). */
  entryId: string | null

  /** `YYYY-MM-DD`. Em série recorrente, a data DESTA ocorrência. */
  date: string
  /** `HH:MM` — nunca `HH:MM:SS`. `null` = dia todo. Ver `normalizeTime`. */
  time: string | null
  /** `YYYY-MM-DD`. Igual a `date` em item de um dia só. */
  endDate: string
  /** `HH:MM` ou `null` quando a duração não foi declarada. */
  endTime: string | null

  shape: AgendaItemShape
  /** Derivado de `time === null`. Existe no shape só para não recalcular na view. */
  allDay: boolean
  recurring: boolean

  title: string
  done: boolean
  tone: AgendaTone
  /** Projeto / empresa / pessoa — JÁ resolvido no servidor. */
  subtitle: string | null

  projectId: string | null
  companyId: string | null
  delegatePersonId: string | null
  delegatePersonName: string | null
  /** Só em `kind === 'payment'`. Negativo não é usado: o sinal vem do `tone`. */
  amountCents: number | null
}

/**
 * `HH:MM:SS` → `HH:MM`.
 *
 * O Postgres devolve `time` com segundos, e nada no cliente normalizava isso: a
 * timeline, o mês e os atrasados renderizavam `10:00:00` na tela. Só o
 * calendário escapava, porque reformata a hora por conta própria. Normalizar
 * aqui, uma vez, em vez de espalhar `.slice(0, 5)` por quatro componentes.
 */
export function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (trimmed.length < 4) return null
  return trimmed.slice(0, 5)
}

/**
 * Fim de um bloco a partir de início + duração em minutos.
 *
 * `tasks` guarda `duration_minutes`, mas `AgendaItem` expressa duração como
 * `endDate`/`endTime` — é o que permite a faixa multi-dia sem um segundo jeito
 * de dizer a mesma coisa. Duração ausente devolve `endTime: null`, e é o
 * componente que decide como pintar (hoje o calendário usa 45min).
 *
 * Passar da meia-noite empurra `endDate`, em vez de truncar: um bloco das 23h
 * com 2h de duração termina às 01:00 do dia seguinte, e é isso que a grade
 * precisa saber para recortar corretamente.
 */
export function blockEnd(
  date: string,
  time: string | null,
  durationMinutes: number | null | undefined,
): { endDate: string; endTime: string | null } {
  if (!time || !durationMinutes || durationMinutes <= 0) {
    return { endDate: date, endTime: null }
  }
  const [h, m] = time.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return { endDate: date, endTime: null }
  const total = h! * 60 + m! + durationMinutes
  const dayOffset = Math.floor(total / 1440)
  const minuteOfDay = total - dayOffset * 1440
  const hh = String(Math.floor(minuteOfDay / 60)).padStart(2, '0')
  const mm = String(minuteOfDay % 60).padStart(2, '0')
  return { endDate: dayOffset > 0 ? addDays(date, dayOffset) : date, endTime: `${hh}:${mm}` }
}

/** Id sintético de uma ocorrência de série. Nunca vai ao banco. */
export function occurrenceId(entryId: string, date: string): string {
  return `${entryId}:${date}`
}

/**
 * Desfaz `occurrenceId`. Devolve `null` quando o id não é de ocorrência — o que
 * é o caso normal de todo item não recorrente.
 */
export function parseOccurrenceId(id: string): { entryId: string; date: string } | null {
  const at = id.lastIndexOf(':')
  if (at <= 0) return null
  const date = id.slice(at + 1)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  return { entryId: id.slice(0, at), date }
}

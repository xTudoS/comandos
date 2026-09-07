/**
 * Ordenação da agenda — lógica pura, sem banco e sem Vue.
 *
 * Existiam TRÊS regras divergentes para a mesma lista:
 *   - servidor  (`server/utils/agendaService.ts`): `time ?? ''`   → sem hora no INÍCIO do dia
 *   - cliente   (`app/composables/useAgendaTimeline.ts`): `'99:99'` → sem hora no FIM do dia
 *   - mês       (`app/components/agenda/AgendaMonth.vue`): com-hora antes de sem-hora
 *
 * A regra única é a do servidor — **sem hora vai para o início do dia** —, e não
 * por antiguidade: é literalmente onde a faixa "dia todo" desenha esses itens,
 * no topo da grade. Qualquer outra escolha deixaria a ordem da lista brigando
 * com a posição na tela.
 */

import type { AgendaItem } from './agendaItem'

/**
 * Chave lexicográfica comparável com `<`. Os campos, em ordem de peso:
 *
 * 1. `date`  — o dia manda.
 * 2. dia todo antes de item com hora (a faixa fica no topo).
 * 3. `time`  — cronológico dentro do dia.
 * 4. `span` antes de `block`/`milestone`: a barra que atravessa dias é o pano
 *    de fundo do dia, então vem antes do que acontece dentro dele.
 * 5. `id`    — desempate estável. Sem ele a ordem oscila entre renders quando
 *    dois itens empatam em tudo, e a lista "pisca" ao revalidar.
 */
export function agendaSortKey(item: AgendaItem): string {
  const allDayRank = item.allDay ? '0' : '1'
  const time = item.time ?? '00:00'
  const shapeRank = item.shape === 'span' ? '0' : '1'
  return `${item.date}|${allDayRank}|${time}|${shapeRank}|${item.id}`
}

export function compareAgendaItems(a: AgendaItem, b: AgendaItem): number {
  const ka = agendaSortKey(a)
  const kb = agendaSortKey(b)
  return ka < kb ? -1 : ka > kb ? 1 : 0
}

/** Ordena sem mutar a lista recebida. */
export function sortAgendaItems(items: AgendaItem[]): AgendaItem[] {
  return [...items].sort(compareAgendaItems)
}

/**
 * Agrupa por dia, já ordenado, com os dias em ordem crescente.
 *
 * É o que month/overdue/lista precisam, e cada um montava o seu. Devolve `Map`
 * (e não objeto) porque `Map` preserva a ordem de inserção para chaves string
 * — objeto também preservaria aqui, mas só por acidente das chaves não serem
 * numéricas, e `YYYY-MM-DD` estar a um passo de virar índice é risco à toa.
 */
export function groupAgendaItemsByDay(items: AgendaItem[]): Map<string, AgendaItem[]> {
  const out = new Map<string, AgendaItem[]>()
  for (const item of sortAgendaItems(items)) {
    const bucket = out.get(item.date)
    if (bucket) bucket.push(item)
    else out.set(item.date, [item])
  }
  return out
}

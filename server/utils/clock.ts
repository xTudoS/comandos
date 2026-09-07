/**
 * Relógio do dono da agenda.
 *
 * O app roda em Cloudflare Workers, onde `new Date()` é sempre UTC. Isso nunca
 * importou porque nada aqui convertia fuso — o campo `timezone` que existia nos
 * links de agendamento era um rótulo exibido na tela, sem efeito nenhum.
 *
 * Passou a importar quando as faixas livres precisaram esconder o que já passou:
 * às 20h em São Paulo o servidor acha que são 23h do mesmo dia (ou 2h do dia
 * seguinte, no horário de verão do hemisfério norte), e o visitante veria a
 * agenda do dia errado.
 *
 * A decisão é uma constante única, não uma coluna. O app é pt-BR-only e não tem
 * nenhum outro lugar que pergunte fuso ao usuário; inventar uma coluna agora
 * seria carregar migração e UI por um caso que não existe. Quando existir, é
 * aqui — e só aqui — que o valor deixa de ser constante.
 */

export const OWNER_TIMEZONE = 'America/Sao_Paulo'

// Instanciar Intl.DateTimeFormat não é barato e o formato nunca muda; o
// formatter é criado uma vez e reusado por todas as requisições do isolate.
const PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: OWNER_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  // `hourCycle: 'h23'` e não `hour12: false`: este devolve '24' à meia-noite em
  // algumas versões do ICU, o que viraria 1440 minutos e esconderia o dia todo.
  hourCycle: 'h23',
})

function parts(at: Date): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of PARTS.formatToParts(at)) out[p.type] = p.value
  return out
}

/** Data de hoje ('YYYY-MM-DD') no relógio do dono. */
export function todayInOwnerTz(at: Date = new Date()): string {
  const p = parts(at)
  return `${p.year}-${p.month}-${p.day}`
}

/** Minutos desde 00:00 agora, no relógio do dono. */
export function nowMinutesInOwnerTz(at: Date = new Date()): number {
  const p = parts(at)
  return (Number(p.hour) % 24) * 60 + Number(p.minute)
}

/**
 * "Está atrasado?" no servidor — mesma regra de `app/utils/overdue.ts`:
 * venceu antes de hoje e não foi concluído.
 *
 * O cliente continua sendo a autoridade para o que ele PINTA na tela (é lá que
 * o relógio do usuário existe). Isto aqui é para quem responde sem tela: as
 * ferramentas de IA precisam filtrar atrasadas no servidor, e sem esta função
 * cada chamador reinventaria a comparação — que foi exatamente como o bug do
 * `toISOString()` (UTC, um dia à frente depois das 21h) nasceu no cliente.
 *
 * `dueDate` é o vencimento efetivo já resolvido (scheduledDate ?? followupDate).
 */
export function isOverdueOn(
  dueDate: string | null,
  done: boolean,
  today: string = todayInOwnerTz(),
): boolean {
  if (!dueDate || done) return false
  return dueDate < today
}

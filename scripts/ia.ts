/**
 * Interface "IA nativa" para o banco do Comando — acesso DIRETO ao Postgres,
 * sem passar pela API/Nitro/auth. Pensada para um agente (Claude Code) operar o
 * app pela linha de comando: descobre o próprio catálogo (`help`), fala JSON e
 * tem um escape hatch de SQL cru.
 *
 * Uso:
 *   pnpm ia help
 *   pnpm ia tasks --horizon core7 --done false
 *   pnpm ia task.create --title "Ligar pro cliente" --horizon core7
 *   pnpm ia sql "select count(*) from tasks"
 *
 * Conexão: $DATABASE_URL, senão o `.env` da raiz, senão o default de dev.
 * NADA aqui aplica as regras de acesso do app (accessFilter) — é acesso root ao
 * banco de dev. Não aponte para produção sem saber o que está fazendo.
 */
import { Pool, types } from 'pg'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_URL = 'postgres://postgres:postgres@localhost:5432/comando_dev'

function connectionString(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const env = readFileSync(resolve(ROOT, '.env'), 'utf8')
    const line = env.split('\n').find((l) => l.trim().startsWith('DATABASE_URL='))
    if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
  } catch {
    /* sem .env — cai no default */
  }
  return DEFAULT_URL
}

// ---------------------------------------------------------------- args

type Flags = Record<string, string | boolean>

/** `--key value`, `--key=value` e `--flag` (booleano). O resto é posicional. */
function parseArgs(argv: string[]): { positional: string[]; flags: Flags } {
  const positional: string[] = []
  const flags: Flags = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (!a.startsWith('--')) {
      positional.push(a)
      continue
    }
    const body = a.slice(2)
    const eq = body.indexOf('=')
    if (eq !== -1) {
      flags[body.slice(0, eq)] = body.slice(eq + 1)
      continue
    }
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      flags[body] = next
      i++
    } else {
      flags[body] = true
    }
  }
  return { positional, flags }
}

function str(flags: Flags, key: string): string | undefined {
  const v = flags[key]
  if (v === undefined) return undefined
  return typeof v === 'boolean' ? String(v) : v
}

function bool(flags: Flags, key: string): boolean | undefined {
  const v = flags[key]
  if (v === undefined) return undefined
  if (typeof v === 'boolean') return v
  if (['true', '1', 'yes', 'sim'].includes(v.toLowerCase())) return true
  if (['false', '0', 'no', 'nao', 'não'].includes(v.toLowerCase())) return false
  throw new Error(`--${key} espera booleano, recebi "${v}"`)
}

function int(flags: Flags, key: string): number | undefined {
  const v = str(flags, key)
  if (v === undefined) return undefined
  const n = Number(v)
  if (!Number.isFinite(n)) throw new Error(`--${key} espera número, recebi "${v}"`)
  return n
}

/** `null`/`""` viram NULL de verdade — é como se limpa uma FK ou uma data. */
function nullable(flags: Flags, key: string): string | null | undefined {
  const v = str(flags, key)
  if (v === undefined) return undefined
  if (v === 'null' || v === '') return null
  return v
}

// ---------------------------------------------------------------- db

// `date` cru como string: o parser default do pg vira Date em horário local e
// 2026-08-22 sai como "2026-08-21T22:00Z" — dia errado na leitura do agente.
types.setTypeParser(1082, (v) => v)

const pool = new Pool({ connectionString: connectionString(), max: 2 })

async function q<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query(sql, params)
  return res.rows as T[]
}

function out(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + '\n')
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Aceita uuid, email ou nome (case-insensitive, match parcial). */
async function resolveUser(ref: string): Promise<string> {
  if (UUID_RE.test(ref)) return ref
  const rows = await q<{ id: string; email: string }>(
    `select id, email from users where lower(email) = lower($1) or lower(name) like lower($2) limit 2`,
    [ref, `%${ref}%`],
  )
  if (rows.length === 0) throw new Error(`Usuário não encontrado: "${ref}"`)
  if (rows.length > 1) throw new Error(`"${ref}" é ambíguo: ${rows.map((r) => r.email).join(', ')}`)
  return rows[0]!.id
}

/** Dono padrão das operações: --owner, senão $IA_OWNER, senão o único/primeiro
 * usuário com role=owner. Sem isso não dá pra criar tarefa (owner é NOT NULL). */
async function defaultOwner(flags: Flags): Promise<string> {
  const ref = str(flags, 'owner') ?? process.env.IA_OWNER
  if (ref) return resolveUser(ref)
  const rows = await q<{ id: string }>(
    `select id from users where role = 'owner' order by created_at limit 1`,
  )
  if (!rows[0]) throw new Error('Nenhum usuário com role=owner no banco. Passe --owner <email>.')
  return rows[0].id
}

/** Aceita uuid ou nome parcial de uma pessoa (people) do dono. */
async function resolvePerson(ref: string, ownerUserId: string): Promise<string> {
  if (UUID_RE.test(ref)) return ref
  const rows = await q<{ id: string; name: string }>(
    `select id, name from people where owner_user_id = $1 and lower(name) like lower($2) limit 2`,
    [ownerUserId, `%${ref}%`],
  )
  if (rows.length === 0) throw new Error(`Pessoa não encontrada: "${ref}"`)
  if (rows.length > 1) throw new Error(`"${ref}" é ambíguo: ${rows.map((r) => r.name).join(', ')}`)
  return rows[0]!.id
}

/** Nem toda migration está aplicada em todo banco de dev — as consultas
 * opcionais (participantes, quadros) checam antes de tocar na tabela. */
async function hasTable(name: string): Promise<boolean> {
  const rows = await q(`select 1 from information_schema.tables where table_name = $1`, [name])
  return rows.length > 0
}

// ---------------------------------------------------------------- tasks

/** Colunas de `tasks` expostas para escrita, com o casting que o PG precisa. */
const TASK_FIELDS: Record<string, { col: string; cast?: string; kind: 'text' | 'bool' | 'int' }> = {
  title: { col: 'title', kind: 'text' },
  description: { col: 'description', kind: 'text' },
  horizon: { col: 'horizon', cast: 'task_horizon', kind: 'text' },
  type: { col: 'type', cast: 'task_type', kind: 'text' },
  micro: { col: 'is_micro', kind: 'bool' },
  project: { col: 'project_id', cast: 'uuid', kind: 'text' },
  goal: { col: 'goal_id', cast: 'uuid', kind: 'text' },
  company: { col: 'company_id', cast: 'uuid', kind: 'text' },
  'life-area': { col: 'life_area', cast: 'life_area', kind: 'text' },
  'life-item': { col: 'life_item_id', cast: 'uuid', kind: 'text' },
  date: { col: 'scheduled_date', cast: 'date', kind: 'text' },
  time: { col: 'scheduled_time', cast: 'time', kind: 'text' },
  duration: { col: 'duration_minutes', kind: 'int' },
  'followup-active': { col: 'followup_active', kind: 'bool' },
  'followup-date': { col: 'followup_date', cast: 'date', kind: 'text' },
  'followup-description': { col: 'followup_description', kind: 'text' },
  archived: { col: 'archived', kind: 'bool' },
  done: { col: 'done', kind: 'bool' },
}

const TASK_SELECT = `
  t.id, t.title, t.description, t.horizon, t.is_micro as micro, t.type,
  t.done, t.archived, t.scheduled_date, t.scheduled_time, t.duration_minutes,
  t.followup_active, t.followup_date, t.followup_description,
  t.project_id, t.goal_id, t.company_id, t.life_area, t.life_item_id,
  t.owner_user_id, t.delegate_person_id, t.completed_at, t.created_at, t.updated_at,
  u.email as owner_email, p.name as delegate_name, pr.name as project_name,
  g.title as goal_title, c.name as company_name`

const TASK_JOINS = `
  from tasks t
  left join users u on u.id = t.owner_user_id
  left join people p on p.id = t.delegate_person_id
  left join projects pr on pr.id = t.project_id
  left join goals g on g.id = t.goal_id
  left join companies c on c.id = t.company_id`

async function cmdTasks(flags: Flags): Promise<void> {
  const where: string[] = []
  const params: unknown[] = []
  const push = (clause: string, value: unknown) => {
    params.push(value)
    where.push(clause.replace('?', `$${params.length}`))
  }

  const ownerRef = str(flags, 'owner') ?? process.env.IA_OWNER
  if (ownerRef) push('t.owner_user_id = ?', await resolveUser(ownerRef))

  const horizon = str(flags, 'horizon')
  if (horizon) {
    const list = horizon.split(',').map((h) => h.trim())
    push('t.horizon = any(?::task_horizon[])', list)
  }
  const type = str(flags, 'type')
  if (type) push('t.type = ?::task_type', type)

  const done = bool(flags, 'done')
  if (done !== undefined) push('t.done = ?', done)
  // Arquivadas ficam fora por padrão — é o que o app faz em todas as listas.
  const archived = bool(flags, 'archived')
  push('t.archived = ?', archived ?? false)

  const micro = bool(flags, 'micro')
  if (micro !== undefined) push('t.is_micro = ?', micro)

  const search = str(flags, 'q')
  if (search) {
    // Um só placeholder para os dois ilike — `push` substitui apenas o primeiro `?`.
    params.push(`%${search}%`)
    where.push(`(t.title ilike $${params.length} or t.description ilike $${params.length})`)
  }

  const from = str(flags, 'from')
  if (from) push('t.scheduled_date >= ?::date', from)
  const to = str(flags, 'to')
  if (to) push('t.scheduled_date <= ?::date', to)
  if (bool(flags, 'scheduled')) where.push('t.scheduled_date is not null')
  if (bool(flags, 'overdue')) {
    where.push('t.scheduled_date < current_date and t.done = false')
  }
  const project = str(flags, 'project')
  if (project) push('t.project_id = ?::uuid', project)
  const goal = str(flags, 'goal')
  if (goal) push('t.goal_id = ?::uuid', goal)
  const delegate = str(flags, 'delegate')
  if (delegate) push('t.delegate_person_id = ?::uuid', await resolvePerson(delegate, await defaultOwner(flags)))

  const limit = int(flags, 'limit') ?? 50
  const rows = await q(
    `select ${TASK_SELECT} ${TASK_JOINS}
     ${where.length ? 'where ' + where.join(' and ') : ''}
     order by t.scheduled_date nulls last, t.created_at desc
     limit ${limit}`,
    params,
  )
  out({ count: rows.length, tasks: rows })
}

async function cmdTaskGet(id: string): Promise<void> {
  const [task] = await q(`select ${TASK_SELECT} ${TASK_JOINS} where t.id = $1`, [id])
  if (!task) throw new Error(`Tarefa não encontrada: ${id}`)
  const checklist = await q(
    `select id, text, done, position, done_at from checklist_items where task_id = $1 order by position`,
    [id],
  )
  const annotations = await q(
    `select a.id, a.body, a.created_at, u.email as author
     from task_annotations a left join users u on u.id = a.author_user_id
     where a.task_id = $1 order by a.created_at`,
    [id],
  )
  const participants = (await hasTable('task_participants'))
    ? await q(
        `select p.id, p.name, p.email from task_participants tp
         join people p on p.id = tp.person_id where tp.task_id = $1 order by p.name`,
        [id],
      )
    : []
  out({ ...task, checklist, annotations, participants })
}

async function cmdTaskCreate(flags: Flags): Promise<void> {
  const title = str(flags, 'title')
  if (!title) throw new Error('--title é obrigatório')
  const owner = await defaultOwner(flags)
  const createdBy = str(flags, 'created-by') ? await resolveUser(str(flags, 'created-by')!) : owner

  const cols = ['owner_user_id', 'created_by_user_id', 'title']
  const values: unknown[] = [owner, createdBy, title]
  const casts: (string | undefined)[] = ['uuid', 'uuid', undefined]

  for (const [flag, def] of Object.entries(TASK_FIELDS)) {
    if (flag === 'title') continue
    const raw = nullable(flags, flag)
    if (raw === undefined) continue
    cols.push(def.col)
    casts.push(def.cast)
    values.push(def.kind === 'bool' ? bool(flags, flag) : def.kind === 'int' ? int(flags, flag) : raw)
  }
  const delegate = str(flags, 'delegate')
  if (delegate) {
    cols.push('delegate_person_id')
    casts.push('uuid')
    values.push(await resolvePerson(delegate, owner))
  }

  const placeholders = cols.map((_, i) => `$${i + 1}${casts[i] ? `::${casts[i]}` : ''}`)
  const [row] = await q(
    `insert into tasks (${cols.join(', ')}) values (${placeholders.join(', ')}) returning *`,
    values,
  )
  out({ created: row })
}

async function cmdTaskUpdate(id: string, flags: Flags): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = []
  for (const [flag, def] of Object.entries(TASK_FIELDS)) {
    const raw = nullable(flags, flag)
    if (raw === undefined) continue
    const value = def.kind === 'bool' ? bool(flags, flag) : def.kind === 'int' ? int(flags, flag) : raw
    values.push(value)
    sets.push(`${def.col} = $${values.length}${def.cast ? `::${def.cast}` : ''}`)
  }
  const delegate = nullable(flags, 'delegate')
  if (delegate !== undefined) {
    const [{ owner_user_id }] = await q<{ owner_user_id: string }>(
      `select owner_user_id from tasks where id = $1`,
      [id],
    )
    values.push(delegate === null ? null : await resolvePerson(delegate, owner_user_id))
    sets.push(`delegate_person_id = $${values.length}::uuid`)
  }
  if (sets.length === 0) throw new Error('Nada para atualizar. Veja `pnpm ia help` para os campos.')
  // `done` manda no completed_at, igual ao tasksService.
  const doneFlag = bool(flags, 'done')
  if (doneFlag !== undefined) sets.push(doneFlag ? 'completed_at = now()' : 'completed_at = null')
  sets.push('updated_at = now()')
  values.push(id)
  const [row] = await q(
    `update tasks set ${sets.join(', ')} where id = $${values.length} returning *`,
    values,
  )
  if (!row) throw new Error(`Tarefa não encontrada: ${id}`)
  out({ updated: row })
}

async function cmdTaskDone(id: string, done: boolean): Promise<void> {
  const [row] = await q(
    `update tasks set done = $2, completed_at = case when $2 then now() else null end,
     updated_at = now() where id = $1 returning id, title, done, completed_at`,
    [id, done],
  )
  if (!row) throw new Error(`Tarefa não encontrada: ${id}`)
  out({ updated: row })
}

async function cmdTaskDelete(id: string): Promise<void> {
  const [row] = await q(`delete from tasks where id = $1 returning id, title`, [id])
  if (!row) throw new Error(`Tarefa não encontrada: ${id}`)
  out({ deleted: row })
}

async function cmdChecklistAdd(taskId: string, text: string): Promise<void> {
  const [{ next }] = await q<{ next: number }>(
    `select coalesce(max(position) + 1, 0) as next from checklist_items where task_id = $1`,
    [taskId],
  )
  const [row] = await q(
    `insert into checklist_items (task_id, text, position) values ($1, $2, $3) returning *`,
    [taskId, text, next],
  )
  out({ created: row })
}

async function cmdChecklistToggle(itemId: string, flags: Flags): Promise<void> {
  const done = bool(flags, 'done')
  const [row] = await q(
    `update checklist_items
     set done = coalesce($2, not done),
         done_at = case when coalesce($2, not done) then now() else null end,
         updated_at = now()
     where id = $1 returning *`,
    [itemId, done ?? null],
  )
  if (!row) throw new Error(`Item não encontrado: ${itemId}`)
  out({ updated: row })
}

async function cmdNoteAdd(taskId: string, body: string, flags: Flags): Promise<void> {
  const author = await defaultOwner(flags)
  const [row] = await q(
    `insert into task_annotations (task_id, author_user_id, body) values ($1, $2, $3) returning *`,
    [taskId, author, body],
  )
  out({ created: row })
}

async function cmdStats(flags: Flags): Promise<void> {
  const ownerRef = str(flags, 'owner') ?? process.env.IA_OWNER
  const owner = ownerRef ? await resolveUser(ownerRef) : null
  const filter = owner ? 'where owner_user_id = $1' : ''
  const params = owner ? [owner] : []
  const byHorizon = await q(
    `select horizon, count(*)::int as total,
            count(*) filter (where done)::int as done,
            count(*) filter (where not done and not archived)::int as open
     from tasks ${filter} group by horizon order by horizon`,
    params,
  )
  const [totals] = await q(
    `select count(*)::int as total,
            count(*) filter (where done)::int as done,
            count(*) filter (where archived)::int as archived,
            count(*) filter (where is_micro and not done)::int as micro_open,
            count(*) filter (where scheduled_date < current_date and not done and not archived)::int as overdue
     from tasks ${filter}`,
    params,
  )
  out({ totals, byHorizon })
}

// ---------------------------------------------------------------- genéricos

const LISTABLE: Record<string, string> = {
  users: 'select id, email, name, role, created_at from users order by created_at',
  people:
    'select p.id, p.name, p.email, p.linked_user_id, u.email as owner_email from people p left join users u on u.id = p.owner_user_id order by p.name',
  projects:
    'select pr.id, pr.name, pr.archived, pr.goal_id, c.name as company_name from projects pr left join companies c on c.id = pr.company_id order by pr.name',
  goals: 'select id, title, horizon, archived, created_at from goals order by created_at',
  companies: 'select id, name, created_at from companies order by name',
  notes: 'select id, title, updated_at from notes order by updated_at desc limit 50',
}

async function cmdSchema(table?: string): Promise<void> {
  if (table) {
    const cols = await q(
      `select column_name, data_type, udt_name, is_nullable, column_default
       from information_schema.columns where table_name = $1 order by ordinal_position`,
      [table],
    )
    if (cols.length === 0) throw new Error(`Tabela não encontrada: ${table}`)
    out({ table, columns: cols })
    return
  }
  // Contagem exata: o banco de dev é pequeno e `reltuples` volta -1 enquanto
  // ninguém rodou ANALYZE, o que não ajuda em nada quem está explorando.
  const names = await q<{ table: string }>(
    `select c.relname as table from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' order by c.relname`,
  )
  const counts = await q<Record<string, number>>(
    `select ${names.map((t) => `(select count(*) from "${t.table}")::int as "${t.table}"`).join(', ')}`,
  )
  const tables = names.map((t) => ({ table: t.table, rows: counts[0]?.[t.table] ?? null }))
  const enums = await q(
    `select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as values
     from pg_type t join pg_enum e on e.enumtypid = t.oid group by t.typname order by t.typname`,
  )
  out({ tables, enums })
}

async function cmdSql(sql: string, flags: Flags, params: string[]): Promise<void> {
  const mutating = /^\s*(insert|update|delete|drop|alter|truncate|create|grant)/i.test(sql)
  if (mutating && !bool(flags, 'write')) {
    throw new Error('SQL que escreve exige --write (proteção contra escrita acidental).')
  }
  const rows = await q(sql, params)
  out({ rowCount: rows.length, rows })
}

// ---------------------------------------------------------------- help

const HELP = `
comando · interface IA nativa do banco (Postgres direto, sem API)

  pnpm ia <comando> [args] [--flags]        # saída sempre em JSON

LEITURA
  tasks [filtros]                 lista tarefas (default: não arquivadas, limit 50)
    filtros: --owner <email|uuid> --horizon core7[,core30,...] --type ceo|delegate|personal
             --done true|false --archived true|false --micro true|false --q <texto>
             --from YYYY-MM-DD --to YYYY-MM-DD --scheduled --overdue
             --project <uuid> --goal <uuid> --delegate <nome|uuid> --limit N
  task <id>                       tarefa completa + checklist + anotações + convidados
  stats [--owner ...]             contagens por horizonte, atrasadas, micro
  users | people | projects | goals | companies | notes
  schema [tabela]                 tabelas + enums, ou colunas de uma tabela

ESCRITA
  task.create --title "..." [campos]        cria tarefa (owner default: role=owner)
  task.update <id> [campos]                 atualiza; valor "null" limpa o campo
  task.done <id> | task.reopen <id>         marca/desmarca concluída (mexe no completed_at)
  task.delete <id>                          apaga (cascata em checklist/anotações)
  checklist.add <taskId> "texto"
  checklist.toggle <itemId> [--done true|false]
  note.add <taskId> "texto"                 anotação na timeline da tarefa

  campos de tarefa: --title --description --horizon --type --micro --date --time
    --duration --project --goal --company --life-area --life-item --delegate
    --followup-active --followup-date --followup-description --archived --done
    --owner --created-by

SQL CRU
  sql "select ..." [param1 param2]          leitura livre ($1, $2 = params)
  sql "update ..." --write                  escrita exige --write

CONEXÃO
  $DATABASE_URL > .env da raiz > ${DEFAULT_URL}
  $IA_OWNER define o dono padrão (email ou uuid) sem repetir --owner.
`.trimStart()

// ---------------------------------------------------------------- dispatch

async function main(): Promise<void> {
  const { positional, flags } = parseArgs(process.argv.slice(2))
  const cmd = positional[0] ?? 'help'
  const a = positional.slice(1)

  switch (cmd) {
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(HELP)
      return
    case 'tasks':
      return cmdTasks(flags)
    case 'task':
      if (!a[0]) throw new Error('Uso: pnpm ia task <id>')
      return cmdTaskGet(a[0])
    case 'task.create':
      return cmdTaskCreate(flags)
    case 'task.update':
      if (!a[0]) throw new Error('Uso: pnpm ia task.update <id> --campo valor')
      return cmdTaskUpdate(a[0], flags)
    case 'task.done':
      if (!a[0]) throw new Error('Uso: pnpm ia task.done <id>')
      return cmdTaskDone(a[0], true)
    case 'task.reopen':
      if (!a[0]) throw new Error('Uso: pnpm ia task.reopen <id>')
      return cmdTaskDone(a[0], false)
    case 'task.delete':
      if (!a[0]) throw new Error('Uso: pnpm ia task.delete <id>')
      return cmdTaskDelete(a[0])
    case 'checklist.add':
      if (!a[0] || !a[1]) throw new Error('Uso: pnpm ia checklist.add <taskId> "texto"')
      return cmdChecklistAdd(a[0], a.slice(1).join(' '))
    case 'checklist.toggle':
      if (!a[0]) throw new Error('Uso: pnpm ia checklist.toggle <itemId>')
      return cmdChecklistToggle(a[0], flags)
    case 'note.add':
      if (!a[0] || !a[1]) throw new Error('Uso: pnpm ia note.add <taskId> "texto"')
      return cmdNoteAdd(a[0], a.slice(1).join(' '), flags)
    case 'stats':
      return cmdStats(flags)
    case 'schema':
      return cmdSchema(a[0])
    case 'sql':
      if (!a[0]) throw new Error('Uso: pnpm ia sql "select ..."')
      return cmdSql(a[0], flags, a.slice(1))
    default:
      if (LISTABLE[cmd]) {
        out(await q(LISTABLE[cmd]!))
        return
      }
      throw new Error(`Comando desconhecido: "${cmd}". Rode \`pnpm ia help\`.`)
  }
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    await pool.end().catch(() => {})
    process.stderr.write(JSON.stringify({ error: err.message ?? String(err) }, null, 2) + '\n')
    process.exit(1)
  })

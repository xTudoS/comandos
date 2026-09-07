import { and, asc, eq, sql } from 'drizzle-orm'
import { lifeItems, lifeCheckins } from '~~/server/db/schema'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'

export type LifeItemRow = typeof lifeItems.$inferSelect
export type LifeCheckinRow = typeof lifeCheckins.$inferSelect
export type LifeAreaKey =
  | 'corpo'
  | 'mente'
  | 'relacionamentos'
  | 'recursos'
  | 'experiencias'
export type TrainingLevel = 'none' | 'light' | 'hard'

const AREA_ORDER: LifeAreaKey[] = [
  'corpo',
  'mente',
  'relacionamentos',
  'recursos',
  'experiencias',
]

/** Itens padrão semeados no primeiro acesso. Os nomes de Corpo/Mente abaixo
 *  são os "alvos" que o check-in diário atualiza — manter em sincronia. */
const DEFAULT_ITEMS: Record<LifeAreaKey, string[]> = {
  corpo: ['Treino', 'Sono', 'Alimentação', 'Saúde'],
  mente: ['Saúde mental', 'Aprendizado', 'Espiritualidade'],
  relacionamentos: ['Família', 'Parceiro(a)', 'Amigos próximos'],
  recursos: ['Finanças', 'Patrimônio', 'Lar e ambiente'],
  experiencias: ['Hobbies', 'Viagens', 'Lazer'],
}

const clamp10 = (n: number) => Math.max(0, Math.min(10, Math.round(n)))

function assertArea(area: string): LifeAreaKey {
  if (!AREA_ORDER.includes(area as LifeAreaKey)) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Área da vida inválida.')
  }
  return area as LifeAreaKey
}

async function seedDefaults(db: Db, userId: string) {
  const values = AREA_ORDER.flatMap((area) =>
    DEFAULT_ITEMS[area].map((name, i) => ({
      ownerUserId: userId,
      area,
      name,
      value: 7,
      sortOrder: i,
    })),
  )
  await db.insert(lifeItems).values(values)
}

export type LifeAggregate = {
  areas: { key: LifeAreaKey; score: number }[]
  overall: number
}

/** Média autoritativa: nota da área = média(itens)*10; geral = média das áreas. */
export function computeAggregate(items: LifeItemRow[]): LifeAggregate {
  const byArea = new Map<LifeAreaKey, number[]>()
  for (const it of items) {
    const key = it.area as LifeAreaKey
    if (!byArea.has(key)) byArea.set(key, [])
    byArea.get(key)!.push(it.value)
  }
  const areas = AREA_ORDER.filter((k) => byArea.has(k)).map((key) => {
    const vals = byArea.get(key)!
    const avg = vals.reduce((s, n) => s + n, 0) / vals.length
    return { key, score: Math.round(avg * 10) }
  })
  const overall = areas.length
    ? Math.round(areas.reduce((s, a) => s + a.score, 0) / areas.length)
    : 0
  return { areas, overall }
}

export async function listLife(
  db: Db,
  args: { userId: string },
): Promise<{ items: LifeItemRow[]; checkins: LifeCheckinRow[]; aggregate: LifeAggregate }> {
  let items = await db
    .select()
    .from(lifeItems)
    .where(eq(lifeItems.ownerUserId, args.userId))
    .orderBy(asc(lifeItems.area), asc(lifeItems.sortOrder), asc(lifeItems.createdAt))

  if (items.length === 0) {
    await seedDefaults(db, args.userId)
    items = await db
      .select()
      .from(lifeItems)
      .where(eq(lifeItems.ownerUserId, args.userId))
      .orderBy(asc(lifeItems.area), asc(lifeItems.sortOrder), asc(lifeItems.createdAt))
  }

  const checkins = await db
    .select()
    .from(lifeCheckins)
    .where(eq(lifeCheckins.ownerUserId, args.userId))
    .orderBy(asc(lifeCheckins.date))

  return { items, checkins, aggregate: computeAggregate(items) }
}

async function assertOwnedItem(
  db: Db,
  args: { userId: string; itemId: string },
): Promise<LifeItemRow> {
  const [row] = await db
    .select()
    .from(lifeItems)
    .where(and(eq(lifeItems.id, args.itemId), eq(lifeItems.ownerUserId, args.userId)))
    .limit(1)
  if (!row) throw createApiError(ErrCode.NOT_FOUND, 'Item não encontrado.')
  return row
}

export async function createLifeItem(
  db: Db,
  // `id` gerado no cliente (offline-first): quando presente, o servidor o honra,
  // evitando id "stale" após o sync. Ver server/api/life/items/index.post.ts.
  args: { userId: string; id?: string; area: string; name: string },
): Promise<LifeItemRow> {
  const area = assertArea(args.area)
  const name = args.name.trim()
  if (!name) throw createApiError(ErrCode.BAD_REQUEST, 'Nome é obrigatório.')
  const maxRows = await db
    .select({ max: sql<number>`coalesce(max(${lifeItems.sortOrder}), -1)` })
    .from(lifeItems)
    .where(and(eq(lifeItems.ownerUserId, args.userId), eq(lifeItems.area, area)))
  const nextOrder = (maxRows[0]?.max ?? -1) + 1
  const [row] = await db
    .insert(lifeItems)
    .values({
      ...(args.id ? { id: args.id } : {}),
      ownerUserId: args.userId,
      area,
      name,
      value: 7,
      sortOrder: nextOrder,
    })
    // Id do cliente já existe = reenvio idempotente da fila offline; não estoura.
    .onConflictDoNothing({ target: lifeItems.id })
    .returning()
  if (!row) {
    if (args.id) {
      const [existing] = await db
        .select()
        .from(lifeItems)
        .where(and(eq(lifeItems.id, args.id), eq(lifeItems.ownerUserId, args.userId)))
        .limit(1)
      if (existing) return existing
    }
    throw createApiError(ErrCode.INTERNAL, 'Falha ao criar item.')
  }
  return row
}

export async function updateLifeItem(
  db: Db,
  args: { userId: string; itemId: string; patch: { name?: string; value?: number } },
): Promise<LifeItemRow> {
  await assertOwnedItem(db, args)
  const patch: Record<string, unknown> = { updatedAt: new Date() }
  if (args.patch.name !== undefined) {
    const name = args.patch.name.trim()
    if (!name) throw createApiError(ErrCode.BAD_REQUEST, 'Nome inválido.')
    patch.name = name
  }
  if (args.patch.value !== undefined) patch.value = clamp10(args.patch.value)
  const [row] = await db
    .update(lifeItems)
    .set(patch)
    .where(and(eq(lifeItems.id, args.itemId), eq(lifeItems.ownerUserId, args.userId)))
    .returning()
  return row!
}

export async function deleteLifeItem(
  db: Db,
  args: { userId: string; itemId: string },
): Promise<void> {
  const item = await assertOwnedItem(db, args)
  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(lifeItems)
    .where(and(eq(lifeItems.ownerUserId, args.userId), eq(lifeItems.area, item.area)))
  if ((countRows[0]?.count ?? 0) <= 1) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Cada área precisa de ao menos um item.')
  }
  await db
    .delete(lifeItems)
    .where(and(eq(lifeItems.id, args.itemId), eq(lifeItems.ownerUserId, args.userId)))
}

export type CheckinInput = {
  date: string
  sleepHours: number
  training: TrainingLevel
  nutrition: number
  mood: number
  energy: number
  note?: string
}

async function setItemByName(
  db: Db,
  userId: string,
  area: LifeAreaKey,
  name: string,
  value: number,
) {
  await db
    .update(lifeItems)
    .set({ value: clamp10(value), updatedAt: new Date() })
    .where(
      and(
        eq(lifeItems.ownerUserId, userId),
        eq(lifeItems.area, area),
        eq(lifeItems.name, name),
      ),
    )
}

export async function upsertCheckin(
  db: Db,
  args: { userId: string; input: CheckinInput },
): Promise<LifeCheckinRow> {
  const i = args.input
  const [row] = await db
    .insert(lifeCheckins)
    .values({
      ownerUserId: args.userId,
      date: i.date,
      sleepHours: i.sleepHours,
      training: i.training,
      nutrition: clamp10(i.nutrition),
      mood: clamp10(i.mood),
      energy: clamp10(i.energy),
      note: i.note ?? '',
    })
    .onConflictDoUpdate({
      target: [lifeCheckins.ownerUserId, lifeCheckins.date],
      set: {
        sleepHours: i.sleepHours,
        training: i.training,
        nutrition: clamp10(i.nutrition),
        mood: clamp10(i.mood),
        energy: clamp10(i.energy),
        note: i.note ?? '',
        updatedAt: new Date(),
      },
    })
    .returning()

  // Reflete o check-in nos itens das áreas Corpo/Mente.
  const sleepScore = clamp10((i.sleepHours / 8) * 10)
  const trainScore = i.training === 'hard' ? 9 : i.training === 'light' ? 6 : 2
  await setItemByName(db, args.userId, 'corpo', 'Sono', sleepScore)
  await setItemByName(db, args.userId, 'corpo', 'Treino', trainScore)
  await setItemByName(db, args.userId, 'corpo', 'Alimentação', clamp10(i.nutrition))
  await setItemByName(db, args.userId, 'mente', 'Saúde mental', clamp10(i.mood))

  return row!
}

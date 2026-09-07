import { and, asc, eq } from 'drizzle-orm'
import { boardMembers, people } from '~~/server/db/schema'
import { assertBoardAccess, assertBoardOwner } from './boardsService'
import { assertPersonOwnedBy } from './peopleService'
import { createApiError, ErrCode } from './errors'
import type { ParticipantInvite } from './tasksService'
import type { Db } from './db'

/** Membro como o cliente vê. `hasAccount` é o que a UI usa para avisar que um
 * convidado sem conta ainda não enxerga nada — o convite é o que fecha o ciclo. */
export type PublicBoardMember = {
  personId: string
  name: string
  email: string | null
  hasAccount: boolean
}

export async function listBoardMembers(db: Db, boardId: string): Promise<PublicBoardMember[]> {
  const rows = await db
    .select({
      personId: boardMembers.personId,
      name: people.name,
      email: people.email,
      linkedUserId: people.linkedUserId,
    })
    .from(boardMembers)
    .innerJoin(people, eq(people.id, boardMembers.personId))
    .where(eq(boardMembers.boardId, boardId))
    .orderBy(asc(people.name))

  return rows.map((r) => ({
    personId: r.personId,
    name: r.name,
    email: r.email,
    hasAccount: r.linkedUserId !== null,
  }))
}

export type AddBoardMemberInput = {
  personId?: string | null
  name?: string | null
  email?: string | null
}

/**
 * Adiciona um membro ao quadro. Só o dono pode — e é ele o dono das `people`,
 * então a pessoa é sempre resolvida no escopo dele.
 *
 * Como ser membro dá acesso a TODAS as tarefas do quadro, quem tem email e
 * ainda não tem conta vinculada entra em `collectInvites`: o endpoint dispara o
 * convite depois do commit, igual ao fluxo de convidado de tarefa.
 */
export async function addBoardMember(
  db: Db,
  args: {
    userId: string
    boardId: string
    input: AddBoardMemberInput
    collectInvites?: ParticipantInvite[]
  },
): Promise<PublicBoardMember[]> {
  await assertBoardOwner(db, { userId: args.userId, boardId: args.boardId })

  let personId: string
  let person: { id: string; name: string; email: string | null; linkedUserId: string | null }

  if (args.input.personId) {
    person = await assertPersonOwnedBy(db, {
      personId: args.input.personId,
      ownerUserId: args.userId,
      errMessage: 'Pessoa não encontrada.',
    })
    personId = person.id
  } else {
    const rawName = args.input.name?.trim()
    const rawEmail = args.input.email?.trim().toLowerCase() || null
    if (!rawName && !rawEmail) {
      throw createApiError(ErrCode.BAD_REQUEST, 'Informe nome ou email do membro.')
    }
    if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
      throw createApiError(ErrCode.BAD_REQUEST, 'Email inválido.')
    }
    const name = rawName || rawEmail!.split('@')[0] || rawEmail!
    const [created] = await db
      .insert(people)
      .values({ ownerUserId: args.userId, name, email: rawEmail })
      .returning()
    if (!created) throw createApiError(ErrCode.INTERNAL, 'Falha ao criar pessoa.')
    person = created
    personId = created.id
  }

  await db
    .insert(boardMembers)
    .values({ boardId: args.boardId, personId })
    // Reenvio da fila offline de um membro já adicionado: não é erro.
    .onConflictDoNothing()

  if (person.email && !person.linkedUserId && args.collectInvites) {
    args.collectInvites.push({
      personId: person.id,
      email: person.email,
      name: person.name,
      ownerUserId: args.userId,
    })
  }

  return await listBoardMembers(db, args.boardId)
}

/**
 * Remove um membro. Os cards que essa pessoa colocou no quadro PERMANECEM — o
 * quadro continua dando acesso a eles para os demais membros. A contrapartida é
 * a regra inversa, sempre disponível: o dono de uma tarefa pode removê-la de
 * qualquer quadro (ver boardCardsService.removeCard).
 */
export async function removeBoardMember(
  db: Db,
  args: { userId: string; boardId: string; personId: string },
): Promise<PublicBoardMember[]> {
  await assertBoardOwner(db, { userId: args.userId, boardId: args.boardId })
  await db
    .delete(boardMembers)
    .where(
      and(eq(boardMembers.boardId, args.boardId), eq(boardMembers.personId, args.personId)),
    )
  return await listBoardMembers(db, args.boardId)
}

/** Sair de um quadro do qual você é membro (não dono). */
export async function leaveBoard(
  db: Db,
  args: { userId: string; boardId: string },
): Promise<void> {
  const { isOwner } = await assertBoardAccess(db, {
    userId: args.userId,
    boardId: args.boardId,
  })
  if (isOwner) {
    throw createApiError(ErrCode.BAD_REQUEST, 'O dono não pode sair do próprio quadro.')
  }
  const mine = await db
    .select({ personId: people.id })
    .from(boardMembers)
    .innerJoin(people, eq(people.id, boardMembers.personId))
    .where(and(eq(boardMembers.boardId, args.boardId), eq(people.linkedUserId, args.userId)))
  for (const m of mine) {
    await db
      .delete(boardMembers)
      .where(
        and(eq(boardMembers.boardId, args.boardId), eq(boardMembers.personId, m.personId)),
      )
  }
}

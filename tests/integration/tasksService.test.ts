import { describe, it, expect } from 'vitest'
import { eq } from 'drizzle-orm'
import { tasks, auditLog, people } from '~~/server/db/schema'
import {
  listTasks,
  getTask,
  createTask,
  updateTask,
  completeTask,
  archiveTask,
  reassignTask,
  deleteTask,
  taskForBroadcast,
  type ParticipantInvite,
} from '~~/server/utils/tasksService'
import { createPerson, setAssistant } from '~~/server/utils/peopleService'
import { useTestDb, seedUser } from './helpers'

async function linkPerson(
  db: Awaited<ReturnType<typeof useTestDb>>['db'],
  args: { personId: string; userId: string },
) {
  await db.update(people).set({ linkedUserId: args.userId }).where(eq(people.id, args.personId))
}

describe('tasksService', () => {
  describe('listTasks', () => {
    it('returns owner + delegated-to-me tasks; excludes archived and cross-owner', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const maria = await seedUser(db, { email: 'maria@example.com' })
        const mariaPerson = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
        await linkPerson(db, { personId: mariaPerson.id, userId: maria })

        const owned = await createTask(db, { userId: alice, input: { title: 'Owned' } })
        const delegated = await createTask(db, {
          userId: alice,
          input: { title: 'Delegada', type: 'delegate', delegatePersonId: mariaPerson.id },
        })
        await archiveTask(db, { userId: alice, taskId: owned.id, archived: true })

        const mariaTasks = await listTasks(db, { userId: maria })
        expect(mariaTasks.map((t) => t.id)).toEqual([delegated.id])

        const aliceTasks = await listTasks(db, { userId: alice })
        // Alice sees delegated only (owned was archived)
        expect(aliceTasks.map((t) => t.id)).toEqual([delegated.id])

        const aliceAll = await listTasks(db, { userId: alice, includeArchived: true })
        expect(aliceAll).toHaveLength(2)
      } finally {
        await pool.end()
      }
    })

    it('denormalizes delegate name and creator name for UI', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const maria = await seedUser(db, { email: 'maria@example.com' })
        const mariaPerson = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
        await linkPerson(db, { personId: mariaPerson.id, userId: maria })
        const t = await createTask(db, {
          userId: alice,
          input: { title: 'T', type: 'delegate', delegatePersonId: mariaPerson.id },
        })
        const [row] = await listTasks(db, { userId: alice })
        expect(row!.id).toBe(t.id)
        expect(row!.delegatePersonName).toBe('Maria')
        expect(row!.delegateLinkedUserId).toBe(maria)
        expect(row!.createdByName).toBe('alice')
        expect(row!.ownerName).toBe('alice')
      } finally {
        await pool.end()
      }
    })

    it('convidado com conta vinculada vê a tarefa (com o nome do dono para o badge)', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const maria = await seedUser(db, { email: 'maria@example.com' })
        const mariaPerson = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
        await linkPerson(db, { personId: mariaPerson.id, userId: maria })

        const t = await createTask(db, {
          userId: alice,
          input: { title: 'Reunião', participants: [{ personId: mariaPerson.id }] },
        })
        await createTask(db, { userId: alice, input: { title: 'Só da Alice' } })

        const mariaTasks = await listTasks(db, { userId: maria })
        expect(mariaTasks.map((r) => r.id)).toEqual([t.id])
        expect(mariaTasks[0]!.ownerName).toBe('alice')
        expect(mariaTasks[0]!.participants).toEqual([
          { personId: mariaPerson.id, name: 'Maria' },
        ])
      } finally {
        await pool.end()
      }
    })

    it('convidado SEM conta vinculada não vê nada (convite ainda pendente)', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const other = await seedUser(db, { email: 'other@example.com' })
        const p = await createPerson(db, { ownerUserId: alice, name: 'Maria' })

        await createTask(db, {
          userId: alice,
          input: { title: 'Reunião', participants: [{ personId: p.id }] },
        })

        expect(await listTasks(db, { userId: other })).toEqual([])
      } finally {
        await pool.end()
      }
    })
  })

  describe('createTask', () => {
    it('type=ceo leaves delegatePersonId null', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const t = await createTask(db, { userId: alice, input: { title: 'Solo' } })
        expect(t.type).toBe('ceo')
        expect(t.delegatePersonId).toBeNull()
      } finally {
        await pool.end()
      }
    })

    it('type=delegate + delegatePersonId uses the existing person', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const p = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
        const t = await createTask(db, {
          userId: alice,
          input: { title: 'X', type: 'delegate', delegatePersonId: p.id },
        })
        expect(t.delegatePersonId).toBe(p.id)
      } finally {
        await pool.end()
      }
    })

    it('type=delegate + delegateName creates the person on the fly', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const t = await createTask(db, {
          userId: alice,
          input: { title: 'X', type: 'delegate', delegateName: '  Carlos  ' },
        })
        expect(t.delegatePersonId).not.toBeNull()
        const [p] = await db.select().from(people).where(eq(people.id, t.delegatePersonId!))
        expect(p!.name).toBe('Carlos')
        expect(p!.ownerUserId).toBe(alice)
      } finally {
        await pool.end()
      }
    })

    it('type=delegate without id or name is BAD_REQUEST', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        await expect(
          createTask(db, { userId: alice, input: { title: 'X', type: 'delegate' } }),
        ).rejects.toMatchObject({ statusCode: 400, data: { error: { code: 'ERR_BAD_REQUEST' } } })
      } finally {
        await pool.end()
      }
    })

    it('type=delegate rejects a person from another owner', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const bob = await seedUser(db, { email: 'bob@example.com' })
        const bobPerson = await createPerson(db, { ownerUserId: bob, name: 'Intruder' })
        await expect(
          createTask(db, {
            userId: alice,
            input: { title: 'X', type: 'delegate', delegatePersonId: bobPerson.id },
          }),
        ).rejects.toMatchObject({ statusCode: 400, data: { error: { code: 'ERR_BAD_REQUEST' } } })
      } finally {
        await pool.end()
      }
    })

    it('type=personal without assistant configured returns ERR_NO_ASSISTANT', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        await expect(
          createTask(db, { userId: alice, input: { title: 'Pessoal', type: 'personal' } }),
        ).rejects.toMatchObject({ statusCode: 409, data: { error: { code: 'ERR_NO_ASSISTANT' } } })
      } finally {
        await pool.end()
      }
    })

    it('type=personal auto-routes to the configured assistant', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const maria = await seedUser(db, { email: 'maria@example.com' })
        const p = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
        await linkPerson(db, { personId: p.id, userId: maria })
        await setAssistant(db, { ownerUserId: alice, personId: p.id })

        const t = await createTask(db, {
          userId: alice,
          input: { title: 'Pessoal', type: 'personal' },
        })
        expect(t.delegatePersonId).toBe(p.id)
      } finally {
        await pool.end()
      }
    })

    it('rejects followupHolderPersonId pointing at a person from another owner', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const bob = await seedUser(db, { email: 'bob@example.com' })
        const bobPerson = await createPerson(db, { ownerUserId: bob, name: 'BobsPerson' })
        await expect(
          createTask(db, {
            userId: alice,
            input: { title: 'T', followupHolderPersonId: bobPerson.id },
          }),
        ).rejects.toMatchObject({ statusCode: 400, data: { error: { code: 'ERR_BAD_REQUEST' } } })
      } finally {
        await pool.end()
      }
    })

    it('writes a create audit row', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const t = await createTask(db, { userId: alice, input: { title: 'T' } })
        const [audit] = await db.select().from(auditLog).where(eq(auditLog.entityId, t.id))
        expect(audit!.entityType).toBe('task')
        expect(audit!.action).toBe('create')
        expect(audit!.actorUserId).toBe(alice)
      } finally {
        await pool.end()
      }
    })

    it('enfileira convite para contato JÁ EXISTENTE com email e sem conta vinculada', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const semConta = await createPerson(db, {
          ownerUserId: alice,
          name: 'Maria',
          email: 'maria@example.com',
        })
        const semEmail = await createPerson(db, { ownerUserId: alice, name: 'João' })
        const jaVinculada = await createPerson(db, {
          ownerUserId: alice,
          name: 'Ana',
          email: 'ana@example.com',
        })
        const ana = await seedUser(db, { email: 'ana@example.com' })
        await linkPerson(db, { personId: jaVinculada.id, userId: ana })

        const invites: ParticipantInvite[] = []
        await createTask(db, {
          userId: alice,
          input: {
            title: 'Reunião',
            participants: [
              { personId: semConta.id },
              { personId: semEmail.id },
              { personId: jaVinculada.id },
            ],
          },
          collectInvites: invites,
        })

        // Só quem tem email E ainda não tem conta entra na fila de convite.
        expect(invites).toEqual([
          {
            personId: semConta.id,
            email: 'maria@example.com',
            name: 'Maria',
            ownerUserId: alice,
          },
        ])
      } finally {
        await pool.end()
      }
    })
  })

  describe('taskForBroadcast', () => {
    it('inclui os convidados vinculados no conjunto de acesso do tempo real', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const maria = await seedUser(db, { email: 'maria@example.com' })
        const joao = await seedUser(db, { email: 'joao@example.com' })
        const mariaPerson = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
        await linkPerson(db, { personId: mariaPerson.id, userId: maria })
        const joaoPerson = await createPerson(db, { ownerUserId: alice, name: 'João' })
        await linkPerson(db, { personId: joaoPerson.id, userId: joao })
        const semConta = await createPerson(db, { ownerUserId: alice, name: 'Sem conta' })

        const t = await createTask(db, {
          userId: alice,
          input: {
            title: 'Reunião',
            type: 'delegate',
            delegatePersonId: joaoPerson.id,
            participants: [{ personId: mariaPerson.id }, { personId: semConta.id }],
          },
        })

        const info = await taskForBroadcast(db, t.id)
        expect(info).not.toBeNull()
        expect([...info!.access].sort()).toEqual([alice, joao, maria].sort())
        // linkedUserId é interno: não vaza no payload dos convidados.
        expect(info!.row.participants).toEqual(
          expect.arrayContaining([
            { personId: mariaPerson.id, name: 'Maria' },
            { personId: semConta.id, name: 'Sem conta' },
          ]),
        )
        expect(info!.row.ownerName).toBe('alice')
      } finally {
        await pool.end()
      }
    })
  })

  describe('updateTask', () => {
    it('owner can edit their own task; audit records the diff', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const t = await createTask(db, { userId: alice, input: { title: 'Old' } })
        await db.delete(auditLog)
        const updated = await updateTask(db, {
          userId: alice,
          taskId: t.id,
          patch: { title: 'New', horizon: 'core60' },
        })
        expect(updated.title).toBe('New')
        expect(updated.horizon).toBe('core60')
        const [audit] = await db.select().from(auditLog)
        expect(audit!.action).toBe('update')
        const changes = audit!.changes as Record<string, { from: unknown; to: unknown }>
        expect(changes.title).toEqual({ from: 'Old', to: 'New' })
        expect(changes.horizon).toEqual({ from: 'core30', to: 'core60' })
      } finally {
        await pool.end()
      }
    })

    it('delegate (via linked person) can edit a delegated task', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const maria = await seedUser(db, { email: 'maria@example.com' })
        const p = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
        await linkPerson(db, { personId: p.id, userId: maria })
        const t = await createTask(db, {
          userId: alice,
          input: { title: 'Deleg', type: 'delegate', delegatePersonId: p.id },
        })
        const updated = await updateTask(db, {
          userId: maria,
          taskId: t.id,
          patch: { description: 'anotado pelo delegado' },
        })
        expect(updated.description).toBe('anotado pelo delegado')
      } finally {
        await pool.end()
      }
    })

    it('convidado (via pessoa vinculada) pode editar e concluir a tarefa', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const maria = await seedUser(db, { email: 'maria@example.com' })
        const p = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
        await linkPerson(db, { personId: p.id, userId: maria })
        const t = await createTask(db, {
          userId: alice,
          input: { title: 'Reunião', participants: [{ personId: p.id }] },
        })

        const updated = await updateTask(db, {
          userId: maria,
          taskId: t.id,
          patch: { description: 'anotado pelo convidado' },
        })
        expect(updated.description).toBe('anotado pelo convidado')

        const done = await completeTask(db, { userId: maria, taskId: t.id, done: true })
        expect(done.done).toBe(true)
      } finally {
        await pool.end()
      }
    })

    it('unrelated user gets 404 (no enumeration)', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const bob = await seedUser(db, { email: 'bob@example.com' })
        const t = await createTask(db, { userId: alice, input: { title: 'T' } })
        await expect(
          updateTask(db, { userId: bob, taskId: t.id, patch: { title: 'pwn' } }),
        ).rejects.toMatchObject({
          statusCode: 404,
          data: { error: { code: 'ERR_NOT_FOUND' } },
        })
      } finally {
        await pool.end()
      }
    })

    it('rejects updating followupHolderPersonId to a person from another owner (delegate can\'t pin their contact)', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const maria = await seedUser(db, { email: 'maria@example.com' })
        const aliceP = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
        await linkPerson(db, { personId: aliceP.id, userId: maria })
        const t = await createTask(db, {
          userId: alice,
          input: { title: 'T', type: 'delegate', delegatePersonId: aliceP.id },
        })
        const mariaContact = await createPerson(db, { ownerUserId: maria, name: 'Friend' })
        await expect(
          updateTask(db, {
            userId: maria,
            taskId: t.id,
            patch: { followupHolderPersonId: mariaContact.id },
          }),
        ).rejects.toMatchObject({ statusCode: 400, data: { error: { code: 'ERR_BAD_REQUEST' } } })
      } finally {
        await pool.end()
      }
    })

    it('no-op patch returns the row unchanged without writing audit', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const t = await createTask(db, { userId: alice, input: { title: 'T' } })
        await db.delete(auditLog)
        const again = await updateTask(db, { userId: alice, taskId: t.id, patch: {} })
        expect(again.id).toBe(t.id)
        const audits = await db.select().from(auditLog)
        expect(audits).toHaveLength(0)
      } finally {
        await pool.end()
      }
    })
  })

  describe('completeTask', () => {
    it('done=true sets completedAt; done=false clears it', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const t = await createTask(db, { userId: alice, input: { title: 'T' } })
        const completed = await completeTask(db, { userId: alice, taskId: t.id, done: true })
        expect(completed.done).toBe(true)
        expect(completed.completedAt).toBeInstanceOf(Date)

        const uncompleted = await completeTask(db, { userId: alice, taskId: t.id, done: false })
        expect(uncompleted.done).toBe(false)
        expect(uncompleted.completedAt).toBeNull()
      } finally {
        await pool.end()
      }
    })

    it('is idempotent when the flag is already in the target state (no audit noise)', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const t = await createTask(db, { userId: alice, input: { title: 'T' } })
        const first = await completeTask(db, { userId: alice, taskId: t.id, done: true })
        const completedAtFirst = first.completedAt!
        await new Promise((r) => setTimeout(r, 20))
        await db.delete(auditLog)
        const second = await completeTask(db, { userId: alice, taskId: t.id, done: true })
        expect(second.completedAt!.getTime()).toBe(completedAtFirst.getTime())
        const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, t.id))
        expect(audits).toHaveLength(0)
      } finally {
        await pool.end()
      }
    })

    it('audit action is complete / uncomplete depending on direction', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const t = await createTask(db, { userId: alice, input: { title: 'T' } })
        await db.delete(auditLog)
        await completeTask(db, { userId: alice, taskId: t.id, done: true })
        await completeTask(db, { userId: alice, taskId: t.id, done: false })
        const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, t.id))
        expect(audits[0]!.action).toBe('complete')
        expect(audits[1]!.action).toBe('uncomplete')
      } finally {
        await pool.end()
      }
    })
  })

  describe('archiveTask', () => {
    it('flips archived flag with archive/restore audit actions', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const t = await createTask(db, { userId: alice, input: { title: 'T' } })
        await db.delete(auditLog)
        await archiveTask(db, { userId: alice, taskId: t.id, archived: true })
        await archiveTask(db, { userId: alice, taskId: t.id, archived: false })
        const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, t.id))
        expect(audits[0]!.action).toBe('archive')
        expect(audits[1]!.action).toBe('restore')
      } finally {
        await pool.end()
      }
    })
  })

  describe('reassignTask', () => {
    it('creator can reassign; context captures from/to', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const maria = await seedUser(db, { email: 'maria@example.com' })
        const carlos = await seedUser(db, { email: 'carlos@example.com' })
        const pMaria = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
        const pCarlos = await createPerson(db, { ownerUserId: alice, name: 'Carlos' })
        await linkPerson(db, { personId: pMaria.id, userId: maria })
        await linkPerson(db, { personId: pCarlos.id, userId: carlos })

        const t = await createTask(db, {
          userId: alice,
          input: { title: 'T', type: 'delegate', delegatePersonId: pMaria.id },
        })
        await db.delete(auditLog)
        const updated = await reassignTask(db, {
          userId: alice,
          taskId: t.id,
          delegatePersonId: pCarlos.id,
        })
        expect(updated.delegatePersonId).toBe(pCarlos.id)
        expect(updated.type).toBe('delegate')

        const [audit] = await db.select().from(auditLog).where(eq(auditLog.entityId, t.id))
        expect(audit!.action).toBe('reassign')
        const context = audit!.context as Record<string, unknown>
        expect(context.from_delegate).toBe(pMaria.id)
        expect(context.to_delegate).toBe(pCarlos.id)
      } finally {
        await pool.end()
      }
    })

    it('delegate cannot reassign (REASSIGN_FORBIDDEN)', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const maria = await seedUser(db, { email: 'maria@example.com' })
        const carlos = await seedUser(db, { email: 'carlos@example.com' })
        const pMaria = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
        const pCarlos = await createPerson(db, { ownerUserId: alice, name: 'Carlos' })
        await linkPerson(db, { personId: pMaria.id, userId: maria })
        await linkPerson(db, { personId: pCarlos.id, userId: carlos })

        const t = await createTask(db, {
          userId: alice,
          input: { title: 'T', type: 'delegate', delegatePersonId: pMaria.id },
        })
        await expect(
          reassignTask(db, {
            userId: maria,
            taskId: t.id,
            delegatePersonId: pCarlos.id,
          }),
        ).rejects.toMatchObject({
          statusCode: 403,
          data: { error: { code: 'ERR_REASSIGN_FORBIDDEN' } },
        })
      } finally {
        await pool.end()
      }
    })

    it('setting delegatePersonId=null downgrades the task to type=ceo', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const p = await createPerson(db, { ownerUserId: alice, name: 'Maria' })
        const t = await createTask(db, {
          userId: alice,
          input: { title: 'T', type: 'delegate', delegatePersonId: p.id },
        })
        const updated = await reassignTask(db, {
          userId: alice,
          taskId: t.id,
          delegatePersonId: null,
        })
        expect(updated.delegatePersonId).toBeNull()
        expect(updated.type).toBe('ceo')
      } finally {
        await pool.end()
      }
    })

    it('rejects reassigning to a person owned by a different account', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const bob = await seedUser(db, { email: 'bob@example.com' })
        const aliceP = await createPerson(db, { ownerUserId: alice, name: 'A' })
        const bobP = await createPerson(db, { ownerUserId: bob, name: 'B' })
        const t = await createTask(db, {
          userId: alice,
          input: { title: 'T', type: 'delegate', delegatePersonId: aliceP.id },
        })
        await expect(
          reassignTask(db, { userId: alice, taskId: t.id, delegatePersonId: bobP.id }),
        ).rejects.toMatchObject({ statusCode: 400, data: { error: { code: 'ERR_BAD_REQUEST' } } })
      } finally {
        await pool.end()
      }
    })
  })

  describe('deleteTask', () => {
    it('removes the row and writes a delete audit snapshot', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const t = await createTask(db, { userId: alice, input: { title: 'Doomed' } })
        await deleteTask(db, { userId: alice, taskId: t.id })

        const remaining = await db.select().from(tasks).where(eq(tasks.id, t.id))
        expect(remaining).toHaveLength(0)

        const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, t.id))
        const deleteAudit = audits.find((a) => a.action === 'delete')
        expect(deleteAudit).toBeDefined()
        const changes = deleteAudit!.changes as Record<string, { title?: string }>
        expect(changes.delete?.title).toBe('Doomed')
      } finally {
        await pool.end()
      }
    })

    it('rejects deletion by an unrelated user with 404', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const bob = await seedUser(db, { email: 'bob@example.com' })
        const t = await createTask(db, { userId: alice, input: { title: 'T' } })
        await expect(
          deleteTask(db, { userId: bob, taskId: t.id }),
        ).rejects.toMatchObject({
          statusCode: 404,
          data: { error: { code: 'ERR_NOT_FOUND' } },
        })
      } finally {
        await pool.end()
      }
    })
  })

  describe('getTask', () => {
    it('returns the row when accessible', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const t = await createTask(db, { userId: alice, input: { title: 'T' } })
        const fetched = await getTask(db, { userId: alice, taskId: t.id })
        expect(fetched.id).toBe(t.id)
      } finally {
        await pool.end()
      }
    })

    it('throws NOT_FOUND for inaccessible rows (no enumeration)', async () => {
      const { db, pool } = await useTestDb()
      try {
        const alice = await seedUser(db, { email: 'alice@example.com' })
        const bob = await seedUser(db, { email: 'bob@example.com' })
        const t = await createTask(db, { userId: alice, input: { title: 'T' } })
        await expect(getTask(db, { userId: bob, taskId: t.id })).rejects.toMatchObject({
          statusCode: 404,
          data: { error: { code: 'ERR_NOT_FOUND' } },
        })
      } finally {
        await pool.end()
      }
    })
  })
})

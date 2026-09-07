import { and, eq, gt } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'
import { people, personInvitations, users } from '~~/server/db/schema'
import { auditedUpdate, writeAudit } from './audit'
import { createApiError, ErrCode } from './errors'
import type { Db } from './db'

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export type InvitePrepared = {
  invitationId: string
  rawToken: string
  inviteLink: string
  email: string
  personName: string
  inviterName: string
}

/**
 * Creates (or reuses) a user for `email`, links the person row to it, and
 * mints a single-use invitation token. Returns the raw token only to the
 * caller so the endpoint can hand it to the mailer — the DB stores only
 * the sha256 hash. The raw token is never exposed to the HTTP response so
 * intercepting the API call doesn't reveal the invite.
 */
export async function prepareInvitation(
  db: Db,
  args: {
    ownerUserId: string
    inviterName: string
    personId: string
    email: string
    siteUrl: string
  },
): Promise<InvitePrepared> {
  const email = args.email.trim().toLowerCase()
  if (!email) throw createApiError(ErrCode.BAD_REQUEST, 'Email inválido.')

  const [person] = await db
    .select()
    .from(people)
    .where(and(eq(people.id, args.personId), eq(people.ownerUserId, args.ownerUserId)))
    .limit(1)
  if (!person) throw createApiError(ErrCode.NOT_FOUND, 'Pessoa não encontrada.')
  if (person.archived) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Pessoa arquivada não pode receber convite.')
  }
  if (person.linkedUserId) {
    throw createApiError(ErrCode.BAD_REQUEST, 'Pessoa já tem conta vinculada.')
  }

  const rawToken = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')

  const invitation = await db.transaction(async (tx) => {
    let [u] = await tx.select().from(users).where(eq(users.email, email)).limit(1)
    if (!u) {
      const [created] = await tx
        .insert(users)
        .values({ email, name: person.name, role: 'delegate' })
        .returning()
      if (!created) throw createApiError(ErrCode.INTERNAL, 'Falha ao criar conta.')
      u = created
      await writeAudit(tx, {
        entity: 'user',
        entityId: u.id,
        action: 'create',
        actorUserId: args.ownerUserId,
        changes: { create: { email: u.email, role: u.role } },
        context: { via: 'invite', person_id: person.id },
      })
    }

    await auditedUpdate(tx, people, person.id, args.ownerUserId, { linkedUserId: u.id }, {
      entity: 'person',
      context: { via: 'invite', invited_email: email },
    })

    const [inv] = await tx
      .insert(personInvitations)
      .values({
        personId: person.id,
        email,
        tokenHash,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
        invitedByUserId: args.ownerUserId,
      })
      .returning()
    if (!inv) throw createApiError(ErrCode.INTERNAL, 'Falha ao criar convite.')
    return inv
  })

  return {
    invitationId: invitation.id,
    rawToken,
    inviteLink: `${args.siteUrl.replace(/\/$/, '')}/invite/${rawToken}`,
    email,
    personName: person.name,
    inviterName: args.inviterName,
  }
}

/**
 * Dispara convites (email de conta) para convidados recém-adicionados a uma
 * tarefa. Roda DEPOIS do commit — cada convite é isolado: falha de um (email
 * inválido, pessoa já vinculada, mailer fora do ar) não derruba os outros nem
 * o save da tarefa. Best-effort por design.
 */
export async function sendParticipantInvites(
  db: Db,
  mailer: { send: (m: { to: string; subject: string; text: string }) => Promise<unknown> },
  args: {
    inviterName: string
    siteUrl: string
    invites: Array<{ personId: string; email: string; ownerUserId: string }>
  },
): Promise<void> {
  for (const inv of args.invites) {
    try {
      const prepared = await prepareInvitation(db, {
        ownerUserId: inv.ownerUserId,
        inviterName: args.inviterName,
        personId: inv.personId,
        email: inv.email,
        siteUrl: args.siteUrl,
      })
      await mailer.send({
        to: prepared.email,
        subject: 'Você foi convidado para o Comando',
        text:
          `${prepared.inviterName} convidou você para o Comando.\n\n` +
          `Aceite em até 7 dias: ${prepared.inviteLink}\n\n` +
          `Se não reconhece esse convite, pode ignorar este email.`,
      })
    } catch (e) {
      console.warn('[invite] convidado não convidado:', inv.email, (e as Error)?.message)
    }
  }
}

export type AcceptResult = {
  email: string
  userId: string
  personId: string
}

/**
 * Validates the invitation token, flips the invitation to accepted, and marks
 * the linked user's email as verified. Does NOT create a session — the caller
 * should redirect the accepting device through the normal OTP sign-in flow,
 * which will succeed because the fresh user has no passkey yet (the bootstrap
 * guard's proceed branch fires).
 */
export async function acceptInvitation(
  db: Db,
  args: { rawToken: string; optionalName?: string },
): Promise<AcceptResult> {
  const tokenHash = createHash('sha256').update(args.rawToken).digest('hex')
  const now = new Date()

  return await db.transaction(async (tx) => {
    const [inv] = await tx
      .select()
      .from(personInvitations)
      .where(
        and(
          eq(personInvitations.tokenHash, tokenHash),
          eq(personInvitations.status, 'pending'),
          gt(personInvitations.expiresAt, now),
        ),
      )
      .limit(1)
    if (!inv) throw createApiError(ErrCode.INVITATION_EXPIRED, 'Convite inválido ou expirado.')

    const [u] = await tx.select().from(users).where(eq(users.email, inv.email)).limit(1)
    if (!u) throw createApiError(ErrCode.NOT_FOUND, 'Conta não encontrada.')

    // Flip the invitation atomically — defense-in-depth against concurrent
    // accept attempts with the same token. The status='pending' filter in
    // the UPDATE WHERE is what makes this a one-shot: the loser sees zero
    // rows updated and throws. This can't use auditedUpdate because that
    // helper doesn't accept an extra WHERE predicate.
    const flipped = await tx
      .update(personInvitations)
      .set({ status: 'accepted', acceptedAt: now })
      .where(and(eq(personInvitations.id, inv.id), eq(personInvitations.status, 'pending')))
      .returning({ id: personInvitations.id })
    if (!flipped[0]) {
      throw createApiError(ErrCode.INVITATION_EXPIRED, 'Convite já foi aceito.')
    }
    await writeAudit(tx, {
      entity: 'person_invitation',
      entityId: inv.id,
      action: 'update',
      actorUserId: u.id,
      changes: { status: { from: 'pending', to: 'accepted' } },
      context: { via: 'accept', person_id: inv.personId },
    })

    const patch: Record<string, unknown> = { emailVerified: true }
    if (args.optionalName) {
      const trimmed = args.optionalName.trim()
      if (trimmed) patch.name = trimmed
    }
    await auditedUpdate(tx, users, u.id, u.id, patch, {
      entity: 'user',
      context: { via: 'invite_accept', invitation_id: inv.id },
    })

    return { email: inv.email, userId: u.id, personId: inv.personId }
  })
}

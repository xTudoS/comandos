import { z } from 'zod'

/**
 * Schema de criação de tarefa, compartilhado por todas as rotas que criam uma.
 *
 * Hoje são duas: `POST /api/tasks` e `POST /api/boards/:id/cards` (que cria a
 * tarefa e o card na mesma transação). Manter um schema só evita que os dois
 * caminhos aceitem conjuntos de campos diferentes conforme a tarefa ganha
 * colunas novas.
 */
export const taskCreateSchema = z.object({
  // Id gerado no cliente (offline-first): quando presente, o servidor o honra.
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(500),
  description: z.string().max(10_000).optional(),
  horizon: z.enum(['core7', 'core30', 'core60', 'core90', 'hibernating']).optional(),
  isMicro: z.boolean().optional(),
  type: z.enum(['ceo', 'delegate', 'personal']).optional(),
  delegatePersonId: z.string().uuid().nullable().optional(),
  delegateName: z.string().max(200).optional(),
  delegateEmail: z.string().max(320).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  goalId: z.string().uuid().nullable().optional(),
  scheduledDate: z.string().nullable().optional(),
  scheduledTime: z.string().nullable().optional(),
  durationMinutes: z.number().int().min(1).nullable().optional(),
  followupActive: z.boolean().optional(),
  followupDate: z.string().nullable().optional(),
  followupHolderPersonId: z.string().uuid().nullable().optional(),
  followupDescription: z.string().max(2000).nullable().optional(),
  companyId: z.string().uuid().nullable().optional(),
  lifeArea: z
    .enum(['corpo', 'mente', 'relacionamentos', 'recursos', 'experiencias'])
    .nullable()
    .optional(),
  lifeItemId: z.string().uuid().nullable().optional(),
  participants: z
    .array(
      z.object({
        personId: z.string().uuid().nullable().optional(),
        name: z.string().max(200).nullable().optional(),
        email: z.string().max(320).nullable().optional(),
      }),
    )
    .max(50)
    .optional(),
})

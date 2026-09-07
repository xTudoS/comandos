import { createError } from 'h3'

export const ErrCode = {
  DEVICE_APPROVAL_REQUIRED: 'ERR_DEVICE_APPROVAL_REQUIRED',
  NO_ASSISTANT: 'ERR_NO_ASSISTANT',
  REASSIGN_FORBIDDEN: 'ERR_REASSIGN_FORBIDDEN',
  INVITATION_EXPIRED: 'ERR_INVITATION_EXPIRED',
  APPROVAL_EXPIRED: 'ERR_APPROVAL_EXPIRED',
  SIGNATURE_INVALID: 'ERR_SIGNATURE_INVALID',
  RATE_LIMITED: 'ERR_RATE_LIMITED',
  UNAUTHORIZED: 'ERR_UNAUTHORIZED',
  NOT_FOUND: 'ERR_NOT_FOUND',
  BAD_REQUEST: 'ERR_BAD_REQUEST',
  FORBIDDEN: 'ERR_FORBIDDEN',
  INTERNAL: 'ERR_INTERNAL',
} as const

export type ErrCodeT = typeof ErrCode[keyof typeof ErrCode]

const STATUS: Record<ErrCodeT, number> = {
  ERR_DEVICE_APPROVAL_REQUIRED: 403,
  ERR_NO_ASSISTANT: 409,
  ERR_REASSIGN_FORBIDDEN: 403,
  ERR_INVITATION_EXPIRED: 410,
  ERR_APPROVAL_EXPIRED: 410,
  ERR_SIGNATURE_INVALID: 400,
  ERR_RATE_LIMITED: 429,
  ERR_UNAUTHORIZED: 401,
  ERR_NOT_FOUND: 404,
  ERR_BAD_REQUEST: 400,
  ERR_FORBIDDEN: 403,
  ERR_INTERNAL: 500,
}

export function createApiError(code: ErrCodeT, message: string, details?: unknown) {
  const err: any = { error: { code, message } }
  if (details !== undefined) err.error.details = details
  return createError({
    statusCode: STATUS[code],
    data: err,
    message,
  })
}

import { describe, it, expect } from 'vitest'
import { createApiError, ErrCode } from '~~/server/utils/errors'

describe('createApiError', () => {
  it('builds a standard error envelope', () => {
    const err = createApiError(ErrCode.DEVICE_APPROVAL_REQUIRED, 'Aprovação necessária', { approvalId: 'abc' })
    expect(err.statusCode).toBe(403)
    expect(err.data).toEqual({
      error: {
        code: 'ERR_DEVICE_APPROVAL_REQUIRED',
        message: 'Aprovação necessária',
        details: { approvalId: 'abc' },
      },
    })
  })

  it('omits details when absent', () => {
    const err = createApiError(ErrCode.NO_ASSISTANT, 'Sem assistente')
    expect(err.data.error).not.toHaveProperty('details')
  })

  it.each([
    [ErrCode.DEVICE_APPROVAL_REQUIRED, 403],
    [ErrCode.NO_ASSISTANT, 409],
    [ErrCode.REASSIGN_FORBIDDEN, 403],
    [ErrCode.INVITATION_EXPIRED, 410],
    [ErrCode.APPROVAL_EXPIRED, 410],
    [ErrCode.SIGNATURE_INVALID, 400],
    [ErrCode.RATE_LIMITED, 429],
    [ErrCode.UNAUTHORIZED, 401],
    [ErrCode.NOT_FOUND, 404],
    [ErrCode.BAD_REQUEST, 400],
    [ErrCode.FORBIDDEN, 403],
    [ErrCode.INTERNAL, 500],
  ])('maps %s to status %d', (code, status) => {
    const err = createApiError(code, 'x')
    expect(err.statusCode).toBe(status)
  })
})

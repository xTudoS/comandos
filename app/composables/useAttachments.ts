export type AttachmentEntity = 'task' | 'note' | 'payment' | 'project' | 'goal'

export type Attachment = {
  id: string
  entityType: string
  entityId: string
  storageKey: string
  mimeType: string
  sizeBytes: number
  originalFilename: string
  uploadedByUserId: string
  createdAt: string
}

export type PresignResult = {
  attachment: Attachment
  uploadUrl: string
  expiresInSeconds: number
}

export function useAttachments() {
  async function list(entity: AttachmentEntity, entityId: string): Promise<Attachment[]> {
    const res = await $fetch<{ attachments: Attachment[] }>('/api/attachments', {
      query: { entity, entityId },
    })
    return res.attachments
  }

  async function presign(args: {
    entity: AttachmentEntity
    entityId: string
    filename: string
    mimeType: string
    sizeBytes: number
  }): Promise<PresignResult> {
    return await $fetch<PresignResult>('/api/attachments/presign', {
      method: 'POST',
      body: args,
    })
  }

  /**
   * Full upload flow: presign → PUT to S3 → returns the attachment row. The
   * row is created server-side as part of presign, so a failed S3 PUT leaves
   * a DB row pointing at an object that doesn't exist (v1 tradeoff).
   */
  async function upload(args: {
    entity: AttachmentEntity
    entityId: string
    file: File
  }): Promise<Attachment> {
    const { attachment, uploadUrl } = await presign({
      entity: args.entity,
      entityId: args.entityId,
      filename: args.file.name,
      mimeType: args.file.type || 'application/octet-stream',
      sizeBytes: args.file.size,
    })
    const putRes = await fetch(uploadUrl, {
      method: 'PUT',
      body: args.file,
      headers: { 'Content-Type': args.file.type || 'application/octet-stream' },
    })
    if (!putRes.ok) {
      throw new Error(`Falha no upload (${putRes.status}).`)
    }
    return attachment
  }

  async function download(id: string): Promise<string> {
    const res = await $fetch<{ url: string }>(`/api/attachments/${id}/download`)
    return res.url
  }

  async function remove(id: string): Promise<void> {
    await $fetch(`/api/attachments/${id}`, { method: 'DELETE' })
  }

  return { list, presign, upload, download, remove }
}

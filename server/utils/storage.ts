import { AwsClient } from 'aws4fetch'
import { createApiError, ErrCode } from './errors'

export type StorageEnv = {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  publicBaseUrl?: string
}

let cachedClient: AwsClient | null = null
let cachedEnv: StorageEnv | null = null

export function readStorageEnv(): StorageEnv | null {
  const endpoint = process.env.S3_ENDPOINT
  const region = process.env.S3_REGION
  const bucket = process.env.S3_BUCKET
  const accessKeyId = process.env.S3_ACCESS_KEY_ID
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) {
    return null
  }
  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: process.env.S3_PUBLIC_BASE_URL,
  }
}

function getClient(): { client: AwsClient; env: StorageEnv } {
  const env = readStorageEnv()
  if (!env) {
    throw createApiError(
      ErrCode.INTERNAL,
      'Storage não configurado — anexos indisponíveis.',
    )
  }
  if (!cachedClient || cachedEnv !== env) {
    cachedClient = new AwsClient({
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
      region: env.region,
      service: 's3',
    })
    cachedEnv = env
  }
  return { client: cachedClient, env }
}

function objectUrl(env: StorageEnv, key: string): string {
  const base = env.endpoint.replace(/\/+$/, '')
  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  return `${base}/${encodeURIComponent(env.bucket)}/${encodedKey}`
}

export async function presignUpload(args: {
  key: string
  mimeType: string
  expiresSeconds?: number
}): Promise<string> {
  const { client, env } = getClient()
  const url = new URL(objectUrl(env, args.key))
  url.searchParams.set('X-Amz-Expires', String(args.expiresSeconds ?? 600))
  const signed = await client.sign(
    new Request(url, { method: 'PUT', headers: { 'content-type': args.mimeType } }),
    { aws: { signQuery: true } },
  )
  return signed.url
}

export async function presignDownload(args: {
  key: string
  filename?: string
  expiresSeconds?: number
}): Promise<string> {
  const { client, env } = getClient()
  const url = new URL(objectUrl(env, args.key))
  url.searchParams.set('X-Amz-Expires', String(args.expiresSeconds ?? 300))
  if (args.filename) {
    url.searchParams.set(
      'response-content-disposition',
      `attachment; filename="${encodeURIComponent(args.filename)}"`,
    )
  }
  const signed = await client.sign(
    new Request(url, { method: 'GET' }),
    { aws: { signQuery: true } },
  )
  return signed.url
}

export async function deleteObject(args: { key: string }): Promise<void> {
  const { client, env } = getClient()
  const res = await client.fetch(objectUrl(env, args.key), { method: 'DELETE' })
  if (!res.ok && res.status !== 404) {
    throw createApiError(
      ErrCode.INTERNAL,
      `Falha ao remover objeto do storage (HTTP ${res.status}).`,
    )
  }
}

import type { H3Event } from 'h3'

export function useMailer(event: H3Event) {
  const config = useRuntimeConfig(event)
  return {
    async send(args: { to: string; subject: string; text: string; html?: string }) {
      if (!config.resendApiKey) {
        console.warn('[mailer] stub:', args.to, args.subject, args.text)
        return { id: 'stub' }
      }
      if (!config.resendFromEmail) {
        throw new Error('RESEND_FROM_EMAIL is not configured')
      }
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: config.resendFromEmail,
          to: args.to,
          subject: args.subject,
          text: args.text,
          html: args.html,
        }),
      })
      if (!res.ok) {
        const snippet = (await res.text()).slice(0, 200)
        console.error('[mailer] Resend request failed', res.status, snippet)
        throw new Error(`Resend request failed with status ${res.status}`)
      }
      return res.json()
    },
  }
}

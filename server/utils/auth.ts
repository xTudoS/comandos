import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { passkey } from "@better-auth/passkey";
import { emailOTP } from "better-auth/plugins";
import * as schema from "~~/server/db/schema";
import { useDb } from "./db";
import { useMailer } from "./mailer";
import { ALLOWED_HOSTS } from "./siteOrigin";

export function useAuth(event: any) {
  const db = useDb(event);
  const mailer = useMailer(event);
  const config = useRuntimeConfig(event);
  const cfEnv = (event.context as { cloudflare?: { env?: CloudflareEnv } })
    .cloudflare?.env;
  const kv = cfEnv?.HQ_BG_CACHE;
  if (!kv) {
    throw new Error("KV binding missing from event.context.cloudflare.kv");
  }

  const siteUrl = config.public.siteUrl || "http://localhost:3000";

  // Sem segredo o better-auth assinaria sessões com um valor vazio, o que
  // falha de forma silenciosa e confusa. Melhor quebrar aqui, com o nome exato
  // da env (o prefixo NUXT_ é obrigatório — ver comentário no nuxt.config.ts).
  if (!config.authSecret) {
    throw new Error(
      "NUXT_AUTH_SECRET não configurado (wrangler secret put NUXT_AUTH_SECRET)",
    );
  }

  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema, usePlural: true }),
    secret: config.authSecret,
    secondaryStorage: {
      get: async (key) => await kv.get(`__auth2:${key}`),
      set: async (key, value, ttl) => {
        return await kv.put(`__auth2:${key}`, value, {
          expirationTtl: ttl,
        });
      },
      delete: async (key) => await kv.delete(`__auth2:${key}`),
    },
    baseURL: {
      // Fonte única da allowlist — ver server/utils/siteOrigin.ts, que a usa
      // para gerar links e verificar WebAuthn pelo mesmo critério.
      allowedHosts: [...ALLOWED_HOSTS],
      protocol: "https",
      fallback: siteUrl,
    },
    advanced: { database: { generateId: "uuid" } },
    emailAndPassword: { enabled: false },
    telemetry: { enabled: false },
    // Com secondaryStorage (KV) configurado, o better-auth grava os valores de
    // verificação (o OTP de sign-in) APENAS no KV e pula o insert no Postgres.
    // O bootstrapGuard valida o OTP lendo a tabela `verifications` do Postgres,
    // então sem isto o código nunca é encontrado e todo login por OTP retorna
    // 400 "Código inválido ou expirado". storeInDatabase reativa o write no
    // banco (o consume também limpa o KV), mantendo as duas pontas em sincronia.
    verification: { storeInDatabase: true },
    plugins: [
      passkey({}),
      emailOTP({
        expiresIn: 600,
        allowedAttempts: 10,
        async sendVerificationOTP({ email, otp }) {
          await mailer.send({
            to: email,
            subject: "Seu código de acesso",
            text: `Código: ${otp}\n\nExpira em 10 minutos.`,
          });
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof useAuth>;

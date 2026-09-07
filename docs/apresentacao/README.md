# Apresentação / Webinar do Comando

Pacote para produzir o vídeo de apresentação (estilo webinar) do Comando: gravação de tela da demo + segmentos de IA (abertura, ponte, encerramento).

## Conteúdo

- **`roteiro-webinar.md`** — roteiro completo, PT-BR, ~26 min, 11 beats (narração + ação na tela + duração + transições). Para usuários finais.
- **`producao.md`** — guia de produção: setup do modo apresentação, rotina de reset entre takes, captura, geração dos segmentos de IA e montagem.
- **`storyboard/`** — material para os segmentos gerados por IA:
  - `beat-breakdown.md` — os momentos que viram vídeo IA.
  - `beat-board.md` — prompts de imagem (Nano Banana + Midjourney).
  - `sequence-board.md` — abertura, ponte e encerramento em 4 panels cada.
  - `motion-prompts.md` — prompts de movimento (Runway/Pika/SVD).
  - `QA.md` — revisão 4C + continuidade.

## Modo apresentação (no app)

A gravação usa uma **conta de demonstração** isolada, com login sem fricção e estado resetável — sem expor dados reais. Implementação:

- Flags em `nuxt.config.ts`: `public.demoMode` (NUXT_PUBLIC_DEMO_MODE) e privadas `demoEmail` / `demoBypass` (NUXT_DEMO_BYPASS).
- Seed: `scripts/seed-demo.ts` → `pnpm db:seed:demo` (idempotente; é também o reset entre takes).
- Login fácil: `server/api/auth/demo-login.post.ts` + botão "▶ Entrar como demo" no `/login` (só em modo demo).
- Anti-flash de dados reais: `app/plugins/persist.client.ts` não hidrata do cache local em modo demo.

Passo a passo de uso em `producao.md`.

## Ordem sugerida

1. Setup do app (modo apresentação + seed) — `producao.md` §1–2.
2. Gerar os segmentos de IA — `storyboard/` + `producao.md` §5.
3. Gravar as telas seguindo o `roteiro-webinar.md` (beats 3–10).
4. Montar conforme `producao.md` §6 e o resumo de tempo do roteiro.

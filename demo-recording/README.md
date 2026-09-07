# Gravação automatizada (Playwright)

Dirige a conta de demonstração pelos beats do roteiro e grava o vídeo (`.webm`)
da parte de tela (beats 3–11). Narração e segmentos de IA são adicionados depois.

## Setup (uma vez)

```
pnpm install
pnpm exec playwright install chromium
pnpm db:migrate          # se ainda não rodou
pnpm db:seed:demo
```

## Gravar

Em um terminal, suba o app em modo apresentação:

```
NUXT_PUBLIC_DEMO_MODE=1 NUXT_DEMO_BYPASS=1 pnpm dev
```

Em outro:

```
pnpm demo:record               # grava tudo num vídeo + índice de timecodes no console
pnpm demo:record -- --only=9   # regrava só o beat 9 (vídeo próprio)
SPEED=1.5 pnpm demo:record     # 1.5x mais LENTO (ritmo de vídeo)
```

Vídeos saem em `demo-recording/videos/`. O console imprime o **timecode de cada beat**
(use para cortar na montagem).

Variáveis: `BASE_URL` (padrão `http://localhost:3000`), `OUT_DIR`, `SPEED` (padrão `1`;
maior = mais lento — ajuste se ainda achar o vídeo rápido).

> Dica: para um vídeo mais limpo, suba o dev com o **Nuxt DevTools desligado**
> (`devtools: { enabled: false }` no `nuxt.config.ts` durante a gravação). O script já
> tenta esconder o overlay, mas desligar é mais garantido.

## Como funciona

- Login pelo botão "▶ Entrar como demo" (precisa de `NUXT_DEMO_BYPASS=1`).
- Navegação entre telas por URL (robusto).
- O beat offline usa `context.setOffline(true/false)` do Playwright — simula queda
  de rede e a re-sincronização de verdade.
- Cada beat é **tolerante a falha**: se um seletor mudou, aquele beat loga o erro e a
  gravação continua. Ajuste seletores em `selectors.ts` (único lugar a mexer).

## Limites (honestos)

- Não foi possível executar aqui (o banco local estava sem as migrations), então os
  seletores podem precisar de **um ajuste fino na primeira execução** — todos estão
  centralizados em `selectors.ts`.
- O vídeo do Playwright é o viewport cru (sem cursor destacado/zoom). Bom para rascunho
  e para os beats funcionais; para acabamento "cinema", use o modo "script dirige + você
  grava a tela".
- Drag-and-drop entre horizontes não está automatizado (DnD HTML5 é instável headless);
  faça esse trecho manualmente se quiser mostrá-lo.
- Sem narração/áudio — gere por TTS a partir do roteiro ou grave por cima.

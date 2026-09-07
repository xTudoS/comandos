# Guia de Produção — Webinar Comando

Passo a passo para gravar o webinar usando o **modo apresentação** e montar o vídeo final.

## 1. Pré-requisitos (uma vez)

- Node + pnpm instalados; dependências do projeto instaladas: `pnpm install`
  (isto também linka o `tsx`, usado pelos scripts de seed).
- Postgres **local** rodando (`localhost:5432/comando_dev`, ver `.env`).
- Banco local com as migrations aplicadas: `pnpm db:migrate`
  (necessário ao menos uma vez — inclui as tabelas do módulo Vida).

## 2. Setup do ambiente de gravação

Variáveis de ambiente (no `.env` ou exportadas na sessão):

```
NUXT_PUBLIC_DEMO_MODE=1     # mostra o botão "Entrar como demo" e evita flash de cache real
NUXT_DEMO_BYPASS=1          # habilita o endpoint /api/auth/demo-login (login sem fricção)
# DEMO_EMAIL=demo@comando.app   # opcional; padrão já é esse
```

Semear a conta de demonstração:

```
pnpm db:seed:demo
```

Isso cria (ou reaproveita) o usuário `demo@comando.app` (role owner, sem passkey) e popula
empresas, delegados, projetos, metas, tarefas nos 6 horizontes (com agenda, follow-up,
checklist e anotações), notas dos 5 tipos, pagamentos e o módulo Vida.

Subir o app:

```
pnpm dev
```

## 3. Rotina de take / reset entre gravações

Para deixar tudo pristino antes de cada take:

1. `pnpm db:seed:demo` — apaga os dados da conta demo e re-semeia (o seed é o reset).
2. No navegador de gravação, **limpar os dados do site** (Application → Clear site data) — isso
   zera o IndexedDB (Dexie) e o cache do service worker (`comando-api`, que guarda respostas por 14 dias).
   - Alternativa mais simples: gravar sempre em uma **janela anônima / perfil limpo** (IndexedDB e SW começam vazios; com `NUXT_PUBLIC_DEMO_MODE=1` o app já evita hidratar do cache, então dados reais não "piscam").
3. Recarregar, clicar em **"▶ Entrar como demo"** e começar a gravar.

> Para gravar a delegação em tempo real "de verdade" (duas pontas), abra uma segunda janela
> logada como a delegada. Não é obrigatório — o roteiro usa uma ponte de IA (Beat 4 do storyboard)
> para ilustrar esse momento sem precisar filmar dois dispositivos.

## 3b. Captura automatizada (opcional, recomendado p/ rascunho)

Dá pra deixar o Playwright **dirigir a demo e gravar o vídeo** dos beats de tela
(3–11), sem mãos. Ver `demo-recording/README.md`. Resumo:

```
pnpm exec playwright install chromium             # uma vez
NUXT_PUBLIC_DEMO_MODE=1 NUXT_DEMO_BYPASS=1 pnpm dev   # terminal 1
pnpm demo:record                                  # terminal 2 → vídeo + timecodes
pnpm demo:record -- --only=9                       # regravar um beat
```

Saída em `demo-recording/videos/`. O beat offline é simulado de verdade
(`setOffline`). Para acabamento "cinema" (cursor/zoom/narração ao vivo), prefira a
captura manual abaixo, usando o script só para ensaiar o ritmo.

## 4. Captura de tela (manual)

- Resolução **1920×1080**, 30 ou 60 fps.
- Navegador em tela cheia, **sem barra de favoritos** e sem extensões visíveis.
- Zoom da página em ~110–125% para a tipografia densa do app ficar legível em vídeo.
- Tema claro (o app já força claro).
- Ordem de gravação: seguir os **beats 3 a 10** do `roteiro-webinar.md` (são as partes de tela).
  Os beats 1, 2, 4-(ponte) e 11-(fecho) são os segmentos de IA.
- Grave cada beat separadamente; é mais fácil regravar um trecho do que a sessão inteira.

## 5. Segmentos de IA

1. Gerar imagens a partir de `storyboard/beat-board.md` (Nano Banana recomendado; variante Midjourney inclusa).
2. Revisar consistência visual (paleta, vidro fosco, acento azul) — ver `storyboard/QA.md`.
3. Animar com os prompts de `storyboard/motion-prompts.md` (Runway / Pika / SVD).
4. Clipes de IA esperados: **abertura** (Beats 1–3), **ponte do tempo real** (Beat 4) e **encerramento/CTA** (Beat 6).

## 6. Montagem

- Linha do tempo segue a tabela de tempo do fim do `roteiro-webinar.md` (~26 min).
- Encaixe: IA (abertura) → tela (beats 3–9) → tela+IA (delegação) → tela+IA (offline/fecho).
- Use as notas de **Transição** de cada beat do roteiro para os cortes.
- Narração: gravar por cima (voice-over) lendo o campo **Narração** de cada beat.
- Música de fundo suave e discreta; baixar o volume sob a narração.

## 7. Checklist final antes de publicar

- [ ] Nenhum dado real do dono aparece (gravado em perfil limpo / conta demo).
- [ ] Todas as telas do roteiro aparecem populadas (tarefas, agenda, metas, vida).
- [ ] Áudio da narração limpo e sincronizado com a ação na tela.
- [ ] Segmentos de IA com identidade visual coerente com o app.
- [ ] Duração final dentro de 20–30 min.
- [ ] CTA final claro.

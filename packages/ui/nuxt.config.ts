import { fileURLToPath } from 'node:url'

/**
 * @comando/ui — Nuxt Layer com o design system.
 *
 * Consumido pelo app via `extends: ['./packages/ui']` no nuxt.config da raiz.
 * Não é um app: não tem páginas, rotas nem server.
 *
 * Os caminhos são resolvidos contra ESTE arquivo, não contra a raiz do app
 * consumidor. Caminho relativo em `components` de um layer é ambíguo — o Nuxt
 * pode acabar procurando na raiz de quem consome. Resolver via `import.meta.url`
 * elimina a dúvida (mesma técnica já usada em `vitest.config.ts`).
 */
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineNuxtConfig({
  components: [
    // pathPrefix: false → <BaseIcon/>, não <BaseBaseIcon/>.
    { path: here('./app/components/base'), pathPrefix: false },
    { path: here('./app/components/chrome'), pathPrefix: false },
    here('./app/components'),
  ],

  // Ordem importa: main.css é a fonte de verdade dos tokens e tokens.css é a
  // camada de alias legada (--color-*), que precisa vir DEPOIS.
  // Ver design-system/MASTER.md §1.
  css: [
    here('./app/assets/css/reset.css'),
    here('./app/assets/css/main.css'),
    here('./app/assets/css/tokens.css'),
    here('./app/assets/css/utilities.css'),
  ],

  // `#ui` é o ponto de entrada para o que o auto-import não resolve — tipos.
  // Ver app/types.ts.
  alias: {
    '#ui': here('./app'),
  },
})

// https://nuxt.com/docs/api/configuration/nuxt-config
import nodeResolve from '@rollup/plugin-node-resolve';

export default defineNuxtConfig({
  // Design system (componentes visuais + tokens CSS) vive em packages/ui como
  // Nuxt Layer. Ele traz seus próprios `components` e `css` — por isso não há
  // bloco `css` aqui. Ver design-system/MASTER.md.
  extends: ["./packages/ui"],
  compatibilityDate: "2026-06-18",
  devtools: { enabled: true },
  experimental: {
    viewTransition: true,
    // Sem _payload.json: o shell offline (prerender) e as páginas embutem o
    // estado no HTML. Evita o fetch de payload que falha offline e travava o
    // app-shell ("Cannot load payload").
    payloadExtraction: false,
  },
  // typescript: { strict: true, typeCheck: true },
  modules: [
    "nitro-cloudflare-dev",
    "@pinia/nuxt",
    "@vite-pwa/nuxt",
  ],
  pwa: {
    registerType: "autoUpdate",
    manifest: {
      name: "Comando",
      short_name: "Comando",
      theme_color: "#ffffff",
      icons: [
        {
          src: "comando-logo.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "comando-logo.png",
          sizes: "512x512",
          type: "image/png",
        },
      ],
    },
    workbox: {
      // NÃO use `navigateFallback`: ele registra uma NavigationRoute que responde
      // TODA navegação com o HTML do /app-shell, inclusive online. Como o Nuxt
      // reconcilia a URL do navegador com o `payload.path` do HTML prerenderizado
      // (createCurrentLocation em pages/runtime/plugins/router), a barra de
      // endereço virava /app-shell e o destino real (ex.: /login/waiting) era
      // perdido — o shell então mandava todo mundo pra /trabalho e o gate de auth
      // devolvia pro /login. A navegação agora vai sempre à rede (HTML do SSR,
      // com o gate de sessão) e só cai no shell prerenderizado quando offline
      // (ver o runtimeCaching de `request.mode === 'navigate'` abaixo).
      //
      // A chave precisa existir com `undefined`: o @vite-pwa/nuxt só injeta o
      // padrão dele (`navigateFallback: '/'`, que serviria a landing em toda
      // navegação) quando a propriedade está AUSENTE — `'navigateFallback' in
      // workbox`. Não remova esta linha.
      navigateFallback: undefined,
      globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
      // Local-first: respostas de leitura da API ficam em cache e são servidas
      // instantaneamente (revalidando em segundo plano). Isso deixa a navegação
      // rápida e mantém os dados disponíveis offline. /api/auth é EXCLUÍDO para
      // a verificação de sessão nunca usar resposta velha.
      runtimeCaching: [
        {
          // Navegações (F5 / abrir link / window.location): sempre a rede, para
          // o HTML do SSR e o gate de sessão valerem. Sem rede, o
          // PrecacheFallbackPlugin serve o /app-shell prerenderizado, que então
          // encaminha para a rota pedida (ver app/pages/app-shell.vue).
          urlPattern: ({ request }: { request: Request }) =>
            request.mode === "navigate",
          handler: "NetworkOnly",
          options: {
            precacheFallback: { fallbackURL: "/app-shell" },
          },
        },
        {
          // NetworkFirst: online sempre busca dados frescos (não mascara o que
          // acabou de ser sincronizado); offline cai no cache. StaleWhileRevalidate
          // servia resposta velha logo após a sincronização e revertia mudanças.
          urlPattern: /\/api\/(?!auth)/,
          handler: "NetworkFirst",
          method: "GET",
          options: {
            cacheName: "comando-api",
            networkTimeoutSeconds: 3,
            expiration: {
              maxEntries: 300,
              maxAgeSeconds: 60 * 60 * 24 * 14,
            },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
      ],
    },
    client: {
      // Mantém o cache offline (service worker) sem o banner de "instalar app".
      installPrompt: false,
    },
    devOptions: {
      enabled: true,
      type: "module",
    },
  },

  // Prerenderiza o shell offline como HTML estático (usado como fallback de
  // precache do service worker para o cold-start sem conexão).
  routeRules: {
    "/app-shell": { prerender: true },
    // Landing pública servida como HTML estático via CDN. O redirect de usuário
    // logado acontece no cliente (app/pages/index.vue), sem quebrar o prerender.
    "/": { prerender: true },
  },

  components: [
    // `base/` saiu inteiro para packages/ui — o layer registra o dele.
    // `chrome/` continua aqui com o que é infraestrutura do app (toast,
    // confirm, status de sync); o layer registra só modal/sheet/panel/tabs.
    { path: "~/components/chrome", pathPrefix: false },
    { path: "~/components/notas", pathPrefix: false },
    { path: "~/components/modals", pathPrefix: false },
    { path: "~/components/quadros", pathPrefix: false },
    "~/components",
  ],
  // Dark mode foi removido de vez (o módulo @nuxtjs/color-mode saiu junto).
  // O app é light-only: `html { color-scheme: light }` em main.css é a única
  // declaração de tema. Ver design-system/MASTER.md.
  runtimeConfig: {
    // ⚠️ NUNCA ponha segredo como default aqui. Default de runtimeConfig é
    // valor de BUILD: vai inteiro para o bundle do worker e vale sempre que a
    // env não estiver setada. Estas duas chaves já foram commitadas com valor
    // real (auditoria de 2026-08, anexo #1) e precisaram ser rotacionadas.
    // Segredo entra por `wrangler secret put NUXT_<NOME>` — e só.
    //   NUXT_AUTH_SECRET      → server/utils/auth.ts (quebra explícita se faltar)
    //   NUXT_RESEND_API_KEY   → server/utils/mailer.ts (cai no stub se faltar)
    authSecret: "",
    resendApiKey: "",
    // ── IA ────────────────────────────────────────────────────────────────
    // Três provedores atrás da mesma interface (server/utils/llm/). Vazio =
    // as features de IA ficam desligadas e respondem erro explicando qual
    // variável falta — nada quebra em silêncio.
    //   NUXT_LLM_PROVIDER  anthropic | openai | google
    //                      (vazio = o primeiro provedor com chave definida)
    //   NUXT_LLM_MODEL     sobrescreve o modelo padrão do provedor escolhido
    llmProvider: "",
    llmModel: "",
    anthropicApiKey: "",
    openaiApiKey: "",
    googleAiApiKey: "",
    resendFromEmail: "comando@updates.brunnogalvao.com.br",
    adminBootstrapEmail: "brunno@galvao.co",
    // Conta de demonstração para gravar o webinar (ver docs/apresentacao/).
    // Email do usuário demo semeado por `pnpm db:seed:demo`.
    demoEmail: "demo@comando.app",
    // Liga o login-sem-fricção (/api/auth/demo-login). PRIVADO — nunca expor.
    // Vazio = desligado. Ative só no ambiente de gravação: NUXT_DEMO_BYPASS=1
    demoBypass: "",
    public: {
      // Domínio real da aplicação (wrangler.jsonc já manda o mesmo valor via
      // NUXT_PUBLIC_SITE_URL). O default apontava para o subdomínio workers.dev,
      // então quem acessava por comandos.app recebia links de convite e de
      // agendamento apontando para o host errado sempre que a env falhasse.
      // O rpID efetivo do WebAuthn NÃO sai daqui — quem resolve pelo host da
      // request é server/utils/siteOrigin.ts (ALLOWED_HOSTS).
      siteUrl: "https://comandos.app",
      // URL wss do worker comando-sync (Fase 2). Vazio = tempo real desligado
      // (só polling). Defina após o deploy do worker, ex.:
      //   NUXT_PUBLIC_SYNC_URL=wss://comando-sync.<subdominio>.workers.dev/ws
      syncUrl: "",
      // Modo apresentação: mostra o botão "Entrar como demo" no login e evita
      // que dados reais em cache (Dexie) "pisquem" na tela. NUXT_PUBLIC_DEMO_MODE=1
      demoMode: false,
    },
  },
  nitro: {
    preset: "cloudflare_module",
    cloudflare: {
      deployConfig: false,
    },

    rollupConfig: {
        plugins: [nodeResolve({ exportConditions: [ 'workerd'] })],
      external: ['pg-native', 'cloudflare:sockets'],
      treeshake: {
      moduleSideEffects: (id) => {
        if (id.includes('reflect-metadata')) return true;
        if (id.includes('@better-auth')) return true;
        // Nitro default configs - https://nitro.build/config#modulesideeffects
        if (id.includes('unenv/polyfill/')) return true;
        if (id.includes('node-fetch-native/polyfill')) return true;
        return false;
      },
    },
    },
  },
  app: {
    head: {
      title: "Comando",
      htmlAttrs: { lang: "pt-BR" },
      link: [
        { rel: "apple-touch-icon", sizes: "57x57", href: "/apple-icon-57x57.png" },
        { rel: "apple-touch-icon", sizes: "60x60", href: "/apple-icon-60x60.png" },
        { rel: "apple-touch-icon", sizes: "72x72", href: "/apple-icon-72x72.png" },
        { rel: "apple-touch-icon", sizes: "76x76", href: "/apple-icon-76x76.png" },
        { rel: "apple-touch-icon", sizes: "114x114", href: "/apple-icon-114x114.png" },
        { rel: "apple-touch-icon", sizes: "120x120", href: "/apple-icon-120x120.png" },
        { rel: "apple-touch-icon", sizes: "144x144", href: "/apple-icon-144x144.png" },
        { rel: "apple-touch-icon", sizes: "152x152", href: "/apple-icon-152x152.png" },
        { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-icon-180x180.png" },
        { rel: "icon", type: "image/png", sizes: "192x192", href: "/android-icon-192x192.png" },
        { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
        { rel: "icon", type: "image/png", sizes: "96x96", href: "/favicon-96x96.png" },
        { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
        { rel: "manifest", href: "/manifest.json" },
      ],
      meta: [
        { name: "msapplication-TileColor", content: "#ffffff" },
        { name: "msapplication-TileImage", content: "/ms-icon-144x144.png" },
        { name: "theme-color", content: "#ffffff" },
      ],
    },
  },
});

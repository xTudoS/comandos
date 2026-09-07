import { watch, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { db } from '~/lib/db'
import { useMetasStore } from '~/stores/metas'
import { useProjetosStore } from '~/stores/projetos'
import type { LifeState } from '~/composables/useLifeTracker'

/**
 * Converte um valor reativo (ref/reactive, possivelmente com proxies aninhados)
 * em dados puros clonáveis pelo IndexedDB.
 *
 * `toRaw` só desembrulha o nível de cima — uma lista montada como
 * `[otimista, ...list.value]` ainda guarda PROXIES reativos nos elementos
 * existentes, e o structured-clone do IndexedDB QUEBRA em proxies
 * (`DataCloneError`). Como o erro era engolido pelo `.catch`, a escrita otimista
 * sumia silenciosamente do cache e o item só voltava após sincronizar.
 * Os dados aqui são JSON puro (strings/números/booleanos/null), então o
 * round-trip via JSON desembrulha tudo com segurança.
 */
function toPlain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

/**
 * Persistência local-first das listas de cada recurso.
 *
 * - Hidrata cada lista do IndexedDB ao abrir o app (instantâneo, funciona
 *   offline) — assim itens criados/editados offline reaparecem após fechar e
 *   reabrir, mesmo sem conexão.
 * - Persiste cada lista no IndexedDB sempre que muda (inclusive mutações
 *   otimistas offline).
 *
 * As notas têm sua própria camada Dexie (stores/notes), então não entram aqui.
 */
export default defineNuxtPlugin(() => {
  // Modo apresentação: não hidratamos do cache local (Dexie) para que dados
  // reais de uma sessão anterior no mesmo navegador não "pisquem" na tela
  // durante a gravação. As listas são preenchidas pelo fetch do servidor (a
  // conta demo). A persistência (watch) segue ligada, sem efeito de vazamento.
  const demoMode = !!useRuntimeConfig().public.demoMode

  const resources: Array<{ key: string; list: Ref<unknown[]> }> = [
    { key: 'tasks', list: useTasks().list as Ref<unknown[]> },
    { key: 'projects', list: useProjects().list as Ref<unknown[]> },
    { key: 'payments', list: usePayments().list as Ref<unknown[]> },
    { key: 'people', list: usePeople().list as Ref<unknown[]> },
    { key: 'companies', list: useCompanies().list as Ref<unknown[]> },
    // Pinia: storeToRefs dá o Ref real (store.list vem desembrulhado).
    { key: 'metas', list: storeToRefs(useMetasStore()).list as unknown as Ref<unknown[]> },
    { key: 'projetos', list: storeToRefs(useProjetosStore()).list as unknown as Ref<unknown[]> },
  ]

  for (const r of resources) {
    // Hidrata (não bloqueia o boot). Só preenche se a lista ainda estiver vazia,
    // para não sobrescrever dados já carregados do servidor.
    if (!demoMode) {
      db.cache
        .get(r.key)
        .then((row) => {
          const cached = row?.value
          if (Array.isArray(cached) && cached.length && r.list.value.length === 0) {
            r.list.value = cached
          }
        })
        .catch(() => {})
    }

    // Persiste em toda mudança (otimista offline incluída).
    watch(
      r.list,
      (v) => {
        db.cache.put({ key: r.key, value: toPlain(v) }).catch(() => {})
      },
      { deep: true },
    )
  }

  // Vida: o estado é um objeto ({ areas, checkins }), não uma lista. Persiste e
  // hidrata do mesmo jeito, embrulhado num array de 1 para caber no CacheRow.
  const life = useLifeTracker()
  if (!demoMode) {
    db.cache
      .get('life')
      .then((row) => {
        const cached = row?.value?.[0] as LifeState | undefined
        if (
          cached &&
          Array.isArray(cached.areas) &&
          cached.areas.length &&
          life.state.value.areas.length === 0
        ) {
          life.state.value = cached
        }
      })
      .catch(() => {})
  }

  watch(
    life.state,
    (v) => {
      db.cache.put({ key: 'life', value: [toPlain(v)] }).catch(() => {})
    },
    { deep: true },
  )
})

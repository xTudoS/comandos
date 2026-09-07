<script setup lang="ts">
import type { ContextMenuItem } from './contextMenu'

// Metric card chrome (matches reference: icon + title, action cluster, body slot).
const props = withDefaults(
  defineProps<{
    title: string
    icon: string
    subtitle?: string
    actions?: boolean
    /** Rota para a qual o botão "expandir" navega. Sem isto, emite `expand`. */
    to?: string
    /** Itens do menu do botão "mais opções". Sem isto, emite `more`. */
    menu?: ContextMenuItem[]
  }>(),
  { actions: true },
)

const emit = defineEmits<{
  edit: []
  expand: []
  more: []
  'menu-select': [key: string]
}>()

const router = useRouter()
const rootRef = ref<HTMLElement>()
const menuOpen = ref(false)

function onExpand() {
  if (props.to) router.push(props.to)
  else emit('expand')
}

function onMore() {
  if (props.menu?.length) menuOpen.value = !menuOpen.value
  else emit('more')
}

function onMenuSelect(key: string) {
  menuOpen.value = false
  emit('menu-select', key)
}

function onDocClick(e: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) menuOpen.value = false
}
onMounted(() => document.addEventListener('click', onDocClick))
onUnmounted(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <section class="metric-card">
    <header class="mc-head">
      <div class="mc-title">
        <BaseIcon :name="icon" :size="16" class="mc-icon" />
        <span class="mc-name">{{ title }}</span>
        <span v-if="subtitle" class="mc-sub">{{ subtitle }}</span>
      </div>
      <div v-if="actions" ref="rootRef" class="mc-actions">
        <button type="button" aria-label="Editar" @click="emit('edit')">
          <BaseIcon name="pencil" :size="14" />
        </button>
        <button type="button" aria-label="Expandir" @click="onExpand">
          <BaseIcon name="maximize-2" :size="14" />
        </button>
        <button
          type="button"
          aria-label="Mais opções"
          :aria-expanded="menuOpen"
          @click.stop="onMore"
        >
          <BaseIcon name="ellipsis-vertical" :size="14" />
        </button>
        <div v-if="menuOpen && menu?.length" class="mc-menu">
          <BaseContextMenuList
            :items="menu"
            @select="onMenuSelect"
            @request-close="menuOpen = false"
          />
        </div>
      </div>
    </header>
    <div class="mc-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.metric-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: var(--shadow-card);
}
.mc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.mc-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.mc-icon {
  color: var(--text-3);
  flex-shrink: 0;
}
.mc-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
}
.mc-sub {
  font-size: 12px;
  color: var(--text-4);
  white-space: nowrap;
}
.mc-actions {
  position: relative;
  display: flex;
  align-items: center;
  gap: 1px;
  flex-shrink: 0;
}
.mc-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
}
.mc-actions button {
  width: 26px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-3);
}
.mc-actions button:hover {
  background: var(--surface-hover);
  color: var(--text);
}
.mc-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
}
</style>

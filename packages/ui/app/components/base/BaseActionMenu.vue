<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import BaseIcon from './BaseIcon.vue'
import type { ActionItem } from './actionMenu'

// Os tipos moram em ./actionMenu.ts e são reexportados aqui por
// retrocompatibilidade de quem já importava do SFC. Prefira `#ui/types`.
export type { ActionItem, ActionTone } from './actionMenu'

interface Props {
  items: ActionItem[]
  ariaLabel?: string
  size?: 'sm' | 'md'
  align?: 'start' | 'end'
}

const props = withDefaults(defineProps<Props>(), {
  ariaLabel: 'Mais ações',
  size: 'sm',
  align: 'end',
})

const emit = defineEmits<{
  select: [key: string]
  open: []
  close: []
}>()

const open = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)

const menuStyle = ref<{ top: string; left: string; minWidth: string }>({
  top: '0px',
  left: '0px',
  minWidth: '160px',
})

function position() {
  const t = triggerRef.value
  if (!t) return
  const rect = t.getBoundingClientRect()
  const gap = 6
  const minWidth = Math.max(160, rect.width)
  
  const menuEl = menuRef.value
  const menuHeight = menuEl ? menuEl.offsetHeight : 100
  
  let top = rect.bottom + gap
  if (top + menuHeight > window.innerHeight) {
    top = rect.top - gap - menuHeight
  }
  
  const left = props.align === 'end'
    ? rect.right - minWidth
    : rect.left
  menuStyle.value = {
    top: `${Math.max(8, top)}px`,
    left: `${Math.max(8, Math.min(left, window.innerWidth - minWidth - 8))}px`,
    minWidth: `${minWidth}px`,
  }
}

async function toggle(e: Event) {
  e.stopPropagation()
  if (open.value) {
    close()
    return
  }
  open.value = true
  emit('open')
  await nextTick()
  position()
  document.addEventListener('click', onDocClick, true)
  document.addEventListener('keydown', onKey)
  window.addEventListener('resize', position)
  window.addEventListener('scroll', position, true)
}

function close() {
  if (!open.value) return
  open.value = false
  emit('close')
  document.removeEventListener('click', onDocClick, true)
  document.removeEventListener('keydown', onKey)
  window.removeEventListener('resize', position)
  window.removeEventListener('scroll', position, true)
}

function onDocClick(e: MouseEvent) {
  const t = e.target as Node
  if (menuRef.value?.contains(t)) return
  if (triggerRef.value?.contains(t)) return
  close()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
  }
}

function onItemClick(item: ActionItem, e: Event) {
  e.stopPropagation()
  if (item.disabled) return
  emit('select', item.key)
  close()
}

const triggerSize = computed(() => (props.size === 'md' ? 28 : 22))
const iconSize = computed(() => (props.size === 'md' ? 16 : 14))

watch(() => props.items, () => {
  if (open.value) nextTick(position)
})

onBeforeUnmount(close)
</script>

<template>
  <button
    ref="triggerRef"
    type="button"
    class="action-trigger"
    :class="[`size-${size}`, { 'is-open': open }]"
    :style="{ width: `${triggerSize}px`, height: `${triggerSize}px` }"
    :aria-haspopup="true"
    :aria-expanded="open"
    :aria-label="ariaLabel"
    @click="toggle"
  >
    <BaseIcon name="more-horizontal" :size="iconSize" />
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      ref="menuRef"
      class="action-menu"
      role="menu"
      :style="menuStyle"
      @click.stop
    >
      <button
        v-for="it in items"
        :key="it.key"
        type="button"
        role="menuitem"
        class="action-item"
        :class="[`tone-${it.tone ?? 'default'}`, { 'is-disabled': it.disabled }]"
        :disabled="it.disabled"
        @click="onItemClick(it, $event)"
      >
        <BaseIcon v-if="it.icon" :name="it.icon" :size="14" class="ai-ico" />
        <span>{{ it.label }}</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.action-trigger {
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: var(--color-text-3);
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--dur-base),
              color var(--dur-base);
}
.action-trigger:hover,
.action-trigger.is-open {
  background: var(--color-surface-hover);
  color: var(--color-text);
}
.action-trigger:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-ring-strong);
}

@media (max-width: 780px) {
  .action-trigger.size-sm,
  .action-trigger.size-md {
    width: 36px !important;
    height: 36px !important;
  }
}
</style>

<style>
/* Global so Teleport-target stays styled outside scoped scope. */
.action-menu {
  position: fixed;
  z-index: 1000;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12),
              0 2px 6px rgba(0, 0, 0, 0.06);
  padding: 4px;
  display: flex;
  flex-direction: column;
  min-width: 160px;
}
.action-menu .action-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 0;
  background: transparent;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  text-align: left;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.1s;
  font-family: inherit;
  white-space: nowrap;
}
.action-menu .action-item:hover:not(.is-disabled) {
  background: var(--color-surface-hover);
}
.action-menu .action-item.is-disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.action-menu .action-item.tone-warning {
  color: var(--color-warning);
}
.action-menu .action-item.tone-warning:hover:not(.is-disabled) {
  background: #fef3e6;
}
.action-menu .action-item.tone-danger {
  color: var(--color-danger);
}
.action-menu .action-item.tone-danger:hover:not(.is-disabled) {
  background: #fdebec;
}
.action-menu .ai-ico {
  flex-shrink: 0;
  opacity: 0.85;
}
</style>

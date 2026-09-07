<script setup lang="ts">
import { nextTick, ref } from 'vue'
import BaseIcon from './BaseIcon.vue'
import type { ContextMenuItem } from './contextMenu'

defineOptions({ name: 'BaseContextMenuList' })

const props = defineProps<{
  items: ContextMenuItem[]
  /** Inline positioning (fixed) for this list / submenu. */
  posStyle?: Record<string, string>
  /** Depth — root is 0; submenus increment. Used only for z-stacking. */
  depth?: number
}>()

const emit = defineEmits<{
  select: [key: string]
  requestClose: []
}>()

const listRef = ref<HTMLElement | null>(null)
const activeKey = ref<string | null>(null)
const subStyle = ref<Record<string, string>>({})
const itemEls = new Map<string, HTMLElement>()

function setItemEl(key: string | undefined, el: unknown) {
  if (!key) return
  if (el) itemEls.set(key, el as HTMLElement)
  else itemEls.delete(key)
}

const activeChildren = () =>
  props.items.find((i) => i.key === activeKey.value)?.children ?? null

async function openSub(item: ContextMenuItem) {
  if (!item.key || !item.children?.length) return
  activeKey.value = item.key
  await nextTick()
  const el = itemEls.get(item.key)
  if (!el) return
  const r = el.getBoundingClientRect()
  const width = 220
  const estHeight = (item.children.length + 1) * 38
  let left = r.right - 5
  if (left + width > window.innerWidth - 8) left = r.left - width + 5
  let top = r.top - 6
  if (top + estHeight > window.innerHeight - 8)
    top = Math.max(8, window.innerHeight - estHeight - 8)
  subStyle.value = { top: `${Math.max(8, top)}px`, left: `${Math.max(8, left)}px` }
}

function onEnter(item: ContextMenuItem) {
  if (item.separator || item.disabled) return
  if (item.children?.length) openSub(item)
  else activeKey.value = null
}

function onClick(item: ContextMenuItem) {
  if (item.disabled || item.separator) return
  if (item.children?.length) {
    openSub(item)
    return
  }
  if (item.key) emit('select', item.key)
  emit('requestClose')
}

/* ---- keyboard: roving focus within this list ---- */
function focusables(): HTMLButtonElement[] {
  return Array.from(
    listRef.value?.querySelectorAll<HTMLButtonElement>(
      '.ctx-item:not(.is-disabled)',
    ) ?? [],
  )
}

function onKeydown(e: KeyboardEvent) {
  const items = focusables()
  if (!items.length) return
  const idx = items.indexOf(document.activeElement as HTMLButtonElement)
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    e.stopPropagation()
    items[(idx + 1 + items.length) % items.length]?.focus()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    e.stopPropagation()
    items[(idx - 1 + items.length) % items.length]?.focus()
  } else if (e.key === 'ArrowRight') {
    const item = props.items.find((i) => i.key === items[idx]?.dataset.key)
    if (item?.children?.length) {
      e.preventDefault()
      e.stopPropagation()
      openSub(item)
      nextTick(() => {
        const sub = listRef.value?.querySelector<HTMLButtonElement>(
          '.ctx-sub .ctx-item:not(.is-disabled)',
        )
        sub?.focus()
      })
    }
  } else if (e.key === 'ArrowLeft' && (props.depth ?? 0) > 0) {
    e.preventDefault()
    e.stopPropagation()
    emit('requestClose')
  }
}
</script>

<template>
  <div
    ref="listRef"
    class="ctx-list"
    :class="{ 'ctx-sub': (depth ?? 0) > 0 }"
    role="menu"
    :style="posStyle"
    @keydown="onKeydown"
  >
    <template v-for="(item, i) in items" :key="item.key ?? `sep-${i}`">
      <div v-if="item.separator" class="ctx-sep" role="separator" />
      <button
        v-else
        :ref="(el) => setItemEl(item.key, el)"
        type="button"
        role="menuitem"
        class="ctx-item"
        :class="[
          `tone-${item.tone ?? 'default'}`,
          { 'is-disabled': item.disabled, 'is-active': item.key === activeKey },
        ]"
        :data-key="item.key"
        :disabled="item.disabled"
        :aria-haspopup="item.children?.length ? 'menu' : undefined"
        :aria-expanded="item.children?.length ? item.key === activeKey : undefined"
        @mouseenter="onEnter(item)"
        @focus="onEnter(item)"
        @click.stop="onClick(item)"
      >
        <span class="ctx-lead">
          <span v-if="item.checked != null" class="ctx-dot" :class="{ on: item.checked }" />
          <BaseIcon v-else-if="item.icon" :name="item.icon" :size="17" class="ctx-ico" />
        </span>
        <span class="ctx-label">{{ item.label }}</span>
        <span v-if="item.shortcut" class="ctx-shortcut">{{ item.shortcut }}</span>
        <BaseIcon
          v-if="item.children?.length"
          name="chevron-right"
          :size="16"
          class="ctx-chevron"
        />
      </button>
    </template>

    <BaseContextMenuList
      v-if="activeChildren()"
      class="ctx-sub-mount"
      :items="activeChildren()!"
      :pos-style="subStyle"
      :depth="(depth ?? 0) + 1"
      @select="(k) => emit('select', k)"
      @request-close="emit('requestClose')"
    />
  </div>
</template>

<style scoped>
.ctx-list {
  position: relative;
  z-index: 1200;
  min-width: 212px;
  max-width: 280px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-radius: 18px;
  background: rgba(56, 56, 59, 0.78);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow:
    0 18px 50px rgba(0, 0, 0, 0.4),
    0 4px 12px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
  transform-origin: top left;
  animation: ctx-pop 0.16s cubic-bezier(0.16, 1, 0.3, 1);
}
.ctx-list.ctx-sub {
  position: fixed;
  z-index: 1300;
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  background: transparent;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.9);
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 500;
  letter-spacing: -0.01em;
  line-height: 1;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.ctx-item:hover:not(.is-disabled),
.ctx-item.is-active:not(.is-disabled) {
  background: rgba(255, 255, 255, 0.11);
  color: var(--accent-fg);
}
.ctx-item:focus-visible {
  outline: none;
  background: rgba(255, 255, 255, 0.16);
  color: var(--accent-fg);
}
.ctx-item.is-disabled {
  opacity: 0.38;
  cursor: default;
}

.ctx-lead {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  flex-shrink: 0;
}
.ctx-ico {
  opacity: 0.8;
}
.ctx-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.45);
  box-sizing: border-box;
}
.ctx-dot.on {
  background: #4cd964;
  border-color: #4cd964;
  box-shadow: 0 0 0 3px rgba(76, 217, 100, 0.18);
}

.ctx-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ctx-shortcut {
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.42);
  letter-spacing: 0.02em;
}
.ctx-chevron {
  opacity: 0.5;
  margin-right: -2px;
  flex-shrink: 0;
}

.ctx-item.tone-danger {
  color: #ff6b63;
}
.ctx-item.tone-danger:hover:not(.is-disabled),
.ctx-item.tone-danger.is-active:not(.is-disabled) {
  background: rgba(255, 69, 58, 0.18);
  color: #ff8079;
}
.ctx-item.tone-danger .ctx-ico {
  opacity: 0.95;
}

.ctx-sep {
  height: 1px;
  margin: 6px 8px;
  background: rgba(255, 255, 255, 0.1);
}

@keyframes ctx-pop {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-3px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .ctx-list {
    animation: none;
  }
}
</style>

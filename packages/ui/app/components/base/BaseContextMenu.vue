<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
import BaseContextMenuList from './BaseContextMenuList.vue'
import type { ContextMenuItem } from './contextMenu'

/**
 * Right-click ("botão direito") context menu — graphite floating panel.
 * Wrap any trigger content in the default slot; right-clicking it opens the
 * menu at the cursor. Submenus, separators and a danger tone are supported
 * via the `items` tree (see ./contextMenu.ts).
 */
const props = defineProps<{
  items: ContextMenuItem[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [key: string]
  open: []
  close: []
}>()

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const rootStyle = ref<Record<string, string>>({ top: '0px', left: '0px' })

async function onContextMenu(e: MouseEvent) {
  if (props.disabled) return
  e.preventDefault()
  e.stopPropagation()
  open.value = true
  emit('open')
  await nextTick()
  place(e.clientX, e.clientY)
  document.addEventListener('pointerdown', onDocDown, true)
  document.addEventListener('keydown', onKey, true)
  window.addEventListener('resize', close)
  window.addEventListener('scroll', close, true)
  // Focus first item for keyboard users.
  rootRef.value
    ?.querySelector<HTMLButtonElement>('.ctx-item:not(.is-disabled)')
    ?.focus()
}

function place(x: number, y: number) {
  const el = rootRef.value
  if (!el) return
  const { offsetWidth: w, offsetHeight: h } = el
  const pad = 8
  const left = Math.min(x, window.innerWidth - w - pad)
  const top = Math.min(y, window.innerHeight - h - pad)
  rootStyle.value = {
    top: `${Math.max(pad, top)}px`,
    left: `${Math.max(pad, left)}px`,
  }
}

function close() {
  if (!open.value) return
  open.value = false
  emit('close')
  document.removeEventListener('pointerdown', onDocDown, true)
  document.removeEventListener('keydown', onKey, true)
  window.removeEventListener('resize', close)
  window.removeEventListener('scroll', close, true)
}

function onDocDown(e: PointerEvent) {
  if (rootRef.value?.contains(e.target as Node)) return
  close()
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
  }
}

function onSelect(key: string) {
  emit('select', key)
  close()
}

onBeforeUnmount(close)
</script>

<template>
  <div class="ctx-trigger" @contextmenu="onContextMenu">
    <slot />

    <Teleport to="body">
      <div v-if="open" ref="rootRef" class="ctx-root" :style="rootStyle">
        <BaseContextMenuList
          :items="items"
          :depth="0"
          @select="onSelect"
          @request-close="close"
        />
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.ctx-trigger {
  display: contents;
}
.ctx-root {
  position: fixed;
  z-index: 1200;
}
</style>

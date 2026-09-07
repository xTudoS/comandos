<script setup lang="ts" generic="T extends string">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
type Tab = { value: T; label: string; icon?: string }

const props = defineProps<{ tabs: Tab[]; ariaLabel?: string; label?: string }>()
const triggerLabel = computed(() => props.label ?? 'Visualizações')
/** Conjunto de views habilitadas (visíveis nas abas). */
const model = defineModel<T[]>({ required: true })

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

function isEnabled(v: T) {
  return model.value.includes(v)
}

function toggle(v: T) {
  if (isEnabled(v)) {
    // Nunca deixa ocultar a última view — sempre resta ao menos uma.
    if (model.value.length <= 1) return
    model.value = model.value.filter((x) => x !== v)
  } else {
    // Preserva a ordem canônica das abas ao reativar.
    model.value = props.tabs.map((t) => t.value).filter((x) => isEnabled(x) || x === v)
  }
}

async function openMenu() {
  open.value = true
  await nextTick()
  document.addEventListener('click', onDocClick, true)
  document.addEventListener('keydown', onKey)
}
function closeMenu() {
  if (!open.value) return
  open.value = false
  document.removeEventListener('click', onDocClick, true)
  document.removeEventListener('keydown', onKey)
}
function onTrigger(e: Event) {
  e.stopPropagation()
  open.value ? closeMenu() : openMenu()
}
function onDocClick(e: MouseEvent) {
  if (rootRef.value?.contains(e.target as Node)) return
  closeMenu()
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.stopPropagation()
    closeMenu()
  }
}
onBeforeUnmount(closeMenu)
</script>

<template>
  <div ref="rootRef" class="vvm">
    <button
      type="button"
      class="vvm-trigger"
      :class="{ 'is-open': open }"
      :aria-haspopup="true"
      :aria-expanded="open"
      :aria-label="ariaLabel ?? `Escolher ${triggerLabel.toLowerCase()}`"
      @click="onTrigger"
    >
      <BaseIcon name="sliders-horizontal" :size="15" />
      <span class="vvm-trigger-label">{{ triggerLabel }}</span>
      <BaseIcon name="chevron-down" :size="14" class="vvm-trigger-caret" />
    </button>

    <div v-if="open" class="vvm-menu" role="menu">
      <div class="vvm-head">{{ triggerLabel }}</div>
      <button
        v-for="t in tabs"
        :key="t.value"
        type="button"
        role="menuitemcheckbox"
        class="vvm-item"
        :aria-checked="isEnabled(t.value)"
        :disabled="isEnabled(t.value) && model.length <= 1"
        @click="toggle(t.value)"
      >
        <span class="vvm-check" :class="{ on: isEnabled(t.value) }">
          <BaseIcon v-if="isEnabled(t.value)" name="check" :size="12" />
        </span>
        <BaseIcon v-if="t.icon" :name="t.icon" :size="15" class="vvm-ic" />
        <span class="vvm-label">{{ t.label }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.vvm {
  position: relative;
  display: inline-flex;
}
.vvm-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text-3);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
}
.vvm-trigger:hover,
.vvm-trigger.is-open {
  border-color: var(--border-strong);
  color: var(--text);
}
.vvm-trigger-label {
  color: var(--text);
}
.vvm-trigger-caret {
  color: var(--text-3);
  transition: transform 0.15s;
}
.vvm-trigger.is-open .vvm-trigger-caret {
  transform: rotate(180deg);
}
.vvm-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 1000;
  min-width: 184px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06);
  padding: 4px;
}
.vvm-head {
  padding: 6px 10px 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-3);
}
.vvm-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition: background 0.1s;
}
.vvm-item:hover:not(:disabled) {
  background: var(--surface-hover);
}
.vvm-item:disabled {
  cursor: default;
}
.vvm-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  flex-shrink: 0;
  border: 1.5px solid var(--border-strong);
  border-radius: 6px;
  color: var(--accent-fg);
  background: transparent;
  transition: background 0.12s, border-color 0.12s;
}
.vvm-check.on {
  background: var(--accent);
  border-color: var(--accent);
}
.vvm-ic {
  color: var(--text-3);
  flex-shrink: 0;
}
.vvm-label {
  flex: 1;
}
</style>

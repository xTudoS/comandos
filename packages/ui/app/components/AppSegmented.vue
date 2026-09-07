<script setup lang="ts" generic="T extends string | number">
type Item = { value: T; label: string; icon?: string }

const props = defineProps<{
  items: Item[]
  size?: 'sm' | 'md'
  ariaLabel?: string
}>()

const model = defineModel<T>({ required: true })

const activeIndex = computed(() => {
  const i = props.items.findIndex((it) => it.value === model.value)
  return i < 0 ? 0 : i
})
</script>

<template>
  <div
    class="seg"
    :class="`seg-${size ?? 'md'}`"
    :style="{ '--seg-count': items.length }"
    role="tablist"
    :aria-label="ariaLabel"
  >
    <div
      class="seg-pill"
      :style="{ transform: `translateX(calc(${activeIndex} * 100%))` }"
      aria-hidden="true"
    />
    <button
      v-for="(it, idx) in items"
      :key="String(it.value)"
      type="button"
      class="seg-item"
      role="tab"
      :aria-selected="idx === activeIndex"
      :class="{ active: idx === activeIndex }"
      @click="model = it.value"
    >
      <BaseIcon v-if="it.icon" :name="it.icon" class="seg-ic" />
      <span>{{ it.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.seg {
  position: relative;
  display: grid;
  grid-template-columns: repeat(var(--seg-count), 1fr);
  background: color-mix(in srgb, var(--text) 6%, transparent);
  border-radius: 10px;
  padding: 2px;
  width: 100%;
  isolation: isolate;
}
.seg-sm { font-size: 12px; }
.seg-md { font-size: 13px; }
.seg-pill {
  position: absolute;
  left: 2px;
  top: 2px;
  bottom: 2px;
  width: calc((100% - 4px) / var(--seg-count));
  background: var(--surface);
  border-radius: 6px;
  box-shadow:
    0 0 0 0.5px rgba(0, 0, 0, 0.06),
    0 3px 8px -2px rgba(0, 0, 0, 0.1),
    0 1px 2px rgba(0, 0, 0, 0.06);
  transition: transform var(--dur-base) var(--ease-spring);
  z-index: 0;
  pointer-events: none;
}
.seg-item {
  position: relative;
  z-index: 1;
  padding: 6px 10px;
  min-height: 28px;
  min-width: 0;
  font-size: inherit;
  font-weight: 500;
  color: var(--text-2);
  background: transparent;
  border: none;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
  border-radius: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color var(--dur-fast) var(--ease-spring);
}
.seg-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.seg-item:hover:not(.active) {
  color: var(--text);
}
.seg-item.active {
  color: var(--text);
  font-weight: 600;
}
.seg-item:active {
  transform: none;
}
.seg-ic {
  width: 14px;
  height: 14px;
  opacity: 0.85;
}
.seg-item.active .seg-ic {
  opacity: 1;
}
</style>

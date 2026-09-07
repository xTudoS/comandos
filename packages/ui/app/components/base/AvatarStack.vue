<script setup lang="ts">
// Overlapping avatar stack with overflow chip (matches reference header).
const props = withDefaults(
  defineProps<{
    people: { name: string }[]
    max?: number
    size?: number
    showAdd?: boolean
  }>(),
  { max: 4, size: 30, showAdd: false },
)

const PALETTE = [
  '#0071e3',
  '#5856d6',
  '#30a46c',
  '#d97706',
  '#d93141',
  '#0a84ff',
]

function colorFor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

const shown = computed(() => props.people.slice(0, props.max))
const overflow = computed(() => Math.max(0, props.people.length - props.max))
</script>

<template>
  <div class="avatar-stack" :style="{ '--av-size': `${size}px` }">
    <span
      v-for="(p, i) in shown"
      :key="i"
      class="av"
      :style="{ background: colorFor(p.name), zIndex: shown.length - i }"
      :title="p.name"
    >{{ p.name.charAt(0).toUpperCase() }}</span>
    <span v-if="overflow > 0" class="av av-more">+{{ overflow }}</span>
    <button v-if="showAdd" type="button" class="av av-add" aria-label="Adicionar">
      <BaseIcon name="plus" :size="14" />
    </button>
  </div>
</template>

<style scoped>
.avatar-stack {
  display: inline-flex;
  align-items: center;
}
.av {
  width: var(--av-size);
  height: var(--av-size);
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: calc(var(--av-size) * 0.42);
  font-weight: 600;
  color: var(--accent-fg);
  border: 2px solid var(--panel);
  margin-left: calc(var(--av-size) * -0.32);
  flex-shrink: 0;
}
.av:first-child {
  margin-left: 0;
}
.av-more {
  background: var(--surface-hover);
  color: var(--text-2);
  font-weight: 600;
}
.av-add {
  background: var(--surface);
  color: var(--text-3);
  border: 1px dashed var(--border-strong);
  cursor: pointer;
}
.av-add:hover {
  color: var(--text);
  border-color: var(--text-3);
}
</style>

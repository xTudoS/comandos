<script setup lang="ts">
import { formatDuration, timeToMin } from '~~/shared/bookingRanges'
import { formatInternational } from '~~/shared/phone'

const props = defineProps<{
  dateLabel: string
  start: string
  end: string
  name: string
  whatsapp: string
  email: string
  reason: string
  description: string
}>()

const emit = defineEmits<{ edit: [step: 'when' | 'who'] }>()

const timeLabel = computed(
  () => `${props.start} – ${props.end} · ${formatDuration(timeToMin(props.end) - timeToMin(props.start))}`,
)
</script>

<template>
  <div class="review">
    <section class="block">
      <div class="block-head">
        <h3 class="block-title">Quando</h3>
        <button type="button" class="edit" @click="emit('edit', 'when')">Alterar</button>
      </div>
      <p class="row">
        <BaseIcon name="calendar" :size="15" /><span>{{ dateLabel }}</span>
      </p>
      <p class="row">
        <BaseIcon name="clock" :size="15" /><span class="tabular">{{ timeLabel }}</span>
      </p>
    </section>

    <section class="block">
      <div class="block-head">
        <h3 class="block-title">Seus dados</h3>
        <button type="button" class="edit" @click="emit('edit', 'who')">Alterar</button>
      </div>
      <p class="row">
        <BaseIcon name="user" :size="15" /><span>{{ name }}</span>
      </p>
      <p class="row">
        <BaseIcon name="phone" :size="15" /><span class="tabular">
          {{ formatInternational(whatsapp) }}
        </span>
      </p>
      <p class="row">
        <BaseIcon name="mail" :size="15" /><span class="break">{{ email }}</span>
      </p>
      <p class="row">
        <BaseIcon name="align-left" :size="15" /><span>{{ reason }}</span>
      </p>
      <p v-if="description" class="row muted">
        <BaseIcon name="message-square" :size="15" /><span>{{ description }}</span>
      </p>
    </section>
  </div>
</template>

<style scoped>
.review {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.block-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 2px;
}
.block-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-3);
  margin: 0;
}
.edit {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  padding: 4px 0;
}
.edit:hover {
  text-decoration: underline;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  line-height: 1.45;
}
.row :deep(svg) {
  color: var(--accent);
  flex: none;
}
.row.muted {
  color: var(--text-2);
  font-weight: 400;
}
.row.muted :deep(svg) {
  color: var(--text-4);
}
.break {
  word-break: break-all;
}
</style>

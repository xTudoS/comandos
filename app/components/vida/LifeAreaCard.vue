<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { LifeArea } from '~/composables/useLifeTracker'

const props = defineProps<{ area: LifeArea }>()

const {
  areaScore,
  areaAlert,
  areaTaskStats,
  itemTaskStats,
  setItemValue,
  addItem,
  renameItem,
  removeItem,
} = useLifeTracker()

const expanded = ref(false)
const editingId = ref<string | null>(null)
const editText = ref('')
const adding = ref(false)
const newName = ref('')
const nameInput = ref<HTMLInputElement>()
const addInput = ref<HTMLInputElement>()

const tint = (pct: number) => `color-mix(in srgb, ${props.area.color} ${pct}%, transparent)`

function startRename(id: string, current: string) {
  editingId.value = id
  editText.value = current
  nextTick(() => nameInput.value?.focus())
}
function commitRename(id: string) {
  if (editText.value.trim()) renameItem(props.area.key, id, editText.value)
  editingId.value = null
}
function startAdd() {
  adding.value = true
  newName.value = ''
  nextTick(() => addInput.value?.focus())
}
function commitAdd() {
  if (newName.value.trim()) addItem(props.area.key, newName.value)
  adding.value = false
}
function sliderBg(v: number) {
  const pct = v * 10
  return `linear-gradient(to right, ${props.area.color} ${pct}%, var(--border) ${pct}%)`
}
</script>

<template>
  <div class="area" :class="{ expanded }">
    <button type="button" class="area-head" @click="expanded = !expanded">
      <span class="area-ico" :style="{ background: tint(14), color: area.color }">
        <BaseIcon :name="area.icon" :size="20" />
      </span>
      <span class="area-info">
        <span class="area-title">
          {{ area.label }}
          <span v-if="areaAlert(area)" class="area-dot" :style="{ background: 'var(--warning)' }" />
        </span>
        <span class="area-meta" :class="{ alert: areaAlert(area) }">
          <template v-if="areaAlert(area)?.type === 'low'">
            Atenção: {{ areaAlert(area)!.names[0] }}
          </template>
          <template v-else-if="areaAlert(area)?.type === 'variance'">
            Variação alta entre itens
          </template>
          <template v-else>{{ area.items.length }} itens em equilíbrio</template>
        </span>
        <span v-if="areaTaskStats(area.key).total" class="area-tasks">
          <BaseIcon name="square-check-big" :size="11" />
          {{ areaTaskStats(area.key).done }}/{{ areaTaskStats(area.key).total }} tarefas
          <template v-if="areaTaskStats(area.key).open">
            · {{ areaTaskStats(area.key).open }} aberta{{ areaTaskStats(area.key).open === 1 ? '' : 's' }}
          </template>
        </span>
      </span>
      <span class="area-score" :style="{ color: area.color }">{{ areaScore(area) }}</span>
      <BaseIcon name="chevron-right" :size="17" class="area-chev" />
    </button>

    <div class="area-drawer">
      <div class="area-drawer-inner">
        <div v-for="item in area.items" :key="item.id" class="item">
          <div class="item-row">
            <input
              v-if="editingId === item.id"
              ref="nameInput"
              v-model="editText"
              class="item-name-input"
              maxlength="40"
              @blur="commitRename(item.id)"
              @keydown.enter.prevent="commitRename(item.id)"
              @keydown.esc="editingId = null"
            >
            <button
              v-else
              type="button"
              class="item-name"
              :class="{ flagged: item.value <= 4 }"
              @click="startRename(item.id, item.name)"
            >
              {{ item.name }}
              <BaseIcon name="pencil" :size="11" class="item-edit-hint" />
            </button>

            <div class="item-actions">
              <span
                v-if="itemTaskStats(item.id).total"
                class="item-tasks"
                :title="`${itemTaskStats(item.id).done}/${itemTaskStats(item.id).total} tarefas concluídas`"
              >
                <BaseIcon name="square-check-big" :size="10" />
                {{ itemTaskStats(item.id).done }}/{{ itemTaskStats(item.id).total }}
              </span>
              <span class="item-value" :style="{ color: item.value <= 4 ? 'var(--warning)' : 'var(--text)' }">
                {{ item.value }}
              </span>
              <button
                v-if="area.items.length > 1"
                type="button"
                class="item-del"
                aria-label="Remover"
                @click="removeItem(area.key, item.id)"
              >
                <BaseIcon name="x" :size="13" />
              </button>
            </div>
          </div>
          <input
            type="range" class="item-slider" min="0" max="10" step="1"
            :value="item.value"
            :style="{ background: sliderBg(item.value) }"
            @input="setItemValue(area.key, item.id, +($event.target as HTMLInputElement).value)"
          >
        </div>

        <input
          v-if="adding"
          ref="addInput"
          v-model="newName"
          class="add-input"
          :placeholder="area.isPeople ? 'Nome da pessoa…' : 'Nome do item…'"
          maxlength="40"
          @blur="commitAdd"
          @keydown.enter.prevent="commitAdd"
          @keydown.esc="adding = false"
        >
        <button v-else type="button" class="add-btn" @click="startAdd">
          <BaseIcon name="plus" :size="14" />
          {{ area.isPeople ? 'Adicionar pessoa' : 'Adicionar item' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.area {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  overflow: hidden;
  transition: box-shadow var(--dur-base) var(--ease-spring);
}
.area.expanded {
  box-shadow: var(--shadow-md);
}
.area-head {
  display: grid;
  grid-template-columns: 44px 1fr auto auto;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 16px 18px;
  text-align: left;
}
.area-head:hover {
  background: var(--surface-hover);
}
.area-ico {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.area-info {
  min-width: 0;
}
.area-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text);
}
.area-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.area-meta {
  display: block;
  margin-top: 2px;
  font-size: 13px;
  color: var(--text-3);
}
.area-meta.alert {
  color: var(--warning);
  font-weight: 500;
}
.area-tasks {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}
.item-tasks {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: var(--radius-pill);
  background: var(--surface-hover);
  color: var(--text-3);
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.area-score {
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  min-width: 44px;
  text-align: right;
}
.area-chev {
  color: var(--text-4);
  transition: transform var(--dur-base) var(--ease-spring);
}
.area.expanded .area-chev {
  transform: rotate(90deg);
}

/* Drawer */
.area-drawer {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows var(--dur-slow) var(--ease-spring);
}
.area.expanded .area-drawer {
  grid-template-rows: 1fr;
}
.area-drawer > .area-drawer-inner {
  overflow: hidden;
  min-height: 0;
}
.area-drawer-inner {
  padding: 0 18px;
}
.area.expanded .area-drawer-inner {
  padding: 4px 18px 18px;
  border-top: 1px solid var(--border-faint);
}

.item {
  padding: 14px 0;
  border-bottom: 1px solid var(--border-faint);
}
.item:last-of-type {
  border-bottom: none;
}
.item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.item-name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  padding: 4px 6px;
  margin: -3px -6px;
  border-radius: var(--radius-sm);
}
.item-name:hover {
  background: var(--surface-hover);
}
.item-name.flagged {
  color: var(--warning);
}
.item-edit-hint {
  opacity: 0;
  color: var(--text-4);
  transition: opacity var(--dur-fast) var(--ease-spring);
}
.item-name:hover .item-edit-hint {
  opacity: 1;
}
.item-name-input {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--accent);
  border-radius: var(--radius-sm);
  padding: 4px 6px;
  outline: none;
  max-width: 240px;
}
.item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.item-value {
  font-size: 17px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  min-width: 24px;
  text-align: right;
}
.item-del {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-4);
  transition: background var(--dur-fast) var(--ease-spring),
    color var(--dur-fast) var(--ease-spring);
}
.item-del:hover {
  background: var(--danger);
  color: var(--accent-fg);
}

.item-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 5px;
  border-radius: 4px;
  outline: none;
  cursor: pointer;
}
.item-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--surface);
  border: 0.5px solid rgba(0, 0, 0, 0.06);
  box-shadow: var(--shadow-md);
  cursor: grab;
}
.item-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--shadow-md);
  cursor: grab;
}

.add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  margin-top: 14px;
  padding: 12px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-md);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-3);
  transition: border-color var(--dur-fast) var(--ease-spring),
    color var(--dur-fast) var(--ease-spring);
}
.add-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.add-input {
  width: 100%;
  margin-top: 14px;
  height: 40px;
  padding: 0 12px;
  border: 1px solid var(--accent);
  border-radius: var(--radius-md);
  background: var(--surface);
  font-size: 13px;
  color: var(--text);
  outline: none;
}
</style>

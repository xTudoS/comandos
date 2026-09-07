<script setup lang="ts">
// ModalMeta — form de criar/editar meta. Spec §10.1: titulo, descricao, prazo.

import { computed, reactive, ref, watch } from 'vue'
import type { Meta } from '~/types/meta'
import { AREA_ORDER, AREA_META, type LifeAreaKey } from '~/composables/useLifeTracker'

import CompanyAutocomplete from '~/components/empresas/CompanyAutocomplete.vue'

interface Props {
  open: boolean
  /** Meta a editar; null para criação. */
  meta?: Meta | null
}

const props = withDefaults(defineProps<Props>(), { meta: null })

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [payload: SavePayload, isEdit: boolean]
}>()

export interface SavePayload {
  titulo: string
  descricao: string
  categoria: 'empresa' | 'produto' | 'geral' | 'pessoal'
  prazo: string | null
  company_id: string | null
  area_vida: LifeAreaKey | null
}

const defaults: SavePayload = {
  titulo: '',
  descricao: '',
  categoria: 'geral',
  prazo: null,
  company_id: null,
  area_vida: null,
}

const AREA_VIDA_OPTIONS = AREA_ORDER.map((k) => ({ value: k, label: AREA_META[k].label }))

const form = reactive<SavePayload>({ ...defaults })
const formError = ref<string | null>(null)
const saving = ref(false)

const isEdit = computed(() => !!props.meta)
const titulo = computed(() => (isEdit.value ? 'Editar meta' : 'Nova meta'))

watch(
  () => props.open,
  (open) => {
    if (!open) return
    formError.value = null
    saving.value = false
    if (props.meta) {
      Object.assign(form, {
        titulo: props.meta.titulo,
        descricao: props.meta.descricao,
        categoria: props.meta.categoria,
        prazo: props.meta.prazo,
        company_id: props.meta.company_id ?? null,
        area_vida: props.meta.area_vida ?? null,
      })
    } else {
      Object.assign(form, defaults)
    }
  },
  { immediate: true },
)

const CATEGORIAS: Array<{ value: string; label: string }> = [
  { value: 'empresa', label: 'Empresa' },
  { value: 'produto', label: 'Produto' },
  { value: 'geral', label: 'Geral' },
  { value: 'pessoal', label: 'Pessoal' },
]

const categoriaSelect = computed({
  get: () => form.categoria,
  set: (v: string) => (form.categoria = v as SavePayload['categoria']),
})

const prazoInput = computed({
  get: () => form.prazo ?? '',
  set: (v: string | number) => (form.prazo = v ? String(v) : null),
})

const areaVidaSelect = computed({
  get: () => form.area_vida ?? '',
  set: (v: string | number) => (form.area_vida = v ? (String(v) as LifeAreaKey) : null),
})

function close() {
  if (saving.value) return
  emit('update:open', false)
}

function onSave() {
  if (!form.titulo.trim()) {
    formError.value = 'Título é obrigatório.'
    return
  }
  // Toda meta pessoal precisa estar ancorada numa área da vida.
  if (form.categoria === 'pessoal' && !form.area_vida) {
    formError.value = 'Metas pessoais precisam de uma área da vida.'
    return
  }
  formError.value = null
  saving.value = true
  try {
    emit(
      'save',
      {
        titulo: form.titulo.trim(),
        descricao: form.descricao,
        categoria: form.categoria,
        prazo: form.prazo ?? null,
        company_id: form.company_id ?? null,
        area_vida: form.categoria === 'pessoal' ? form.area_vida : null,
      },
      isEdit.value,
    )
  } finally {
    saving.value = false
  }
}

defineExpose({
  setSaving: (v: boolean) => (saving.value = v),
  setError: (msg: string | null) => (formError.value = msg),
})
</script>

<template>
  <AppModal
    :open="open"
    :titulo="titulo"
    :max-width="480"
    @update:open="(v) => emit('update:open', v)"
  >
    <BaseField label="Título" required style="margin-bottom: 14px">
      <BaseInput
        v-model="form.titulo"
        placeholder="Ex.: Lançar produto Y até Q4"
      />
    </BaseField>

    <BaseFieldRow :cols="1" style="margin-bottom: 14px">
      <BaseField label="Categoria">
        <BaseSelect v-model="categoriaSelect" :options="CATEGORIAS" />
      </BaseField>
    </BaseFieldRow>

    <BaseField
      v-if="form.categoria === 'pessoal'"
      label="Área da vida"
      required
      hint="Metas pessoais são ancoradas numa área da vida."
      style="margin-bottom: 14px"
    >
      <BaseSelect
        v-model="areaVidaSelect"
        :options="[{ value: '', label: '— selecione —' }, ...AREA_VIDA_OPTIONS]"
      />
    </BaseField>

    <BaseField label="Prazo" hint="Opcional" style="margin-bottom: 14px">
      <BaseInput v-model="prazoInput" type="date" />
    </BaseField>

    <BaseField label="Empresa" hint="Vincule a meta a uma empresa para reuso futuro" style="margin-bottom: 14px">
      <CompanyAutocomplete v-model="form.company_id" placeholder="Buscar ou criar empresa…" />
    </BaseField>

    <BaseField label="Descrição" hint="Por quê essa meta importa?">
      <BaseTextarea
        v-model="form.descricao"
        :rows="5"
        placeholder="Contexto, definição de pronto, métricas…"
      />
    </BaseField>

    <div v-if="meta" class="anexos-wrap">
      <BaseField label="Anexos">
        <AnexosList entity="goal" :entity-id="meta.id" />
      </BaseField>
    </div>

    <template #actions>
      <div v-if="formError" class="form-error">{{ formError }}</div>
      <BaseButton variant="ghost" :disabled="saving" @click="close">Cancelar</BaseButton>
      <BaseButton variant="primary" :loading="saving" @click="onSave">
        Salvar
      </BaseButton>
    </template>
  </AppModal>
</template>

<style scoped>
.form-error {
  font-size: var(--fs-12);
  color: var(--color-danger);
  margin-right: auto;
  align-self: center;
  line-height: 1.4;
}
.anexos-wrap {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border);
}
</style>

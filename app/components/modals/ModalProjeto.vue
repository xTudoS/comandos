<script setup lang="ts">
// ModalProjeto — form de criar/editar projeto.
//
// Empresa-pai só fica habilitada quando categoria='produto' (per spec §10.1
// `empresa_id` é específico de produto). Outras categorias forçam null.
// No modo edição mostra AnexosList existente (mantém integração).

import { computed, reactive, ref, watch } from 'vue'
import type { CategoriaProjeto, Projeto } from '~/types/projeto'
import type { Meta } from '~/types/meta'
import { AREA_ORDER, AREA_META, type LifeAreaKey } from '~/composables/useLifeTracker'

import CompanyAutocomplete from '~/components/empresas/CompanyAutocomplete.vue'

interface Props {
  open: boolean
  /** Projeto a editar; null para criação. */
  projeto?: Projeto | null
  /** Lista para opções de empresa-pai (filtra empresas ativas). */
  projetos: Projeto[]
  /** Lista para opções de meta vinculada. */
  metas?: Meta[]
}

const props = withDefaults(defineProps<Props>(), {
  projeto: null,
  metas: () => [],
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [payload: SavePayload, isEdit: boolean]
}>()

export interface SavePayload {
  nome: string
  categoria: CategoriaProjeto
  empresa_id: string | null
  meta_id: string | null
  company_id: string | null
  notas: string
  campo_label: string
  campo_valor: string
  area_vida: LifeAreaKey | null
}

const CATEGORIAS: Array<{ value: CategoriaProjeto; label: string }> = [
  { value: 'empresa', label: 'Empresa' },
  { value: 'produto', label: 'Produto' },
  { value: 'geral', label: 'Geral' },
  { value: 'pessoal', label: 'Pessoal' },
]

const AREA_VIDA_OPTIONS = AREA_ORDER.map((k) => ({ value: k, label: AREA_META[k].label }))

const defaults: SavePayload = {
  nome: '',
  categoria: 'geral',
  empresa_id: null,
  meta_id: null,
  company_id: null,
  notas: '',
  campo_label: '',
  campo_valor: '',
  area_vida: null,
}

const form = reactive<SavePayload>({ ...defaults })
const formError = ref<string | null>(null)
const saving = ref(false)

const isEdit = computed(() => !!props.projeto)
const titulo = computed(() => (isEdit.value ? 'Editar projeto' : 'Novo projeto'))

watch(
  () => props.open,
  (open) => {
    if (!open) return
    formError.value = null
    saving.value = false
    if (props.projeto) {
      Object.assign(form, {
        nome: props.projeto.nome,
        categoria: props.projeto.categoria,
        empresa_id: props.projeto.empresa_id,
        meta_id: props.projeto.meta_id,
        company_id: props.projeto.company_id,
        notas: props.projeto.notas,
        campo_label: props.projeto.campo_label,
        campo_valor: props.projeto.campo_valor,
        area_vida: props.projeto.area_vida,
      })
    } else {
      Object.assign(form, defaults)
    }
  },
  { immediate: true },
)

// Quando categoria muda para algo que não é 'produto', limpamos empresa_id.
// Auto-seta o label do campo extra baseado na categoria (somente quando vazio
// ou quando trocando entre categorias com label automático — preserva label
// custom de geral/pessoal).
const AUTO_LABELS: Record<CategoriaProjeto, string> = {
  empresa: 'Nome da empresa',
  produto: 'Nome do produto',
  geral: '',
  pessoal: '',
}
watch(
  () => form.categoria,
  (cat, prev) => {
    if (cat !== 'produto') form.empresa_id = null
    const auto = AUTO_LABELS[cat]
    const prevAuto = prev ? AUTO_LABELS[prev] : ''
    // Substitui apenas se estava com auto-label anterior, ou vazio.
    if (auto && (form.campo_label === prevAuto || form.campo_label === '')) {
      form.campo_label = auto
    } else if (!auto && form.campo_label === prevAuto) {
      form.campo_label = ''
    }
  },
)

const isCustomLabel = computed(
  () => form.categoria === 'geral' || form.categoria === 'pessoal',
)
const extraValuePlaceholder = computed(() => {
  if (form.categoria === 'empresa') return 'Ex.: Acme S.A.'
  if (form.categoria === 'produto') return 'Ex.: Acme Plus v2'
  return form.campo_label ? `Valor de "${form.campo_label}"` : 'Valor'
})

const empresaOptions = computed(() => {
  const empty = { value: '', label: '— nenhuma —' }
  const list = props.projetos
    .filter((p) => !p.arquivado && p.categoria === 'empresa' && p.id !== props.projeto?.id)
    .map((p) => ({ value: p.id, label: p.nome }))
  return [empty, ...list]
})

const metaOptions = computed(() => {
  const empty = { value: '', label: '— nenhuma —' }
  const list = props.metas
    .filter((m) => !m.arquivada)
    .map((m) => ({ value: m.id, label: m.titulo }))
  return [empty, ...list]
})

function close() {
  if (saving.value) return
  emit('update:open', false)
}

async function onSave() {
  if (!form.nome.trim()) {
    formError.value = 'Nome é obrigatório.'
    return
  }
  // Todo projeto pessoal precisa estar ancorado numa área da vida.
  if (form.categoria === 'pessoal' && !form.area_vida) {
    formError.value = 'Projetos pessoais precisam de uma área da vida.'
    return
  }
  formError.value = null
  saving.value = true
  try {
    emit(
      'save',
      {
        nome: form.nome.trim(),
        categoria: form.categoria,
        empresa_id: form.categoria === 'produto' ? form.empresa_id || null : null,
        meta_id: form.meta_id || null,
        company_id: form.company_id || null,
        notas: form.notas,
        campo_label: form.campo_label.trim(),
        campo_valor: form.campo_valor.trim(),
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

const empresaIdSelect = computed({
  get: () => form.empresa_id ?? '',
  set: (v: string | number) => (form.empresa_id = v ? String(v) : null),
})

const metaIdSelect = computed({
  get: () => form.meta_id ?? '',
  set: (v: string | number) => (form.meta_id = v ? String(v) : null),
})

const categoriaSelect = computed({
  get: () => form.categoria,
  set: (v: string | number) => (form.categoria = String(v) as CategoriaProjeto),
})

const areaVidaSelect = computed({
  get: () => form.area_vida ?? '',
  set: (v: string | number) => (form.area_vida = v ? (String(v) as LifeAreaKey) : null),
})
</script>

<template>
  <AppModal
    :open="open"
    :titulo="titulo"
    :max-width="560"
    @update:open="(v) => emit('update:open', v)"
  >
    <BaseField label="Nome" required style="margin-bottom: 14px">
      <BaseInput
        v-model="form.nome"
        placeholder="Ex.: Empresa X, Produto Y"
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
      hint="Projetos pessoais são ancorados numa área da vida."
      style="margin-bottom: 14px"
    >
      <BaseSelect
        v-model="areaVidaSelect"
        :options="[{ value: '', label: '— selecione —' }, ...AREA_VIDA_OPTIONS]"
      />
    </BaseField>

    <BaseField label="Meta vinculada" hint="Opcional" style="margin-bottom: 14px">
      <BaseSelect v-model="metaIdSelect" :options="metaOptions" />
    </BaseField>

    <BaseField
      label="Empresa"
      hint="Vincule a uma empresa canônica para reuso entre tarefas, metas e projetos"
      style="margin-bottom: 14px"
    >
      <CompanyAutocomplete v-model="form.company_id" placeholder="Buscar ou criar empresa…" />
    </BaseField>

    <div v-if="form.categoria !== 'produto'" class="extra-row" style="margin-bottom: 14px">
      <BaseField
        v-if="isCustomLabel"
        label="Qual campo?"
        hint="Defina um rótulo para o campo abaixo (ex.: Cliente, Setor, Tema…)"
      >
        <BaseInput
          v-model="form.campo_label"
          placeholder="Ex.: Cliente, Setor, Disciplina…"
        />
      </BaseField>
      <BaseField
        :label="form.campo_label || (form.categoria === 'empresa' ? 'Nome da empresa' : 'Valor')"
        :hint="isCustomLabel && !form.campo_label ? 'Defina o rótulo acima primeiro.' : 'Opcional'"
      >
        <BaseInput
          v-model="form.campo_valor"
          :placeholder="extraValuePlaceholder"
          :disabled="isCustomLabel && !form.campo_label.trim()"
        />
      </BaseField>
    </div>

    <BaseField label="Notas" hint="Descrição curta, contexto, links…">
      <BaseTextarea
        v-model="form.notas"
        :rows="5"
        placeholder="Notas internas sobre o projeto…"
      />
    </BaseField>

    <div v-if="projeto" class="anexos-wrap">
      <BaseField label="Anexos">
        <AnexosList entity="project" :entity-id="projeto.id" />
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
.anexos-wrap {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--color-border);
}

.form-error {
  font-size: var(--fs-12);
  color: var(--color-danger);
  margin-right: auto;
  align-self: center;
  line-height: 1.4;
}
.extra-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.extra-row > .field {
  min-width: 0;
}
@media (max-width: 600px) {
  .extra-row {
    grid-template-columns: 1fr;
  }
}
</style>

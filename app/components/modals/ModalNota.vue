<script setup lang="ts">
// ModalNota — per design-spec-comando.md §5/§9.6
//
// Form de criar/editar nota. Quando tipo='Credencial', exibe BaseWarning.
// No modo edição, mostra AnexosList existente (mantém integração).

import { computed, reactive, ref, watch } from 'vue'
import type { Nota, TipoNota } from '~/types/nota'
import type { Projeto } from '~/types/projeto'

import CompanyAutocomplete from '~/components/empresas/CompanyAutocomplete.vue'

interface Props {
  open: boolean
  /** Nota a editar; null para criação. */
  nota?: Nota | null
  projetos: Projeto[]
}

const props = withDefaults(defineProps<Props>(), {
  nota: null,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [payload: SavePayload, isEdit: boolean]
}>()

export interface SavePayload {
  titulo: string
  corpo: string
  tipo: TipoNota
  projeto_id: string | null
  company_id: string | null
  status: Nota['status']
}

const TIPOS: Array<{ value: TipoNota; label: string }> = [
  { value: 'Playbook', label: 'Playbook' },
  { value: 'Credencial', label: 'Credencial' },
  { value: 'Contato', label: 'Contato' },
  { value: 'Decisão', label: 'Decisão' },
  { value: 'Referência', label: 'Referência' },
]

const STATUS: Array<{ value: Nota['status']; label: string }> = [
  { value: 'Ativa', label: 'Ativa' },
  { value: 'Rascunho', label: 'Rascunho' },
]

const defaults: SavePayload = {
  titulo: '',
  corpo: '',
  tipo: 'Referência',
  projeto_id: null,
  company_id: null,
  status: 'Ativa',
}

const form = reactive<SavePayload>({ ...defaults })
const formError = ref<string | null>(null)
const saving = ref(false)

const isEdit = computed(() => !!props.nota)
const titulo = computed(() => (isEdit.value ? 'Editar nota' : 'Nova nota'))

watch(
  () => props.open,
  (open) => {
    if (!open) return
    formError.value = null
    saving.value = false
    if (props.nota) {
      Object.assign(form, {
        titulo: props.nota.titulo,
        corpo: props.nota.corpo,
        tipo: props.nota.tipo,
        projeto_id: props.nota.projeto_id,
        company_id: props.nota.company_id ?? null,
        status: props.nota.status,
      })
    } else {
      Object.assign(form, defaults)
    }
  },
  { immediate: true },
)

const projetoOptions = computed(() => {
  const empty = { value: '', label: '— sem projeto —' }
  const list = props.projetos
    .filter((p) => !p.arquivado)
    .map((p) => ({ value: p.id, label: p.nome }))
  return [empty, ...list]
})

function close() {
  if (saving.value) return
  emit('update:open', false)
}

async function onSave() {
  if (!form.titulo.trim()) {
    formError.value = 'Título é obrigatório.'
    return
  }
  formError.value = null
  saving.value = true
  try {
    emit(
      'save',
      {
        titulo: form.titulo.trim(),
        corpo: form.corpo,
        tipo: form.tipo,
        projeto_id: form.projeto_id || null,
        company_id: form.company_id || null,
        status: form.status,
      },
      isEdit.value,
    )
    // O fechamento e o reset do saving ficam por conta do consumer
    // (page) após sucesso da operação async; aqui pelo menos liberamos.
  } finally {
    saving.value = false
  }
}

// Permite que o caller force "modal está submetendo" (lock externo).
defineExpose({
  setSaving: (v: boolean) => (saving.value = v),
  setError: (msg: string | null) => (formError.value = msg),
})

// Wrap projeto_id null⇄'' para o BaseSelect.
const projetoIdSelect = computed({
  get: () => form.projeto_id ?? '',
  set: (v: string | number) => (form.projeto_id = v ? String(v) : null),
})

// BaseSelect emite string|number — coerção para tipos certos no v-model.
const tipoSelect = computed({
  get: () => form.tipo,
  set: (v: string | number) => (form.tipo = String(v) as TipoNota),
})
const statusSelect = computed({
  get: () => form.status,
  set: (v: string | number) => (form.status = String(v) as Nota['status']),
})
</script>

<template>
  <AppModal
    :open="open"
    :titulo="titulo"
    :max-width="560"
    @update:open="(v) => emit('update:open', v)"
  >
    <BaseWarning v-if="form.tipo === 'Credencial'" style="margin-bottom: 14px">
      <strong>Atenção sobre credenciais.</strong> Use só para informações de
      <strong>baixo risco</strong> ou referência interna. Senhas e segredos de
      produção devem ficar em um gerenciador dedicado.
    </BaseWarning>

    <BaseField label="Título" required style="margin-bottom: 14px">
      <BaseInput
        v-model="form.titulo"
        placeholder="Ex.: Acesso cofre, Playbook deploy…"
      />
    </BaseField>

    <BaseFieldRow :cols="2" style="margin-bottom: 14px">
      <BaseField label="Tipo">
        <BaseSelect v-model="tipoSelect" :options="TIPOS" />
      </BaseField>
      <BaseField label="Status">
        <BaseSelect v-model="statusSelect" :options="STATUS" />
      </BaseField>
    </BaseFieldRow>

    <BaseField label="Projeto" hint="Opcional" style="margin-bottom: 14px">
      <BaseSelect v-model="projetoIdSelect" :options="projetoOptions" />
    </BaseField>

    <BaseField label="Empresa" hint="Opcional" style="margin-bottom: 14px">
      <CompanyAutocomplete v-model="form.company_id" placeholder="Buscar ou criar empresa…" />
    </BaseField>

    <BaseField label="Conteúdo">
      <BaseTextarea
        v-model="form.corpo"
        :rows="8"
        placeholder="Markdown suportado. Passo a passo, links, decisão…"
      />
    </BaseField>

    <div v-if="nota" class="anexos-wrap">
      <BaseField label="Anexos">
        <AnexosList entity="note" :entity-id="nota.id" />
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
</style>

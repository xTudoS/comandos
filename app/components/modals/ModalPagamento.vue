<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type {
  Payment,
  PaymentKind,
  PaymentRecurrence,
} from '~/composables/usePayments'
import { parseBRLToCents } from '~/utils/money'

import CompanyAutocomplete from '~/components/empresas/CompanyAutocomplete.vue'

interface Props {
  open: boolean
  pagamento?: Payment | null
}

const props = withDefaults(defineProps<Props>(), {
  pagamento: null,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
  save: [payload: SavePayload, isEdit: boolean]
}>()

export interface SavePayload {
  description: string
  amountCents: number
  dueDate: string
  notes: string
  kind: PaymentKind
  recurrence: PaymentRecurrence
  companyId: string | null
}

const defaults = {
  description: '',
  amountInput: '',
  dueDate: '',
  notes: '',
  kind: 'expense' as PaymentKind,
  recurrence: 'none' as PaymentRecurrence,
  companyId: null as string | null,
}

const form = reactive({ ...defaults })
const formError = ref<string | null>(null)
const saving = ref(false)

const isEdit = computed(() => !!props.pagamento)
const titulo = computed(() =>
  isEdit.value
    ? form.kind === 'income' ? 'Editar receita' : 'Editar pagamento'
    : form.kind === 'income' ? 'Nova receita' : 'Novo pagamento',
)

const kindOptions: Array<{ value: PaymentKind; label: string }> = [
  { value: 'expense', label: 'Saída (a pagar)' },
  { value: 'income', label: 'Entrada (a receber)' },
]

const recurrenceOptions: Array<{ value: PaymentRecurrence; label: string }> = [
  { value: 'none', label: 'Não repete' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'quarterly', label: 'Trimestral' },
  { value: 'yearly', label: 'Anual' },
]

watch(
  () => props.open,
  (open) => {
    if (!open) return
    formError.value = null
    saving.value = false
    if (props.pagamento) {
      Object.assign(form, {
        description: props.pagamento.description,
        amountInput: (props.pagamento.amountCents / 100).toFixed(2).replace('.', ','),
        dueDate: props.pagamento.dueDate,
        notes: props.pagamento.notes,
        kind: props.pagamento.kind,
        recurrence: props.pagamento.recurrence,
        companyId: props.pagamento.companyId ?? null,
      })
    } else {
      Object.assign(form, defaults)
    }
  },
  { immediate: true },
)

function close() {
  if (saving.value) return
  emit('update:open', false)
}

async function onSave() {
  if (!form.description.trim()) {
    formError.value = 'Descrição é obrigatória.'
    return
  }
  const cents = parseBRLToCents(form.amountInput)
  if (cents === null) {
    formError.value = 'Valor inválido — use algo como 1.234,56.'
    return
  }
  if (!form.dueDate) {
    formError.value = 'Data de vencimento é obrigatória.'
    return
  }
  formError.value = null
  saving.value = true
  try {
    emit(
      'save',
      {
        description: form.description.trim(),
        amountCents: cents,
        dueDate: form.dueDate,
        notes: form.notes,
        kind: form.kind,
        recurrence: form.recurrence,
        companyId: form.companyId,
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
    :max-width="560"
    @update:open="(v) => emit('update:open', v)"
  >
    <BaseField label="Tipo" required style="margin-bottom: 14px">
      <div class="kind-toggle" role="group" aria-label="Tipo de pagamento">
        <button
          v-for="opt in kindOptions"
          :key="opt.value"
          type="button"
          class="kind-btn"
          :class="[`is-${opt.value}`, { active: form.kind === opt.value }]"
          @click="form.kind = opt.value"
        >
          {{ opt.label }}
        </button>
      </div>
    </BaseField>

    <BaseField label="Descrição" required style="margin-bottom: 14px">
      <BaseInput
        v-model="form.description"
        :placeholder="form.kind === 'income' ? 'Ex.: Cliente X, Salário…' : 'Ex.: Aluguel, Fornecedor X…'"
      />
    </BaseField>

    <BaseFieldRow :cols="2" style="margin-bottom: 14px">
      <BaseField label="Valor (R$)" required>
        <BaseInput
          v-model="form.amountInput"
          inputmode="decimal"
          placeholder="1.234,56"
        />
      </BaseField>
      <BaseField label="Vencimento" required>
        <BaseInput v-model="form.dueDate" type="date" />
      </BaseField>
    </BaseFieldRow>

    <BaseField
      label="Recorrência"
      :hint="form.recurrence !== 'none' ? 'Após marcar como pago, a próxima parcela é criada automaticamente.' : undefined"
      style="margin-bottom: 14px"
    >
      <BaseSelect v-model="form.recurrence" :options="recurrenceOptions" />
    </BaseField>

    <BaseField label="Empresa" hint="Opcional" style="margin-bottom: 14px">
      <CompanyAutocomplete v-model="form.companyId" placeholder="Buscar ou criar empresa…" />
    </BaseField>

    <BaseField label="Notas">
      <BaseTextarea
        v-model="form.notes"
        :rows="3"
        placeholder="PIX, banco, contexto…"
      />
    </BaseField>

    <div v-if="pagamento" class="anexos-wrap">
      <BaseField label="Anexos">
        <AnexosList entity="payment" :entity-id="pagamento.id" />
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

.kind-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.kind-btn {
  padding: 10px 12px;
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-text-2);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.kind-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text);
}
.kind-btn.is-expense.active {
  background: var(--ceo-soft);
  border-color: var(--color-danger);
  color: var(--color-danger);
}
.kind-btn.is-income.active {
  background: rgba(34, 197, 94, 0.08);
  border-color: var(--color-success);
  color: var(--color-success);
}
</style>

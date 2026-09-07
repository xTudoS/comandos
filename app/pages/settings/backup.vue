<script setup lang="ts">
const { exporting, importing, error, exportAll, importFromFile } = useBackup()
const importResult = ref<Record<string, number> | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

async function onExport() {
  try {
    await exportAll()
  } catch {
    // error is already set in the composable; nothing else to do here.
  }
}

function onImportClick() {
  fileInput.value?.click()
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  importResult.value = null
  if (!confirm('Importar adiciona todos os itens ao seu tenant (não substitui). Continuar?')) {
    return
  }
  const res = await importFromFile(file)
  if (res) importResult.value = res.imported
}
</script>

<template>
  <div class="wrap">
    <header>
      <h1>Backup</h1>
      <p>Exportar e importar tudo do seu tenant em JSON.</p>
    </header>

    <section class="card">
      <div class="card-head">
        <div>
          <div class="title">Exportar</div>
          <div class="desc">Baixa um JSON com pessoas, projetos, notas, pagamentos, tarefas, checklists, anotações e metadados de anexos.</div>
        </div>
        <button class="btn primary" type="button" :disabled="exporting" @click="onExport">
          {{ exporting ? 'Baixando…' : 'Baixar JSON' }}
        </button>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <div>
          <div class="title">Importar</div>
          <div class="desc">
            Aditivo — os itens são inseridos com novos IDs. Não sobrescreve nada do que você já tem.
            Blobs de anexos não são copiados; só os metadados.
          </div>
        </div>
        <button class="btn ghost" type="button" :disabled="importing" @click="onImportClick">
          {{ importing ? 'Importando…' : 'Escolher arquivo' }}
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          hidden
          @change="onFileChange"
        >
      </div>
      <div v-if="importResult" class="result">
        <div class="result-title">Importação concluída</div>
        <ul class="result-list">
          <li v-for="(count, kind) in importResult" :key="kind">
            {{ count }} {{ kind }}
          </li>
        </ul>
      </div>
    </section>

    <div v-if="error" class="error">{{ error }}</div>
  </div>
</template>

<style scoped>
.wrap {
  padding: 20px 24px 40px;
  max-width: 720px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
header h1 {
  font-size: 18px;
  font-weight: 600;
}
header p {
  font-size: 12px;
  color: var(--text-3);
  margin-top: 2px;
}
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.card-head {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  justify-content: space-between;
}
.title {
  font-size: 13px;
  font-weight: 600;
}
.desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-3);
  max-width: 440px;
  line-height: 1.5;
}
.result {
  padding: 10px 12px;
  background: var(--surface-alt);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.result-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 6px;
}
.result-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 12px;
  color: var(--text-2);
}
.result-list li {
  background: var(--surface);
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
}
.error {
  padding: 10px 12px;
  background: var(--ceo-soft);
  border: 1px solid var(--ceo-border);
  border-radius: var(--radius-sm);
  color: var(--ceo-fg);
  font-size: 12px;
}
</style>

<script setup lang="ts">
import type { Attachment, AttachmentEntity } from '~/composables/useAttachments'

const props = defineProps<{
  entity: AttachmentEntity
  entityId: string
}>()

const { list, upload, download, remove } = useAttachments()

const attachments = ref<Attachment[]>([])
const loading = ref(false)
const uploading = ref(false)
const error = ref<string | null>(null)
const dragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

async function refresh() {
  loading.value = true
  error.value = null
  try {
    attachments.value = await list(props.entity, props.entityId)
  } catch (e) {
    error.value = (e as { message?: string })?.message ?? 'Falha ao carregar anexos.'
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
watch(() => props.entityId, refresh)

async function handleFiles(files: FileList | File[]) {
  error.value = null
  uploading.value = true
  try {
    for (const file of Array.from(files)) {
      await upload({ entity: props.entity, entityId: props.entityId, file })
    }
    await refresh()
  } catch (e) {
    error.value = (e as { message?: string })?.message ?? 'Falha no upload.'
  } finally {
    uploading.value = false
  }
}

function onPickClick() {
  fileInput.value?.click()
}
function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    handleFiles(input.files)
    input.value = ''
  }
}
function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    handleFiles(e.dataTransfer.files)
  }
}
function onDragOver(e: DragEvent) {
  e.preventDefault()
  dragOver.value = true
}
function onDragLeave() {
  dragOver.value = false
}

async function onDownload(a: Attachment) {
  try {
    const url = await download(a.id)
    window.open(url, '_blank', 'noopener')
  } catch (e) {
    error.value = (e as { message?: string })?.message ?? 'Falha ao baixar.'
  }
}

async function onDelete(a: Attachment) {
  if (!confirm(`Remover "${a.originalFilename}"?`)) return
  try {
    await remove(a.id)
    await refresh()
  } catch (e) {
    error.value = (e as { message?: string })?.message ?? 'Falha ao remover.'
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
function isImage(a: Attachment): boolean {
  return a.mimeType.startsWith('image/')
}
const imagePreviews = ref<Record<string, string>>({})
async function ensurePreview(a: Attachment) {
  if (!isImage(a) || imagePreviews.value[a.id]) return
  try {
    imagePreviews.value[a.id] = await download(a.id)
  } catch {
    // Silent — preview is best-effort.
  }
}
watch(attachments, (rows) => {
  for (const a of rows) ensurePreview(a)
}, { immediate: true })
</script>

<template>
  <div class="anexos">
    <div
      class="dropzone"
      :class="{ over: dragOver, uploading }"
      @click="onPickClick"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <input
        ref="fileInput"
        type="file"
        multiple
        hidden
        @change="onFileChange"
      >
      <div v-if="uploading" class="dz-text">Enviando…</div>
      <div v-else class="dz-text">
        <BaseIcon class="dz-icon" name="upload" :size="22" aria-hidden="true" />
        <div>Arraste arquivos aqui ou clique para selecionar</div>
        <div class="dz-hint">Até 25 MB por arquivo</div>
      </div>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="loading && attachments.length === 0" class="muted">Carregando…</div>
    <ul v-else-if="attachments.length > 0" class="list">
      <li v-for="a in attachments" :key="a.id" class="item">
        <div class="thumb">
          <img v-if="imagePreviews[a.id]" :src="imagePreviews[a.id]" alt="">
          <BaseIcon
            v-else
            class="file-icon"
            :name="a.mimeType.includes('pdf') ? 'file-text' : 'paperclip'"
            :size="20"
          />
        </div>
        <div class="meta">
          <div class="filename">{{ a.originalFilename }}</div>
          <div class="submeta">{{ formatSize(a.sizeBytes) }} · {{ a.mimeType }}</div>
        </div>
        <div class="actions">
          <button
            class="row-action"
            type="button"
            aria-label="Baixar"
            title="Baixar"
            @click="onDownload(a)"
          >
            <BaseIcon name="download" />
          </button>
          <button
            class="row-action"
            type="button"
            aria-label="Remover"
            title="Remover"
            @click="onDelete(a)"
          >
            <BaseIcon name="trash-2" />
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.anexos {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.dropzone {
  border: 2px dashed var(--border);
  border-radius: var(--radius-sm);
  padding: 24px;
  text-align: center;
  cursor: pointer;
  background: var(--surface-alt);
  transition: border-color 0.12s, background 0.12s;
}
.dropzone:hover,
.dropzone.over {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.dropzone.uploading {
  opacity: 0.7;
  pointer-events: none;
}
.dz-icon {
  /* reset.css força `svg { display: block }`, então centraliza com margin auto
     em vez de depender do text-align do container. */
  margin: 0 auto 6px;
  color: var(--text-3);
}
.dz-text {
  font-size: 13px;
  color: var(--text-2);
}
.dz-hint {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-4);
}
.error {
  padding: 8px 10px;
  background: var(--ceo-soft);
  border: 1px solid var(--ceo-border);
  border-radius: var(--radius-sm);
  color: var(--ceo-fg);
  font-size: 12px;
}
.muted {
  color: var(--text-3);
  font-size: 12px;
  padding: 6px;
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.thumb {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-alt);
  border-radius: var(--radius-sm);
  overflow: hidden;
  flex-shrink: 0;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.file-icon {
  color: var(--text-3);
}
.meta {
  flex: 1;
  min-width: 0;
}
.filename {
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.submeta {
  margin-top: 2px;
  font-size: 11px;
  color: var(--text-3);
}
.actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.row-action {
  width: 26px;
  height: 26px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  border-radius: 6px;
  font-size: 13px;
}
.row-action:hover {
  background: var(--surface-hover);
  color: var(--text);
}
</style>

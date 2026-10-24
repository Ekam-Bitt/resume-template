<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">Resume</div>
      <select v-if="hasFileApi" :value="state.current" class="input select" aria-label="Resume" @change="onSwitch">
        <option v-for="n in state.names" :key="n" :value="n">{{ n === 'base' ? 'base (master)' : n === 'sample' ? 'sample (John Doe)' : n }}</option>
      </select>
      <button v-if="hasFileApi" class="text-btn" title="Copy the current resume to a new variant" @click="onNewVariant">+ Variant</button>
      <span class="status" :class="state.status">{{ statusLabel }}</span>
      <span class="spacer" />
      <button v-if="report" class="badge" :class="report.ok ? 'good' : 'bad'" title="Show layout checks" @click="showLint = !showLint">
        {{ report.pages }}/{{ report.maxPages }} page{{ report.maxPages > 1 ? 's' : '' }}
        <template v-if="report.ok"> · {{ report.freeLines }} free line{{ report.freeLines === 1 ? '' : 's' }}</template>
        <template v-if="warnings"> · {{ warnings }} warning{{ warnings === 1 ? '' : 's' }}</template>
      </button>
      <button class="text-btn" @click="importJson">Import</button>
      <button class="text-btn" @click="exportJson">Export JSON</button>
      <button v-if="!hasFileApi" class="text-btn" @click="onReset">Reset</button>
      <button class="primary-btn" :disabled="!resume || downloading" @click="downloadPdf">
        {{ downloading ? 'Preparing…' : 'Download PDF' }}
      </button>
    </header>

    <div v-if="showLint && (report?.issues.length || state.issues.length)" class="lint">
      <div v-for="(i, n) in state.issues" :key="'v' + n" class="lint-row error">
        <span class="tag">invalid</span><code>{{ i.path }}</code> {{ i.message }}
      </div>
      <button v-for="(i, n) in report?.issues ?? []" :key="n" class="lint-row" :class="i.level" @click="focusPath(i.path)">
        <span class="tag">{{ i.level }}</span><code>{{ i.path || '/' }}</code> {{ i.message }}
      </button>
    </div>

    <main v-if="resume" class="split">
      <div class="left">
        <nav class="tabs">
          <button :class="{ active: tab === 'form' }" @click="tab = 'form'">Form</button>
          <button :class="{ active: tab === 'json' }" @click="tab = 'json'">JSON</button>
        </nav>
        <div class="left-scroll">
          <Editor v-if="tab === 'form'" :key="`${state.current}:${state.revision}`" :resume="resume" />
          <JsonEditor v-else :key="`${state.current}:${state.revision}:json`" :resume="resume" />
        </div>
      </div>
      <PreviewPane class="right" :svg="preview.svg" :size="preview.size" :page-sizes="preview.pageSizes" :error="previewError" />
    </main>
    <div v-else class="loading">{{ state.status === 'error' ? state.error : 'Loading…' }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, shallowRef, watch } from 'vue'
import { lint, type LintReport } from '../../src/core/lint.ts'
import { validate, type Resume } from '../../src/core/schema.ts'
import Editor from './components/Editor.vue'
import JsonEditor from './components/JsonEditor.vue'
import PreviewPane from './components/PreviewPane.vue'
import { clean, createVariant, hasFileApi, load, replaceResume, resetToBundled, resume, state } from './store.ts'
import { renderPdf, renderPreview } from './typst.ts'

const tab = ref<'form' | 'json'>('form')
const showLint = ref(false)
const downloading = ref(false)
const preview = reactive({ svg: '', size: { width: 595.28, height: 841.89 }, pageSizes: [] as { width: number; height: number }[] })
const previewError = ref('')
const report = shallowRef<LintReport | null>(null)
const warnings = computed(() => report.value?.issues.filter(i => i.level === 'warn').length ?? 0)

const statusLabel = computed(() => ({
  loading: 'Loading…',
  saved: hasFileApi ? `Saved to data/${['base', 'sample'].includes(state.current) ? state.current : `variants/${state.current}`}.json` : 'Saved in this browser',
  saving: 'Saving…',
  unsaved: 'Editing…',
  invalid: `Not saved: ${state.issues.length} validation issue${state.issues.length === 1 ? '' : 's'}`,
  error: `Error: ${state.error}`,
})[state.status])

load(new URLSearchParams(location.search).get('r') ?? 'base')

// Re-render the preview as the resume changes. Invalid data keeps the last good preview.
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0
watch(resume, () => {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    if (!resume.value) return
    const data = clean(resume.value)
    const v = validate(data)
    if (!v.ok) return
    const mine = ++seq
    try {
      const p = await renderPreview(v.resume)
      if (mine !== seq) return
      Object.assign(preview, { svg: p.svg, size: p.size, pageSizes: p.pageSizes })
      report.value = lint(v.resume, p.page, p.probes)
      if (!report.value.ok) showLint.value = true
      previewError.value = ''
    } catch (e) {
      if (mine === seq) previewError.value = (e as Error).message
    }
  }, 250)
}, { deep: true, immediate: true })

function onSwitch(e: Event) {
  const name = (e.target as HTMLSelectElement).value
  history.replaceState(null, '', name === 'base' ? location.pathname : `?r=${encodeURIComponent(name)}`)
  load(name)
}

async function onNewVariant() {
  const slug = prompt('Name for the new variant (lowercase-dashes), e.g. acme-backend')?.trim()
  if (!slug) return
  try {
    await createVariant(slug)
  } catch (e) {
    alert((e as Error).message)
  }
}

function onReset() {
  if (confirm('Discard your changes and go back to the John Doe sample?')) resetToBundled()
}

function saveFile(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const fileBase = () => {
  const name = (resume.value?.basics.name ?? 'Resume').replace(/\s+/g, '_')
  return state.current === 'base' ? `${name}_Resume` : `${name}_Resume_${state.current}`
}

async function downloadPdf() {
  if (!resume.value) return
  const v = validate(clean(resume.value))
  if (!v.ok) return alert('Fix the validation issues first.')
  downloading.value = true
  try {
    saveFile(`${fileBase()}.pdf`, (await renderPdf(v.resume)) as BlobPart, 'application/pdf')
  } finally {
    downloading.value = false
  }
}

function exportJson() {
  if (resume.value) saveFile(`${fileBase()}.json`, JSON.stringify(clean(resume.value), null, 2) + '\n', 'application/json')
}

function importJson() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json,.json' })
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const data = JSON.parse(await file.text()) as Resume
      const v = validate(data)
      if (!v.ok && !confirm(`This file has ${v.issues.length} validation issue(s). Import anyway?`)) return
      replaceResume(data)
    } catch (e) {
      alert(`Could not read ${file.name}: ${(e as Error).message}`)
    }
  }
  input.click()
}

/** Jumps from a lint row to the field it refers to. */
async function focusPath(path: string) {
  tab.value = 'form'
  await nextTick()
  const el = document.querySelector<HTMLElement>(`[data-path="${path}"]`)
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.focus()
}
</script>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  flex-wrap: wrap;
}
.brand {
  font-weight: 700;
  margin-right: 6px;
}
.select {
  width: auto;
  padding: 4px 8px;
}
.status {
  font-size: 12px;
  color: var(--muted);
}
.status.invalid,
.status.error {
  color: var(--danger);
}
.spacer {
  flex: 1;
}
.badge {
  font-size: 12px;
  border-radius: 999px;
  padding: 4px 10px;
  border: 1px solid transparent;
  cursor: pointer;
  font-weight: 600;
}
.badge.good {
  background: var(--good-bg);
  color: var(--good);
}
.badge.bad {
  background: var(--danger-bg);
  color: var(--danger);
}
.lint {
  max-height: 140px;
  overflow: auto;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  font-size: 12px;
}
.lint-row {
  display: block;
  width: 100%;
  text-align: left;
  padding: 4px 14px;
  background: none;
  border: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
}
.lint-row:hover {
  background: var(--surface);
}
.lint-row code {
  margin: 0 6px;
  color: var(--muted);
}
.tag {
  display: inline-block;
  min-width: 44px;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 10px;
}
.lint-row.error .tag {
  color: var(--danger);
}
.lint-row.warn .tag {
  color: var(--warn);
}
.split {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(380px, 560px) 1fr;
}
.left {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--border);
  background: var(--bg);
}
.tabs {
  display: flex;
  gap: 4px;
  padding: 8px 16px 0;
  border-bottom: 1px solid var(--border);
}
.tabs button {
  background: none;
  border: 0;
  border-bottom: 2px solid transparent;
  padding: 6px 10px;
  cursor: pointer;
  color: var(--muted);
  font: inherit;
}
.tabs button.active {
  color: var(--text);
  border-bottom-color: var(--accent);
}
.left-scroll {
  flex: 1;
  overflow: auto;
}
.right {
  min-height: 0;
}
.loading {
  padding: 48px;
  text-align: center;
  color: var(--muted);
}
@media (max-width: 900px) {
  .app {
    height: auto;
  }
  .split {
    grid-template-columns: 1fr;
  }
  .right {
    height: 80vh;
  }
}
</style>

<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">Resume</div>
      <select v-if="hasFileApi" :value="state.current" class="input select" aria-label="Resume" @change="onSwitch">
        <option v-for="{ name } in state.names" :key="name" :value="name">{{ LABELS[name] ?? name }}</option>
      </select>
      <button v-if="hasFileApi" class="text-btn" title="Copy the current resume to a new variant" @click="onNewVariant">+ Variant</button>
      <span class="status" :class="state.status">{{ statusLabel }}</span>
      <template v-if="state.status === 'conflict'">
        <button class="text-btn" title="Discard your unsaved edits and load what is on disk" @click="resolveConflict('disk')">Load disk version</button>
        <button class="text-btn" title="Overwrite the file on disk with what is in the editor" @click="resolveConflict('mine')">Keep mine</button>
      </template>
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

    <div v-if="showLint && (report?.issues.length || issues.length)" class="lint">
      <div v-for="(i, n) in issues" :key="'v' + n" class="lint-row error">
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
      <PreviewPane class="right" :svg="preview.svg" :page-sizes="preview.pageSizes" :error="previewError" />
    </main>
    <div v-else class="loading">{{ state.status === 'error' ? state.error : 'Loading…' }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, shallowRef, watch } from 'vue'
import { lint, type LintReport } from '../../src/core/lint.ts'
import { validate } from '../../src/core/schema.ts'
import Editor from './components/Editor.vue'
import JsonEditor from './components/JsonEditor.vue'
import PreviewPane from './components/PreviewPane.vue'
import {
  checked, createVariant, hasFileApi, issues, load, replaceResume, resetToBundled, resolveConflict, resume, serialize, state,
} from './store.ts'
import { renderPdf, renderPreview, warmUp } from './typst.ts'

const LABELS: Record<string, string> = { base: 'base (master)', sample: 'sample (John Doe)' }

const tab = ref<'form' | 'json'>('form')
const showLint = ref(false)
const downloading = ref(false)
const preview = reactive({ svg: '', pageSizes: [] as { width: number; height: number }[] })
const previewError = ref('')
const report = shallowRef<LintReport | null>(null)
const warnings = computed(() => report.value?.issues.filter(i => i.level === 'warn').length ?? 0)

const statusLabel = computed(() => ({
  loading: 'Loading…',
  saved: hasFileApi ? `Saved to ${state.names.find(n => n.name === state.current)?.file ?? state.current}` : 'Saved in this browser',
  saving: 'Saving…',
  unsaved: 'Editing…',
  invalid: `Not saved: ${issues.value.length} validation issue${issues.value.length === 1 ? '' : 's'}`,
  conflict: 'Changed on disk (by an agent or the CLI) while you were editing',
  error: `Error: ${state.error}`,
})[state.status])

// The compiler download overlaps with loading the resume.
warmUp().catch(e => (previewError.value = (e as Error).message))
load(new URLSearchParams(location.search).get('r') ?? 'base')

// Re-render the preview when the saved form of the resume changes (edits that
// clean away, like a blank bullet, don't recompile). Invalid data keeps the
// last good preview. The first render runs immediately, later ones debounce.
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0
let rendered = ''
watch(checked, c => {
  if (!c?.ok || c.json === rendered) return
  clearTimeout(timer)
  timer = setTimeout(async () => {
    const mine = ++seq
    rendered = c.json
    try {
      const p = await renderPreview(c.json)
      if (mine !== seq) return
      Object.assign(preview, { svg: p.svg, pageSizes: p.pageSizes })
      report.value = lint(c.resume, p.page, p.probes)
      if (!report.value.ok) showLint.value = true
      previewError.value = ''
    } catch (e) {
      if (mine === seq) previewError.value = (e as Error).message
    }
  }, preview.svg ? 250 : 0)
}, { immediate: true })

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
  const c = checked.value
  if (!c?.ok) return alert('Fix the validation issues first.')
  downloading.value = true
  try {
    saveFile(`${fileBase()}.pdf`, (await renderPdf(c.json)) as BlobPart, 'application/pdf')
  } catch (e) {
    alert(`Could not create the PDF: ${(e as Error).message}`)
  } finally {
    downloading.value = false
  }
}

function exportJson() {
  if (resume.value) saveFile(`${fileBase()}.json`, serialize(resume.value), 'application/json')
}

function importJson() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json,.json' })
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const v = validate(JSON.parse(await file.text()))
      if (!v.ok) {
        const list = v.issues.slice(0, 8).map(i => `${i.path}: ${i.message}`).join('\n')
        return alert(`${file.name} is not a valid resume:\n${list}`)
      }
      replaceResume(v.resume)
    } catch (e) {
      alert(`Could not read ${file.name}: ${(e as Error).message}`)
    }
  }
  input.click()
}

/** Jumps from a lint row to the field it refers to; cards and entries on the path open for it. */
async function focusPath(path: string) {
  tab.value = 'form'
  state.focus = path
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

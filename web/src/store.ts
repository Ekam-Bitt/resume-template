// Editor state. In dev (`npm run dev`) resumes live in data/*.json through the
// Vite file API, shared with agents. In a static deploy they live in
// localStorage, seeded from the bundled John Doe sample (data/sample.json).
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { formatJson } from '../../src/core/json.ts'
import { validate, type Resume } from '../../src/core/schema.ts'

export const hasFileApi = import.meta.env.DEV

type Status = 'loading' | 'saved' | 'saving' | 'unsaved' | 'invalid' | 'conflict' | 'error'

export const state = reactive({
  names: [] as { name: string; file: string }[],
  current: 'base',
  status: 'loading' as Status,
  error: '',
  /** Bumped when the resume is replaced from outside (disk, import), so forms can reset. */
  revision: 0,
  /** JSON Pointer the editor reveals and focuses (set by clicking a lint row). */
  focus: '',
})
export const resume = ref<Resume | null>(null)

/** Drops what the form leaves behind ("", [], {}, hidden: false), so the data stays tidy. */
export function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      const c = clean(v)
      const empty = c === '' || c === undefined || (Array.isArray(c) && !c.length)
        || (c && typeof c === 'object' && !Array.isArray(c) && !Object.keys(c).length)
      if (empty || (k === 'hidden' && c === false)) continue
      out[k] = c
    }
    return out as T
  }
  return value
}

/** The resume as it would be saved: cleaned, schema-ordered when valid, in the shared file format. */
export function serialize(data: unknown) {
  const v = validate(clean(data))
  return formatJson(v.ok ? v.resume : clean(data))
}

/**
 * The current resume, cleaned and validated once per change. Save, the
 * preview, the PDF download and the issue list all read this.
 */
export const checked = computed(() => {
  if (!resume.value) return null
  const v = validate(clean(resume.value))
  return v.ok ? { ok: true as const, resume: v.resume, json: formatJson(v.resume) } : { ok: false as const, issues: v.issues }
})
export const issues = computed(() => (checked.value && !checked.value.ok ? checked.value.issues : []))

// What the open resume looked like when last loaded or saved, and the file
// version (ETag) it came from. Replaced as a whole on load, so a save that
// finishes after switching resumes can't touch the new one.
type Sync = { name: string; etag: string; text: string }
const sync = shallowRef<Sync>({ name: '', etag: '', text: '' })
const dirty = computed(() => !checked.value?.ok || checked.value.json !== sync.value.text)

const storageKey = (name: string) => `resume:${name}`
const resumePath = (name: string) => `resume/${encodeURIComponent(name)}`

// Only the static build needs the bundled sample; importing it in dev would make
// every save of data/sample.json hot-reload this module.
const bundledSample = async () => (await import('../../data/sample.json')).default as Resume

function setResume(name: string, data: Resume, etag = '') {
  sync.value = { name, etag, text: serialize(data) }
  resume.value = structuredClone(data)
  state.revision++
}

async function api<T>(path: string, init?: RequestInit): Promise<{ body: T; etag: string }> {
  const res = await fetch(`/api/${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const body = await res.json()
  if (!res.ok) throw Object.assign(new Error(body.error ?? res.statusText), { status: res.status, body })
  return { body, etag: res.headers.get('ETag') ?? '' }
}

async function fetchFromDisk(name: string) {
  const r = await api<Resume>(resumePath(name))
  setResume(name, r.body, r.etag)
}

export async function load(name = state.current) {
  await flush()
  state.status = 'loading'
  state.current = name
  state.focus = ''
  try {
    if (hasFileApi) {
      const [names] = await Promise.all([api<typeof state.names>('resumes'), fetchFromDisk(name)])
      state.names = names.body
    } else {
      state.names = [{ name: 'base', file: '' }]
      let stored: Resume | null = null
      try {
        stored = JSON.parse(localStorage.getItem(storageKey(name)) ?? 'null')
      } catch {}
      setResume(name, stored ?? (await bundledSample()))
    }
    state.status = 'saved'
  } catch (e) {
    state.status = 'error'
    state.error = (e as Error).message
  }
}

let inFlight: Promise<void> | null = null

async function save({ force = false } = {}) {
  const c = checked.value
  const target = sync.value
  if (!c || state.status === 'loading' || (state.status === 'conflict' && !force)) return
  if (!c.ok) {
    state.status = 'invalid'
    return
  }
  if (c.json === target.text && !force) {
    state.status = 'saved'
    return
  }
  state.status = 'saving'
  inFlight = (async () => {
    try {
      let etag = target.etag
      if (hasFileApi) {
        const headers: Record<string, string> = force ? {} : { 'If-Match': target.etag }
        etag = (await api(resumePath(target.name), { method: 'PUT', body: c.json, headers })).etag
      } else {
        localStorage.setItem(storageKey(target.name), c.json)
      }
      if (sync.value !== target) return // switched to another resume meanwhile
      sync.value = { ...target, etag, text: c.json }
      state.status = dirty.value ? 'unsaved' : 'saved'
    } catch (e) {
      if (sync.value !== target) return
      if ((e as { status?: number }).status === 409) state.status = 'conflict'
      else {
        state.status = 'error'
        state.error = (e as Error).message
      }
    }
  })()
  await inFlight
  inFlight = null
}

let timer: ReturnType<typeof setTimeout> | undefined

/** Runs any pending autosave and waits for one in flight, so the next step sees the saved state. */
async function flush() {
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
    await save()
  }
  await inFlight
}

watch(checked, () => {
  if (!dirty.value || state.status === 'loading' || state.status === 'conflict') return
  state.status = checked.value?.ok ? 'unsaved' : 'invalid'
  clearTimeout(timer)
  timer = setTimeout(() => {
    timer = undefined
    save()
  }, 600)
})

/** Resolves a save conflict: keep the editor's version or take the one on disk. */
export async function resolveConflict(keep: 'mine' | 'disk') {
  if (keep === 'mine') return save({ force: true })
  state.status = 'loading'
  await fetchFromDisk(state.current)
  state.status = 'saved'
}

/** Applies JSON typed in the JSON tab, without remounting the editor that produced it. */
export function setFromJson(data: Resume) {
  resume.value = data
}

/** Replaces the current resume (import, reset); autosave picks it up. */
export function replaceResume(data: Resume) {
  resume.value = structuredClone(data)
  state.revision++
}

export async function resetToBundled() {
  try {
    localStorage.removeItem(storageKey(state.current))
  } catch {}
  replaceResume(await bundledSample())
}

export async function createVariant(slug: string) {
  await flush()
  await api(resumePath(slug), { method: 'POST', body: JSON.stringify({ from: state.current }) })
  await load(slug)
}

// Changes written to disk by an agent or the CLI show up in the editor. Events
// carry the file's ETag, so the editor's own saves are recognised and skipped.
// While there are unsaved edits the change is left alone; the next save then
// gets a 409 and the user chooses which version to keep.
if (hasFileApi) {
  const events = new EventSource('/api/events')
  events.onmessage = async e => {
    try {
      const { name, etag } = JSON.parse(e.data)
      if (!state.names.some(n => n.name === name)) state.names = (await api<typeof state.names>('resumes')).body
      if (name !== state.current || etag === sync.value.etag || dirty.value || state.status !== 'saved') return
      await fetchFromDisk(name)
    } catch {
      // A deleted resume or a failed read: the next event or save sorts it out.
    }
  }
}

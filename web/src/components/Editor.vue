<template>
  <div class="editor">
    <SectionCard title="Header" start-open>
      <div class="grid">
        <label class="field full"><span>Name</span><input v-model="r.basics.name" class="input" /></label>
        <label class="field"><span>Email</span><input v-model="r.basics.email" class="input" type="email" /></label>
        <label class="field"><span>Phone</span><input v-model="r.basics.phone" class="input" /></label>
      </div>
      <div class="sub-label">Links</div>
      <VueDraggable v-model="r.basics.links!" handle=".handle" :animation="150" class="links">
        <div v-for="(l, i) in r.basics.links" :key="keyOf(l)" class="link-row" :class="{ hidden: l.hidden }">
          <span class="handle" aria-hidden="true">⠿</span>
          <input v-model="l.label" class="input label" placeholder="Label" />
          <input v-model="l.url" class="input" placeholder="https://…" />
          <button class="icon-btn" :title="l.hidden ? 'Show' : 'Hide'" @click="l.hidden = !l.hidden">{{ l.hidden ? '◌' : '●' }}</button>
          <button class="icon-btn" title="Remove" @click="r.basics.links!.splice(i, 1)">✕</button>
        </div>
      </VueDraggable>
      <button class="text-btn" @click="r.basics.links!.push({ label: '', url: '' })">+ Add link</button>
    </SectionCard>

    <SectionCard title="Section order & titles">
      <p class="hint">Drag to reorder sections on the page.</p>
      <VueDraggable v-model="r.meta!.sectionOrder!" :animation="150" class="order">
        <div v-for="key in r.meta!.sectionOrder" :key="key" class="order-row">
          <span class="handle" aria-hidden="true">⠿</span>
          <input v-if="isBuiltin(key)" v-model="titles[key]" class="input" :placeholder="DEFAULT_TITLES[key]" />
          <input v-else v-model="customByKey(key)!.title" class="input" />
          <span class="key">{{ key }}</span>
        </div>
      </VueDraggable>
    </SectionCard>

    <SectionCard title="Technical skills" :count="r.skills!.length">
      <EntryList v-model="r.skills!" noun="skill group" :make="() => ({ category: '', items: [] })"
        :title="s => s.category" :subtitle="s => s.items.join(', ')">
        <template #default="{ item, index }">
          <label class="field"><span>Category</span><input v-model="item.category" class="input" /></label>
          <label class="field">
            <span>Items <em>(comma-separated; commas inside parentheses are kept)</em></span>
            <AutoTextarea :model-value="item.items.join(', ')" :data-path="`/skills/${index}/items`"
              @update:model-value="v => (item.items = splitItems(v))" />
          </label>
        </template>
      </EntryList>
    </SectionCard>

    <SectionCard title="Work experience" :count="r.experience!.length" start-open>
      <EntryList v-model="r.experience!" noun="position" :make="() => ({ company: '', bullets: [] })"
        :title="e => e.company" :subtitle="e => [e.role, dates(e)].filter(Boolean).join(' · ')">
        <template #default="{ item, index }">
          <div class="grid">
            <label class="field full"><span>Company</span><input v-model="item.company" class="input" /></label>
            <label class="field"><span>Role</span><input v-model="item.role" class="input" /></label>
            <label class="field"><span>Location</span><input v-model="item.location" class="input" /></label>
            <label class="field"><span>Start</span><input v-model="item.start" class="input" placeholder="June 2025" /></label>
            <label class="field"><span>End</span><input v-model="item.end" class="input" placeholder="Present" /></label>
          </div>
          <div class="sub-label">Bullets</div>
          <BulletList :model-value="ensure(item, 'bullets')" @update:model-value="v => (item.bullets = v)" :path="`/experience/${index}/bullets`" />
        </template>
      </EntryList>
    </SectionCard>

    <SectionCard title="Education" :count="r.education!.length">
      <EntryList v-model="r.education!" noun="school" :make="() => ({ institution: '' })"
        :title="e => e.institution" :subtitle="e => [e.degree, dates(e)].filter(Boolean).join(' · ')">
        <template #default="{ item, index }">
          <div class="grid">
            <label class="field full"><span>Institution</span><input v-model="item.institution" class="input" /></label>
            <label class="field full"><span>Degree</span><input v-model="item.degree" class="input" /></label>
            <label class="field"><span>Start</span><input v-model="item.start" class="input" /></label>
            <label class="field"><span>End</span><input v-model="item.end" class="input" /></label>
            <label class="field full"><span>Location (optional)</span><input v-model="item.location" class="input" /></label>
          </div>
          <div class="sub-label">Details (optional)</div>
          <BulletList :model-value="ensure(item, 'details')" @update:model-value="v => (item.details = v)" :path="`/education/${index}/details`" label="Detail" />
        </template>
      </EntryList>
    </SectionCard>

    <SectionCard title="Projects" :count="r.projects!.length">
      <EntryList v-model="r.projects!" noun="project" :make="() => ({ name: '' })"
        :title="p => p.name" :subtitle="p => p.url ?? ''">
        <template #default="{ item, index }">
          <div class="grid">
            <label class="field"><span>Name</span><input v-model="item.name" class="input" /></label>
            <label class="field"><span>URL</span><input v-model="item.url" class="input" placeholder="https://…" /></label>
          </div>
          <label class="field">
            <span>Description</span>
            <AutoTextarea v-model="item.description" :data-path="`/projects/${index}/description`" />
          </label>
          <div class="sub-label">Bullets (optional)</div>
          <BulletList :model-value="ensure(item, 'bullets')" @update:model-value="v => (item.bullets = v)" :path="`/projects/${index}/bullets`" />
        </template>
      </EntryList>
    </SectionCard>

    <SectionCard title="Custom sections" :count="r.custom!.length">
      <p class="hint">Extra sections such as Achievements or Publications: a title plus bullets.</p>
      <EntryList v-model="r.custom!" noun="section" :make="makeCustom" :title="s => s.title" :subtitle="s => s.key">
        <template #default="{ item, index }">
          <label class="field"><span>Title</span><input v-model="item.title" class="input" /></label>
          <BulletList v-model="item.bullets" :path="`/custom/${index}/bullets`" />
        </template>
      </EntryList>
    </SectionCard>

    <SectionCard title="Design">
      <div class="grid">
        <label class="field"><span>Paper</span>
          <select v-model="r.meta!.paper" class="input"><option value="a4">A4</option><option value="us-letter">US Letter</option></select>
        </label>
        <label class="field"><span>Body size (pt)</span>
          <input v-model.number="r.meta!.fontSize" class="input" type="number" min="8" max="12" step="0.5" placeholder="10" />
        </label>
        <label class="field"><span>Max pages</span>
          <input v-model.number="r.meta!.maxPages" class="input" type="number" min="1" max="4" placeholder="1" />
        </label>
      </div>
      <div class="sub-label">Colors</div>
      <div class="colors">
        <label v-for="(def, key) in DEFAULT_COLORS" :key="key" class="color">
          <input type="color" :value="colors[key] ?? def" @input="e => (colors[key] = (e.target as HTMLInputElement).value.toUpperCase())" />
          <span>{{ key }}</span>
        </label>
      </div>
      <p class="hint">Spacing, margins and fonts can be tuned under <code>meta</code> in the JSON tab.</p>
    </SectionCard>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { Resume } from '../../../src/core/schema.ts'
import { keyOf } from '../keys.ts'
import AutoTextarea from './AutoTextarea.vue'
import BulletList from './BulletList.vue'
import EntryList from './EntryList.vue'
import SectionCard from './SectionCard.vue'

const props = defineProps<{ resume: Resume }>()
const r = props.resume

const DEFAULT_TITLES = { skills: 'Technical Skills', experience: 'Work Experience', education: 'Education', projects: 'Projects' }
const DEFAULT_COLORS = { name: '#1F1F1F', contact: '#1F497D', heading: '#2E74B5', entry: '#444444', text: '#000000', rule: '#000000' }
type Builtin = keyof typeof DEFAULT_TITLES

// The form needs every optional container to exist; empty ones are dropped again on save.
r.meta ??= {}
r.meta.sectionOrder ??= ['skills', 'experience', 'education', 'projects']
r.meta.sectionTitles ??= {}
r.meta.colors ??= {}
r.basics.links ??= []
r.skills ??= []
r.experience ??= []
r.education ??= []
r.projects ??= []
r.custom ??= []

const titles = computed(() => r.meta!.sectionTitles!)
const colors = computed(() => r.meta!.colors! as Record<string, string>)
const isBuiltin = (key: string): key is Builtin => key in DEFAULT_TITLES
const customByKey = (key: string) => r.custom!.find(s => s.key === key)

function ensure<T extends object, K extends keyof T>(item: T, key: K): NonNullable<T[K]> {
  return ((item[key] as unknown) ??= [] as unknown) as NonNullable<T[K]>
}

const dates = (e: { start?: string; end?: string; [key: string]: unknown }) => [e.start, e.end].filter(Boolean).join(' – ')

/** "a, b (c, d), e" → ["a", "b (c, d)", "e"] */
function splitItems(s: string) {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map(x => x.trim()).filter(Boolean)
}

function makeCustom() {
  const taken = new Set(r.custom!.map(s => s.key))
  let n = 1
  while (taken.has(`section-${n}`)) n++
  const key = `section-${n}`
  r.meta!.sectionOrder!.push(key)
  return { key, title: 'New Section', bullets: [] }
}
</script>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 10px;
  margin-bottom: 8px;
}
.full {
  grid-column: 1 / -1;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 6px;
}
.field em {
  font-style: normal;
  opacity: 0.8;
}
.sub-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  margin: 8px 0 6px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.links,
.order {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 6px;
}
.link-row,
.order-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.link-row.hidden {
  opacity: 0.5;
}
.link-row .label {
  width: 110px;
  flex: none;
}
.link-row .input:not(.label),
.order-row .input {
  flex: 1;
}
.handle {
  cursor: grab;
  color: var(--muted);
  user-select: none;
}
.key {
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: var(--muted);
  width: 80px;
}
.hint {
  font-size: 12px;
  color: var(--muted);
  margin: 0 0 8px;
}
.colors {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.color {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.color input {
  width: 28px;
  height: 24px;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0;
  background: none;
}
@media (max-width: 520px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>

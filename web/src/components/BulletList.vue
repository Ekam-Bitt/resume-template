<template>
  <div class="bullets">
    <VueDraggable v-model="model" handle=".handle" :animation="150" class="rows">
      <div v-for="(b, i) in model" :key="keyOf(b)" class="row" :class="{ hidden: b.hidden }">
        <span class="handle" title="Drag to reorder" aria-hidden="true">⠿</span>
        <AutoTextarea
          v-model="b.text"
          :data-path="`${path}/${i}/text`"
          :aria-label="`${label} ${i + 1}`"
          :placeholder="placeholder"
          @keydown.meta.b.prevent="bold($event)"
          @keydown.ctrl.b.prevent="bold($event)"
        />
        <div class="row-actions">
          <button class="icon-btn" title="Bold selection (⌘B)" @mousedown.prevent="boldFocused(i)"><b>B</b></button>
          <button class="icon-btn" :title="b.hidden ? 'Show on resume' : 'Hide from resume (keeps it in the file)'"
            @click="b.hidden = !b.hidden">{{ b.hidden ? '◌' : '●' }}</button>
          <button class="icon-btn" title="Remove" @click="remove(i)">✕</button>
        </div>
      </div>
    </VueDraggable>
    <button class="text-btn add" @click="add">+ Add {{ label.toLowerCase() }}</button>
  </div>
</template>

<script setup lang="ts">
import { nextTick } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { Bullet } from '../../../src/core/schema.ts'
import { keyOf } from '../keys.ts'
import AutoTextarea from './AutoTextarea.vue'

const model = defineModel<Bullet[]>({ required: true })
const props = withDefaults(defineProps<{ path: string; label?: string; placeholder?: string }>(), {
  label: 'Bullet',
  placeholder: 'Start with a verb. Wrap key terms in **double asterisks** for bold.',
})

/** Wraps the textarea selection in ** **, or unwraps it if already bold. */
function toggleBold(el: HTMLTextAreaElement, b: Bullet) {
  const { selectionStart: s, selectionEnd: e, value } = el
  if (s === e) return
  const sel = value.slice(s, e)
  const wrapped = value.slice(s - 2, s) === '**' && value.slice(e, e + 2) === '**'
  b.text = wrapped
    ? value.slice(0, s - 2) + sel + value.slice(e + 2)
    : value.slice(0, s) + `**${sel}**` + value.slice(e)
  const shift = wrapped ? -2 : 2
  nextTick(() => el.setSelectionRange(s + shift, e + shift))
}

function bold(ev: KeyboardEvent) {
  const el = ev.target as HTMLTextAreaElement
  const i = Number(el.dataset.path?.split('/').at(-2))
  toggleBold(el, model.value[i])
}

function boldFocused(i: number) {
  const el = document.querySelector<HTMLTextAreaElement>(`[data-path="${props.path}/${i}/text"]`)
  if (el) toggleBold(el, model.value[i])
}

async function add() {
  model.value.push({ text: '' })
  await nextTick()
  document.querySelector<HTMLTextAreaElement>(`[data-path="${props.path}/${model.value.length - 1}/text"]`)?.focus()
}

function remove(i: number) {
  model.value.splice(i, 1)
}
</script>

<style scoped>
.rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}
.row.hidden :deep(textarea) {
  opacity: 0.45;
  text-decoration: line-through;
}
.handle {
  cursor: grab;
  color: var(--muted);
  padding: 7px 2px 0;
  user-select: none;
}
.row-actions {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.add {
  margin-top: 6px;
}
</style>

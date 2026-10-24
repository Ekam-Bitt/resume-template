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
          @keydown.meta.b.prevent="toggleBold($event.target as HTMLTextAreaElement, b)"
          @keydown.ctrl.b.prevent="toggleBold($event.target as HTMLTextAreaElement, b)"
        />
        <div class="row-actions">
          <button class="icon-btn" title="Bold selection (⌘B)" @mousedown.prevent="toggleBold(field(i), b)"><b>B</b></button>
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
function toggleBold(el: HTMLTextAreaElement | null, b: Bullet) {
  if (!el) return
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

const field = (i: number) => document.querySelector<HTMLTextAreaElement>(`[data-path="${props.path}/${i}/text"]`)

async function add() {
  model.value.push({ text: '' })
  await nextTick()
  field(model.value.length - 1)?.focus()
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

<template>
  <div class="json-editor">
    <p class="hint">
      The same document agents edit. Must match <code>schema/resume.schema.json</code>; changes apply only while it is valid.
    </p>
    <textarea v-model="text" class="input code" spellcheck="false" @input="apply" />
    <p v-if="parseError" class="error">{{ parseError }}</p>
    <p v-for="(i, n) in issues" :key="n" class="error"><code>{{ i.path }}</code> {{ i.message }}</p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { validate, type Resume, type ValidationIssue } from '../../../src/core/schema.ts'
import { serialize, setFromJson } from '../store.ts'

const props = defineProps<{ resume: Resume }>()
const text = ref(serialize(props.resume))
const parseError = ref('')
const issues = ref<ValidationIssue[]>([])

// Only schema-valid JSON reaches the editor, so the form never sees a broken document.
function apply() {
  let data: unknown
  try {
    data = JSON.parse(text.value)
    parseError.value = ''
  } catch (e) {
    parseError.value = (e as Error).message
    return
  }
  const v = validate(data)
  issues.value = v.ok ? [] : v.issues
  if (v.ok) setFromJson(v.resume)
}
</script>

<style scoped>
.json-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  gap: 8px;
}
.code {
  flex: 1;
  min-height: 400px;
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre;
  resize: none;
}
.hint {
  font-size: 12px;
  color: var(--muted);
  margin: 0;
}
.error {
  color: var(--danger);
  font-size: 12px;
  margin: 0;
}
</style>

<template>
  <div ref="pane" class="preview-pane">
    <div class="preview-scroll">
      <div class="preview-pages" :style="{ width: `${size.width * PX_PER_PT * scale}px` }">
        <div v-if="error" class="preview-error">{{ error }}</div>
        <div v-else-if="!svg" class="preview-loading">Preparing preview…</div>
        <div
          v-else
          class="pages"
          :style="{ width: `${size.width * PX_PER_PT}px`, transform: `scale(${scale})`, height: `${size.height * PX_PER_PT}px` }"
          v-html="svg"
        />
        <!-- Page breaks: the stacked SVG has no gaps of its own -->
        <template v-if="svg && !error">
          <div v-for="y in breaks" :key="y" class="page-break" :style="{ top: `${y * PX_PER_PT * scale}px` }" />
        </template>
      </div>
    </div>

    <div class="preview-toolbar" role="toolbar" aria-label="Preview">
      <button class="icon-btn" aria-label="Zoom out" :disabled="scale <= MIN_ZOOM" @click="zoomBy(-ZOOM_STEP)">−</button>
      <span class="zoom-value">{{ Math.round(scale * 100) }}%</span>
      <button class="icon-btn" aria-label="Zoom in" :disabled="scale >= MAX_ZOOM" @click="zoomBy(ZOOM_STEP)">+</button>
      <span class="divider" />
      <button class="text-btn" :class="{ active: fit }" @click="fit = true">Fit</button>
    </div>
  </div>
</template>

<script setup lang="ts">
// Adapted from gianfrancodemarco/resume-builder (MIT), PreviewPane.vue.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  svg: string
  size: { width: number; height: number }
  pageSizes: { width: number; height: number }[]
  error: string
}>()

const PX_PER_PT = 96 / 72
const GUTTER = 48
const MIN_ZOOM = 0.25
const MAX_ZOOM = 2
const ZOOM_STEP = 0.1

const pane = ref<HTMLElement | null>(null)
const paneWidth = ref(800)
const fit = ref(true)
const manualZoom = ref(1)

let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(([entry]) => (paneWidth.value = entry.contentRect.width))
  if (pane.value) observer.observe(pane.value)
})
onBeforeUnmount(() => observer?.disconnect())

const fitZoom = computed(() => {
  const width = (props.size.width || 595.28) * PX_PER_PT
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (paneWidth.value - GUTTER) / width))
})
const scale = computed(() => (fit.value ? fitZoom.value : manualZoom.value))

const breaks = computed(() => {
  let y = 0
  return props.pageSizes.slice(0, -1).map(p => (y += p.height))
})

function zoomBy(step: number) {
  manualZoom.value = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round((scale.value + step) * 10) / 10))
  fit.value = false
}
</script>

<style scoped>
.preview-pane {
  position: relative;
  height: 100%;
  min-width: 0;
  background: var(--preview-bg);
}
.preview-scroll {
  height: 100%;
  overflow: auto;
  padding: 24px 24px 88px;
}
.preview-pages {
  position: relative;
  margin: 0 auto;
}
.pages {
  transform-origin: top left;
  background: #fff;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.18);
}
.pages :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
}
.page-break {
  position: absolute;
  left: -12px;
  right: -12px;
  border-top: 2px dashed var(--danger);
}
.page-break::after {
  content: 'page break';
  position: absolute;
  right: 0;
  top: 2px;
  font-size: 11px;
  color: var(--danger);
}
.preview-loading,
.preview-error {
  padding: 48px 24px;
  text-align: center;
  color: var(--muted);
}
.preview-error {
  color: var(--danger);
  white-space: pre-wrap;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  text-align: left;
}
.preview-toolbar {
  position: absolute;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
  white-space: nowrap;
}
.zoom-value {
  min-width: 44px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  font-size: 0.85rem;
}
.divider {
  width: 1px;
  height: 18px;
  background: var(--border);
  margin: 0 6px;
}
</style>

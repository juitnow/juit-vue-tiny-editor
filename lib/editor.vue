<template>
  <div>
    <div
      id="editor"
      ref="editor"
      class="editor"
      :contenteditable="editable ? 'plaintext-only' : 'false'"
      @keydown="onKeydown"
      @paste="onPaste"
      @input="onInput"
    />
    <div style="position: absolute;">
      editable={{ editable }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'

import { getRangeOffsets } from './range'
import { sanitize } from './sanitize'
import { getSelectionRange, restoreSelection } from './selection'
import { isTagged, toggleTag } from './tags'

/* ==== DEFS ================================================================ */

defineOptions({ name: 'JuitTinyEdit' })

const model = defineModel({
  type: String,
  required: false,
  default: '',
})

const props = defineProps({
  /** A flag indicating if content can be edited (default: `true`) */
  editable: {
    type: Boolean,
    required: false,
    default: true,
  },
})

const emit = defineEmits<{
  isBold: [ boolean ],
  isItalic: [ boolean ],
  hasSelection: [ boolean ],
}>()

/* ==== REFS ================================================================ */

/** Reference to our content editable DIV */
const editor = ref<HTMLDivElement | null>(null)
/** Wrapper for our `editable` property */
const editable = computed(() => props.editable)

/* Check that the editor is properly referenced */
onMounted(() => {
  if (! editor.value) throw new Error('Editor not referenced')
})

/* ==== MODEL (HTML DATA) =================================================== */

/** The HTML string contained by the editor */
const html = ref('')

/** Commit changes to the model converting our editor into HTML */
function commit(): void {
  let string = editor.value?.innerHTML || ''
  if (string === '<br>') string = '' // all content was deleted
  html.value = string.trimEnd() // remove trailing whitespace
}

/* On changes to the _local_ HTML, trigger an emit on our model value */
watch(html, (html) => {
  model.value = html
})

/* Watch our model, when the value is different from the local HTML, parse */
watch([ model, editor ], ([ model, editor ]) => {
  if (! editor) return // not initialized yet, ignore!
  if (model === html.value) return // no changes, ignore!

  const body = new DOMParser().parseFromString(model, 'text/html').body
  sanitize(body)
  editor.replaceChildren(...body.childNodes)

  commit()
})

/* ==== DOM EVENTS ========================================================== */

/** Trigger shortcuts for applying bold, italic, ... */
function onKeydown(event: KeyboardEvent): void {
  if (event.metaKey || event.ctrlKey) {
    switch (event.key) {
      case 'b':
        applyTag('b')
        event.preventDefault()
        break
      case 'i':
        applyTag('i', { href: 'https://www.google.com/' })
        event.preventDefault()
        break
      case 'l':
        applyTag('a')
        event.preventDefault()
        break
    }
  }
}

function onPaste(event: ClipboardEvent): void {
  event.preventDefault()
  if (! editor.value) return
  if (! selected.value) return

  // Extract the pasted content as a document fragment
  const text = event.clipboardData?.getData('text/html') || ''
  const pasted = new DOMParser().parseFromString(text, 'text/html').body
  sanitize(pasted)

  // Remove ignorable whitespace nodes
  const iterator = document.createNodeIterator(pasted, NodeFilter.SHOW_TEXT)
  for (let node = iterator.nextNode(); node; node = iterator.nextNode()) {
    if (node.nodeValue?.trim() === '') node.parentElement?.removeChild(node)
  }

  // Save our selection offsets
  const offsets = getRangeOffsets(editor.value, selected.value)
  const beforeLength = editor.value.textContent?.length || 0

  // Split into ranges (before, selected, after)
  const range = new Range()
  range.selectNodeContents(editor.value)

  const before = new Range()
  before.setStart(range.startContainer, range.startOffset)
  before.setEnd(selected.value.startContainer, selected.value.startOffset)

  const after = new Range()
  after.setStart(selected.value.endContainer, selected.value.endOffset)
  after.setEnd(range.endContainer, range.endOffset)

  // Remove back to front...
  const afterFragment = after.extractContents()
  const beforeFragment = before.extractContents()
  range.deleteContents() // wipe everything, including selection

  // Create our fragment
  const fragment = document.createDocumentFragment()

  // Append our selected fragment, possibly wrapped in a tag
  fragment.append(pasted.cloneNode(true))

  // Surround with before and after fragments
  fragment.insertBefore(beforeFragment, fragment.firstChild)
  fragment.appendChild(afterFragment)

  // Sanitize and insert
  range.insertNode(fragment)

  // Move caret to the end of the pasted content
  if (offsets) {
    const afterLength = editor.value.textContent?.length || 0
    const offset = offsets.end + afterLength - beforeLength
    restoreSelection(editor.value, { start: offset, end: offset })
  }

  // All done, we can commmit
  commit()
}

function onInput(_event: Event): void {
  // const event = _event as InputEvent
  commit()
}

/* ==== SELECTION & CARET  ================================================== */

/** The `Range` of the current selection, if within our editor */
const selected = shallowRef<Range & { backwards?: boolean } | null>(null)

/* Update the `selected` Range when the document selection changes */
function onSelectionChange(): void {
  selected.value = editor.value ? getSelectionRange(editor.value) : null
}

onMounted(() => document.addEventListener('selectionchange', onSelectionChange))
onUnmounted(() => document.removeEventListener('selectionchange', onSelectionChange))

/* ==== SELECTION STATE ===================================================== */

/** Whether the current selection is all bold */
const isBold = shallowRef<boolean>(false)
/** Whether the current selection is all italic */
const isItalic = shallowRef<boolean>(false)

/* Watch the selected range and infer state for bold, italic, ... */
watch(selected, (selected) => {
  emit('hasSelection', !! selected)
  if (selected) {
    isBold.value = editor.value ? (!! isTagged(editor.value, selected, 'b')) : false
    isItalic.value = editor.value ? (!! isTagged(editor.value, selected, 'i')) : false
  }
}, { immediate: true })

/* Watch our bold, italic, .. states and emit */
watch(isBold, (bold) => emit('isBold', bold), { immediate: true })
watch(isItalic, (italic) => emit('isItalic', italic), { immediate: true })

/* ==== SANITIZATION AND FORMATTING ========================================= */

/** Apply a "tag" (bold, italic, ...) */
function applyTag(tagName: string, attributes: Record<string, string> = {}): void {
  if (! editor.value) return
  if (! selected.value) return
  const offsets = getRangeOffsets(editor.value, selected.value)
  toggleTag(editor.value, selected.value, tagName, attributes)
  if (offsets) restoreSelection(editor.value, offsets)
  commit()
}

defineExpose({
  /** Toggle _bold_ for the current selected text */
  bold: () => applyTag('b'),
  /** Toggle _italic_ for the current selected text */
  italic: () => applyTag('i'),
  /** Select range from anchor and offset as number of chars in the editor */
  select: (anchor: number, focus: number) => {
    if (! editor.value) return
    if (anchor <= focus) {
      restoreSelection(editor.value, { start: anchor, end: focus })
    } else {
      restoreSelection(editor.value, { start: focus, end: anchor, backwards: true })
    }
  },
})
</script>

<style lang="pcss" scoped>
.editor {
  width: 100%;
  height: 100%;
  background-color: #eee;
  box-sizing: border-box;
  white-space-collapse: preserve;
  padding: 0.25em;
  /* font-size: 100px; */

  &::v-deep mention {
    background-color: rgba(0, 0, 0, 0.15);
    border-radius: 0.25em;
    padding: 0em 0.4em 0.05em 0;
    margin: 0 0.2em;
    cursor: pointer;
    user-select: none;
    font-weight: normal;
    font-style: normal;
    text-decoration: none;

    &::before {
      content: '';
      background-color: #090;
      padding: 0em 0.4em 0.05em 0;
      margin-right: 0.25em;
      border-radius: 0.25em 0 0 0.25em;
    }
  }
}
</style>

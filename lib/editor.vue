<template>
  <div class="editxx">
    <!-- our mentions popup -->
    <div ref="popupRef" class="mentions-popup">
      <div ref="listRef" class="mentions-list">
        <div
          v-for="(mention, i) in mentionsList"
          :key="i"
          :class="{ 'mentions-selected': mentionsIndex === i }"
          class="mentions-entry"
          @mousedown="applyMention(mention.ref, mention.value)"
        >
          <span class="mentions-text">{{ mention.value }}</span>
          <span class="mentions-ref">&nbsp;{{ mention.ref }}</span>
        </div>
      </div>
      <div v-if="! mentionsReady" class="mentions-waiting">
        {{ mentionsText }}{{ dotsString }}
      </div>
      <div v-else-if="! mentionsList.length" class="mentions-none">
        {{ mentionsText }}
      </div>
    </div>

    <!-- our editor -->
    <div
      ref="editorRef"
      class="editor"
      :contenteditable="editable ? 'plaintext-only' : 'false'"
      @input="onInput($event as InputEvent)"
      @keydown="onKeydown($event)"
      @paste="onPaste($event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'

import { getCharacters, getOffsetsRange, getRangeOffsets } from './range'
import { replaceRange } from './replace'
import { sanitize } from './sanitize'
import { getSelectionOffsets, getSelectionRange, restoreSelection } from './selection'
import { isTagged, toggleTag } from './tags'

import type { PropType } from 'vue'
import type { Offsets } from './range'

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
  mentions: {
    type: Object as PropType<Record<string, string> | null>,
    required: false,
    default: () => ({}),
  },
})

/* ==== REFS ================================================================ */

/** Reference to our content editable DIV */
const editorRef = ref<HTMLDivElement | null>(null)
/** Reference to our popup */
const popupRef = ref<HTMLDivElement | null>(null)
/** Reference to our mentions list (in the popup) DIV */
const listRef = ref<HTMLDivElement | null>(null)

/** The `Range` of the current selection, if within our editor */
const selected = shallowRef<Range & { backwards?: boolean } | null>(null)

/** The HTML string contained by the editor */
const html = ref('')

/** Index of the current mention */
const mentionsIndex = ref(0)
/** Range of the current mention (while being inserted) */
const mentionsRange = shallowRef<Range | null>(null)
/** Text of the current mention (including the leading "@") */
const mentionsText = computed(() => mentionsRange.value?.toString() || '')
/** Computed to see if mentions (from our prop) are ready */
const mentionsReady = computed(() => !! props.mentions)
/** Computed list of mentions that match the current text */
const mentionsList = computed(() => {
  const text = mentionsText.value.substring(1).toLowerCase()

  if (! props.mentions) return []
  return Object.entries(props.mentions)
      .filter(([ _, name ]) => name.toLowerCase().startsWith(text))
      .sort(([ _a, a ], [ _b, b ]) => a.localeCompare(b))
      .map(([ ref, value ]) => ({ ref, value }))
})


/** Whether the current selection is all bold */
const isBold = ref<Element | null>(null)
/** Whether the current selection is all italic */
const isItalic = ref<Element | null>(null)
/** Whether the current selection is a link */
const isLink = ref<Element | null>(null)

/** How many dots are we displaying (in "waiting for mentions" animation) */
const dots = ref(0)
/** String of dots to display (in "waiting for mentions" animation) */
const dotsString = computed(() => '.' + '.'.repeat(dots.value % 5))
/** Interval animating our "waiting for mentions" text */
let dotsInterval: ReturnType<typeof setInterval> | null = null

/* ==== FUNCTIONS =========================================================== */

/** Commit changes to the model converting our editor into HTML */
function commit(): void {
  if (! editorRef.value) return void (html.value = '')

  // Clone our editor, so we can clean up unwanted attributes
  const clone = editorRef.value.cloneNode(true) as Element
  const mentions = clone.querySelectorAll('mention')
  for (const mention of mentions) mention.removeAttribute('contenteditable')

  // Clean our HTML, then update the model
  const string = clone.innerHTML
  html.value = string === '<br>' ? '' : // edge case: empty editor
    string.replaceAll('&nbsp;', ' ').trimEnd() // remove trailing whitespace
}

/** Compute the mention range according to changes th the selection */
function computeMention(): void {
  if (mentionsRange.value && selected.value?.collapsed) {
    const range = mentionsRange.value.cloneRange()
    range.setEnd(selected.value.startContainer, selected.value.startOffset)
    if (range.toString().match(/^@[^\r\n]*$/)) {
      mentionsRange.value = range
      return
    }
  }
  mentionsRange.value = null
}

/** Replace the current mentions range with a proper mention */
function applyMention(ref: string, value: string): void {
  if (! editorRef.value) return
  if (! mentionsRange.value) return

  const editor = editorRef.value

  const fragment = document.createDocumentFragment()
  const element = document.createElement('mention')
  element.setAttribute('ref', ref)
  element.append(value)
  fragment.append(element, ' ')

  const offsets = replaceRange(editor, mentionsRange.value, fragment)
  selected.value = restoreSelection(editor, offsets)
  document.getSelection()?.collapseToEnd()
  mentionsRange.value = null
  commit()
}

/** Apply a "tag" (bold, italic, ...) */
function applyTag(tagName: string, attributes: Record<string, string> = {}): void {
  if (! editorRef.value) return
  if (! selected.value) return

  const editor = editorRef.value

  const offsets = getRangeOffsets(editor, selected.value)
  toggleTag(editor, selected.value, tagName, attributes)
  if (offsets) selected.value = restoreSelection(editor, offsets)
  commit()
}

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
        applyTag('i')
        event.preventDefault()
        break
    }
  } else if (mentionsRange.value) {
    switch (event.key) {
      case 'Home':
        mentionsIndex.value = 0
        event.preventDefault()
        break
      case 'ArrowUp':
        mentionsIndex.value = Math.max(mentionsIndex.value - 1, 0)
        event.preventDefault()
        break
      case 'PageUp':
        mentionsIndex.value = Math.max(mentionsIndex.value - 4, 0)
        event.preventDefault()
        break
      case 'ArrowDown':
        mentionsIndex.value = Math.min(mentionsIndex.value + 1, mentionsList.value.length - 1)
        event.preventDefault()
        break
      case 'PageDown':
        mentionsIndex.value = Math.min(mentionsIndex.value + 4, mentionsList.value.length - 1)
        event.preventDefault()
        break
      case 'End':
        mentionsIndex.value = mentionsList.value.length - 1
        event.preventDefault()
        break
      case 'Escape':
        mentionsRange.value = null
        event.preventDefault()
        break
      case 'Enter': {
        const mention = mentionsList.value[mentionsIndex.value]
        if (mention) applyMention(mention.ref, mention.value)
        event.preventDefault()
        break
      }
    }
  }
}

/** Replace the current selection with the (sanitized) content from clipboard */
function onPaste(event: ClipboardEvent): void {
  event.preventDefault()
  if (! editorRef.value) return
  if (! selected.value) return

  const text = event.clipboardData?.getData('text/html') || ''
  const offsets = replaceRange(editorRef.value, selected.value, text)

  if (offsets) selected.value = restoreSelection(editorRef.value, offsets)
  document.getSelection()?.collapseToEnd()
  commit()
}


/** Someone typed something in our editor, let's process it */
function onInput(event: InputEvent): void {
  const editor = editorRef.value
  if (! editor) return

  // First thing first: sanitize the content (this will also take care of links)
  const mentions = mentionsRange.value ? getRangeOffsets(editor, mentionsRange.value) : null
  const selection = getSelectionOffsets(editor)
  sanitize(editor)
  if (mentions) mentionsRange.value = getOffsetsRange(editor, mentions)
  if (selection) {
    // Edge case when all content is deleted: insert a single "<br>"
    if (editor.innerHTML === '<br>') {
      document.getSelection()?.setBaseAndExtent(editor, 0, editor, 0)
    } else {
      selected.value = restoreSelection(editor, selection)
    }
  }

  // When the input is "@" we might want to trigger a mention
  if ((! isLink.value) && (! mentionsRange.value) && (event.data === '@') && (event.inputType === 'insertText')) {
    const selection = document.getSelection()
    if (! selection?.anchorNode) return
    const text = getCharacters(editor, selection.anchorNode, selection.anchorOffset)
    if (text.match(/(\s|^)@$/)) {
      const start = text.length === 1 ? 0 : text.length - 1
      const end = text.length
      const offsets: Offsets = { start, end }
      mentionsRange.value = getOffsetsRange(editor, offsets)
    }
  } else {
    computeMention()
  }

  // Commit the changes
  commit()
}


/* Update the `selected` Range when the document selection changes */
function onSelectionChange(_event: Event): void {
  selected.value = editorRef.value ? getSelectionRange(editorRef.value) : null
  computeMention()
}

/* ===== WATCHES AND COMPONENT LIFECYCLE ==================================== */

onMounted(() => {
  // Bind DOM events
  document.addEventListener('selectionchange', onSelectionChange)

  // References to our editor, popup, and list
  if (! editorRef.value) throw new Error('Editor not referenced')
  if (! popupRef.value) throw new Error('Popup not referenced')
  if (! listRef.value) throw new Error('List not referenced')
  const editor = editorRef.value
  const popup = popupRef.value
  const list = listRef.value

  /* On changes to the _local_ HTML, trigger an emit on our model value */
  watch(html, (html) => model.value = html)

  /* Watch our model, when the value is different from the local HTML, parse */
  watch(model, (model) => {
    if (model === html.value) return // no changes, ignore!

    const body = new DOMParser().parseFromString(model, 'text/html').body
    sanitize(body)
    editor.replaceChildren(...body.childNodes)

    commit()
  }, { immediate: true })

  /* Watch our mentions availability and trigger a waiting animation */
  watch(mentionsReady, (available) => {
    dots.value = 0
    if (! available) dotsInterval = setInterval(() => dots.value = dots.value + 1, 200)
    else if (dotsInterval) clearInterval(dotsInterval)
  }, { immediate: true })

  /* Watch our mentions index and update the popup */
  watch([ mentionsIndex, mentionsRange, mentionsList ], ([ index, range, mentionable ], [ oldIndex = -1 ]) => {
    // Make sure that our index is within acceptable bounds
    if (index >= mentionable.length) index = Math.max(mentionable.length - 1, 0)
    mentionsIndex.value = index

    // No list or no popup, nothing to do
    if (! popup) return
    if (! list) return

    // No range, hide and reset the popup
    if (! range) {
      mentionsIndex.value = 0
      popup.style.display = 'none'
      popup.style.top = '0'
      popup.style.left = '0'
      list.scrollTop = 0
      return
    }

    // Wait for the next tick to make sure the DOM is updated
    nextTick(() => {
      // Position and show the popup
      popup.style.display = 'block'

      const rangeRect = range.getBoundingClientRect()
      const editorRect = editor.getBoundingClientRect()

      const popupStyle = getComputedStyle(popup)
      const popupWidth = parseInt(popupStyle.width)
      const popupHeight = parseInt(popupStyle.height)

      const fitsTop = rangeRect.top - popupHeight > editorRect.top
      const fitsBottom = rangeRect.bottom + popupHeight < editorRect.bottom
      const fitsRight = rangeRect.left + popupWidth < editorRect.right

      popup.style.top = (! fitsBottom && fitsTop) ?
      `${rangeRect.top - popupHeight + window.scrollY - 3}px` :
      `${rangeRect.bottom + window.scrollY + 3}px`
      popup.style.left = fitsRight ?
      `${rangeRect.left + window.scrollX}px` :
      `${editorRect.right - popupWidth - window.scrollX}px`

      // Scroll the list to make sure the selected item is visible
      const item = list.querySelectorAll('.mentions-entry')[mentionsIndex.value]
      if (! item) return

      // Get the bounding rectangles for the list and the selected item
      const listRect = list.getBoundingClientRect()
      const itemRect = item.getBoundingClientRect()

      // Figure out top and bottom margins for the item
      const style = getComputedStyle(item)
      const marginTop = parseInt(style.marginTop)
      const marginBottom = parseInt(style.marginBottom)

      // Some CSS magic to scroll the list
      const topTop = itemRect.top - listRect.top
      const btmBtm = itemRect.bottom - listRect.bottom
      const relativeBtm = itemRect.bottom - listRect.top

      // Going down
      if (index > oldIndex) {
        // Element is hidden below the visible list
        if (relativeBtm > listRect.height) {
          list.scrollTop += btmBtm + marginBottom
          // Element is hidden above the visible list
        } else if (topTop < 0) {
          list.scrollTop += topTop - marginTop
        }
        // Going up
      } else {
        // Element is hidden above the visible list
        if (topTop < 0) {
          list.scrollTop += topTop - marginTop
          // Element is hidden below the visible list
        } else if (btmBtm > 0) {
          list.scrollTop += relativeBtm - listRect.height + marginBottom
        }
      }
    })
  }, { immediate: true })

  /* Watch the selected range and infer state for bold, italic, ... */
  watch(selected, (selected) => {
    if (selected) {
      isLink.value = isTagged(editor, selected, 'a')
      isBold.value = isTagged(editor, selected, 'b')
      isItalic.value = isTagged(editor, selected, 'i')
    } else {
      isLink.value = null
      isBold.value = null
      isItalic.value = null
    }
  }, { immediate: true })
})

onUnmounted(() => {
  document.removeEventListener('selectionchange', onSelectionChange)
  if (dotsInterval) clearInterval(dotsInterval)
})

/* ===== EMITS AND EXPOSED METHODS ========================================== */

const emit = defineEmits<{
  isLink: [ string ],
  isBold: [ boolean ],
  isItalic: [ boolean ],
  hasSelection: [ boolean ],
  mention: [ string ],
}>()

/* Watch our local refs and emit */
watch(selected, (selected) => emit('hasSelection', !! selected), { immediate: true })
watch(isLink, (link) => emit('isLink', link?.getAttribute('href') || ''), { immediate: true })
watch(isBold, (bold) => emit('isBold', !! bold), { immediate: true })
watch(isItalic, (italic) => emit('isItalic', !! italic), { immediate: true })
watch(mentionsText, (text) => emit('mention', text.substring(1)), { immediate: true })


defineExpose({
  /** Toggle _bold_ for the current selected text */
  bold: () => applyTag('b'),
  /** Toggle _italic_ for the current selected text */
  italic: () => applyTag('i'),
  /** Toggle _link_ for the current selected text */
  link: (href: string) => applyTag('a', { href }),
})
</script>

<style lang="pcss" scoped>
.editxx {
  display: flex;
  align-items: stretch;
}

/** Our mentions popul */
.mentions-popup {
  position: absolute;
  background-color: #fff;
  border: 1px solid #ccc;
  border-radius: 0.25em;
  overflow: hidden;
  display: none;
  cursor: pointer;
  min-width: 8em;
  z-index: 1000;

  /** List of all our available mentions */
  .mentions-list {
    overflow: scroll;
    max-height: 7em;
    scroll-top: 10px;
    white-space: nowrap;
  }

  /** Style for any matching mention entry */
  .mentions-entry {
    margin: 5px 0;
    padding: 0 0.75em;
    color: #666;

    /** Smaller refs */
    .mentions-ref {
      font-size: 0.75em;
      font-style: italic;
    }

    /** Extra stuff for selected mention */
    &.mentions-selected {
      color: #000;
      padding: 0 0.75em 0 0;
      background-color: #ccc;

      /** Tag to highlight the current selected entry */
      &::before {
        content: '';
        background-color: #090;
        padding: 0em 0.25em 0.05em 0.25em;
        margin-right: 0.25em;
      }
    }
  }

  .mentions-waiting {
    margin: 5px 0;
    padding: 0 0.75em;
    font-style: italic;
    color: #666;
  }

  /** Style for when no mention matches our input */
  .mentions-none {
    margin: 5px 0;
    padding: 0 0.75em;
    font-style: italic;
    color: #ccc;
  }
}

.editor {
  width: 100%;
  background-color: #eee;
  box-sizing: border-box;
  /* white-space-collapse: preserve; */
  padding: 0.25em;

  &::v-deep mention {
    background-color: #ccc;
    border-radius: 0.25em;
    padding: 0em 0.4em 0.05em 0;
    margin: 0 0.2em;
    cursor: default;
    user-select: none;
    font-weight: normal;
    font-style: normal;
    text-decoration: none;

    &::before {
      content: '';
      background-color: #090;
      color: #fff;
      padding: 0em 0.2em 0.05em 0.25em;
      margin-right: 0.25em;
      border-radius: 0.25em 0 0 0.25em;
    }
  }
}
</style>

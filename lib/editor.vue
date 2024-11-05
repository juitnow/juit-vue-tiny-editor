<template>
  <div ref="rootRef" class="juit-tiny-edit" :class="{ '-jte-editable': editable }">
    <!-- our mentions popup -->
    <div ref="mentionsPopupRef" class="-jte-mentions-popup">
      <ul ref="mentionsListRef">
        <li
          v-for="(mention, i) in mentionsEntries"
          :key="i"
          :class="{ '-jte-mentions-selected': mentionsIndex === i }"
          @mousedown="applyMention(mention.name, mention.value)"
        >
          <div class="-jte-mentions-entry">
            {{ mention.value }}
            <span class="-jte-mentions-ref">{{ mention.name }}</span>
          </div>
        </li>
      </ul>
      <div v-if="! mentionsReady" class="-jte-mentions-waiting">
        {{ mentionsText }}{{ dotsString }}
      </div>
      <div v-else-if="! mentionsEntries.length" class="-jte-mentions-none">
        {{ mentionsText }}
      </div>
    </div>

    <!-- our links popup -->
    <div
      ref="linksPopupRef"
      class="-jte-links-popup"
      @click="activeLink = previousLink"
      @focusin="activeLink = previousLink"
    >
      <div>
        <iconText class="-jte-icon" />
        <input v-model="linkText" type="text">
      </div>
      <div :class="{ '-jte-error': !linkValid }">
        <iconLink class="-jte-icon" />
        <input v-model="linkHref" type="text">
      </div>
    </div>

    <!-- our editor -->
    <div
      ref="editorRef"
      class="-jte-editor"
      :contenteditable="editable ? 'plaintext-only' : 'false'"
      @beforeinput="onBeforeInput($event as InputEvent)"
      @input="onInput($event as InputEvent)"
      @keydown="onKeydown($event)"
      @paste="onPaste($event)"
      @focusin="activeLink = null"
    />

    <div class="-jte-toolbox">
      <iconMention class="-jte-icon -jte-icon-mention" :class="{ '-jte-disabled': ! selected?.collapsed }" @click="insertMention" />
      <iconBold class="-jte-icon -jte-icon-bold" :class="iconClass(isBold, 'b')" @click="applyTag('b')" />
      <iconItalic class="-jte-icon -jte-icon-italic" :class="iconClass(isItalic, 'i')" @click="applyTag('i')" />
      <iconLink class="-jte-icon -jte-icon-href" :class="iconClass(isLink)" @click="applyTag('a', { href: 'http://__placeholder__/' })" />
      <iconSend class="-jte-icon -jte-icon-send" :class="{ '-jte-disabled': !html, '-jte-active': !!html }" @click="submit" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'

import { getCharacters, getOffsetsRange, getRangeOffsets } from './range'
import { replaceRange } from './replace'
import { sanitize } from './sanitize'
import { getSelectionOffsets, getSelectionRange, restoreSelection } from './selection'
import { isTagged, toggleTag } from './tags'
// SVGs
import iconBold from './svg/bold.svg'
import iconItalic from './svg/italic.svg'
import iconLink from './svg/link.svg'
import iconMention from './svg/mention.svg'
import iconSend from './svg/send.svg'
import iconText from './svg/text.svg'

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

/** Reference to our root container */
const rootRef = shallowRef<HTMLDivElement | null>(null)
/** Reference to our content editable DIV */
const editorRef = shallowRef<HTMLDivElement | null>(null)
/** Reference to our popup */
const mentionsPopupRef = shallowRef<HTMLDivElement | null>(null)
/** Reference to our mentions list (in the popup) DIV */
const mentionsListRef = shallowRef<HTMLDivElement | null>(null)
/** Reference to our links popup */
const linksPopupRef = shallowRef<HTMLDivElement | null>(null)

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
const mentionsEntries = computed(() => {
  const text = mentionsText.value.substring(1).toLowerCase()

  if (! props.mentions) return []
  return Object.entries(props.mentions)
      .filter(([ _, name ]) => name.toLowerCase().startsWith(text))
      .sort(([ _a, a ], [ _b, b ]) => a.localeCompare(b))
      .map(([ name, value ]) => ({ name, value }))
})

/** The link associated with the *current* selection in the editor */
const selectedLink = ref<Element | null>(null)
/** The link currently being handled by the links popup */
const activeLink = ref(null as any)
/** The last link highlighted by the editor (updated by the watch below) */
const previousLink = ref<Element | null>(null)
/** The current link, either in the editor or in the links popup */
const isLink = computed<Element | null>(() => selectedLink.value || activeLink.value)
/* Watch the selected link and remember the last viable one */
watch(selectedLink, (link) => link && (previousLink.value = link))
/** The text of the current link */
const linkText = ref('')
/** The href of the current link */
const linkHref = ref('')
/** Validate the link's own href (must be empty or an URL) */
const linkValid = computed(() => {
  if (! linkHref.value) return true
  try {
    new URL(linkHref.value)
    return true
  } catch {
    return false
  }
})
/** Update the content and href of the current link from the popup */
watch([ linkText, linkHref ], ([ text, href ]) => {
  if (! isLink.value) return
  isLink.value.textContent = text
  isLink.value.setAttribute('href', href)
  commit()
})


/** Whether the current selection is all bold */
const isBold = ref<Element | null>(null)
/** Whether the current selection is all italic */
const isItalic = ref<Element | null>(null)

/** How many dots are we displaying (in "waiting for mentions" animation) */
const dots = ref(0)
/** String of dots to display (in "waiting for mentions" animation) */
const dotsString = computed(() => '.' + '.'.repeat(dots.value % 5))
/** Interval animating our "waiting for mentions" text */
let dotsInterval: ReturnType<typeof setInterval> | null = null
/** The _next_ tag to wrap our input into (when enabling bold on collapsed) */
const nextTag = ref('')
/** When the selected range changes, reset the next tag */
watch((selected), (newRange, oldRange) => {
  if (oldRange === null) return
  if (newRange === null) return

  if ((oldRange.startContainer == newRange.startContainer) &&
      (oldRange.startOffset == newRange.startOffset) &&
      (oldRange.endContainer == newRange.endContainer) &&
      (oldRange.endOffset == newRange.endOffset) &&
      (oldRange?.backwards == newRange?.backwards)) return
  nextTag.value = ''
})

/** Our history (for undo) */
const history: (Offsets & { content: string })[] = []

/* ==== FUNCTIONS =========================================================== */

/** Compute the class for an icon (bold or italic) */
function iconClass(element: Element | null, tag?: string): string {
  if (! selected.value) return '-jte-disabled'

  // If we don't have a tag, we're not processing zero-width selections
  if (! tag) {
    if (element) return '-jte-active'
    if (selected.value.collapsed) return '-jte-disabled'
    return ''
  }

  // styled, but next input will remove the style
  if (element && (nextTag.value === tag)) return ''
  // either styled *or* next input will add the style
  if (element || nextTag.value === tag) return '-jte-active'
  // not styled, but can be styled
  return ''
}

/** Commit changes to the model converting our editor into HTML */
function commit(): void {
  if (! editorRef.value) return void (html.value = '')

  // Clean our HTML, then update the model
  const string = editorRef.value.innerHTML
  html.value = string === '<br>' ? '' : // edge case: empty editor
    string.replaceAll('&nbsp;', ' ').trimEnd() // remove trailing whitespace
}

/** Mark a new entry in our history */
function historySave(): void {
  if (! editorRef.value) return

  // Save our history
  if (history[history.length - 1]?.content !== html.value) {
    const offsets = getSelectionOffsets(editorRef.value) || { start: 0, end: 0 }
    history.push({ ...offsets, content: html.value })
    if (history.length > 100) history.shift()
  }
}

/** Undo the last change */
function historyUndo(): void {
  if (! editorRef.value) return
  if (! selected.value) return

  const entry = history.pop()
  if (! entry) return

  const body = new DOMParser().parseFromString(entry.content, 'text/html').body
  editorRef.value.replaceChildren(...body.childNodes)
  restoreSelection(editorRef.value, entry)
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
function applyMention(name: string, value: string): void {
  if (! editorRef.value) return
  if (! mentionsRange.value) return

  const editor = editorRef.value

  historySave()
  const fragment = document.createDocumentFragment()
  const element = document.createElement('link')
  element.setAttribute('rel', 'mention')
  element.setAttribute('name', name)
  element.setAttribute('title', value)
  fragment.append(element, ' ')

  const offsets = replaceRange(editor, mentionsRange.value, fragment)
  selectWithOffsets(offsets, true)
  mentionsRange.value = null
  commit()
}

/** Apply a "tag" (bold, italic, ...) */
function applyTag(tagName: string, attributes: Record<string, string> = {}): void {
  if (! editorRef.value) return
  if (! selected.value) return

  const editor = editorRef.value

  // If nothing is selected, this is reserved for the next tag
  if (selected.value.collapsed) {
    nextTag.value = tagName
    editor.focus()
    return
  }

  historySave()
  const offsets = getRangeOffsets(editor, selected.value)
  toggleTag(editor, selected.value, tagName, attributes)
  selectWithOffsets(offsets)
  commit()
}

function insertMention(): void {
  if (! editorRef.value) return
  if (! selected.value?.collapsed) return

  const editor = editorRef.value

  const offsets = getRangeOffsets(editor, selected.value)

  const at = document.createTextNode('@')
  selected.value.insertNode(at)

  offsets.end += 1
  mentionsRange.value = getOffsetsRange(editor, offsets)
  offsets.start += 1
  selectWithOffsets(offsets)
}

function selectWithOffsets(offsets: Offsets, collapse?: boolean): void {
  if (! editorRef.value) return

  const editor = editorRef.value
  selected.value = restoreSelection(editor, offsets, collapse)
  editor.focus()
}

function submit(): void {
  if (! html.value) return
  emit('submit', html.value)
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
      case 'z':
        historyUndo()
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
        mentionsIndex.value = Math.min(mentionsIndex.value + 1, mentionsEntries.value.length - 1)
        event.preventDefault()
        break
      case 'PageDown':
        mentionsIndex.value = Math.min(mentionsIndex.value + 4, mentionsEntries.value.length - 1)
        event.preventDefault()
        break
      case 'End':
        mentionsIndex.value = mentionsEntries.value.length - 1
        event.preventDefault()
        break
      case 'Escape':
        mentionsRange.value = null
        event.preventDefault()
        break
      case 'Enter': {
        const mention = mentionsEntries.value[mentionsIndex.value]
        if (mention) applyMention(mention.name, mention.value)
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

  const data = event.clipboardData
  if (! data) return

  const text = data.getData('text/html') || data.getData('text/plain')
  if (! text) return

  const offsets = replaceRange(editorRef.value, selected.value, text)

  selectWithOffsets(offsets, true)
  commit()
}

/** If deleting a bunch of content, ensure links are removed, too... */
function onBeforeInput(event: InputEvent): void {
  if (! editorRef.value) return
  if (! selected.value) return

  historySave()

  if ((!selected.value.collapsed) &&
      ((event.inputType === 'deleteContentBackward') ||
       (event.inputType === 'deleteContentForward'))) {
    event.preventDefault()
    event.stopPropagation()
    const offsets = replaceRange(editorRef.value, selected.value, '')
    selectWithOffsets(offsets, true)
    commit()
  }
}

/** Someone typed something in our editor, let's process it */
function onInput(event: InputEvent): void {
  const editor = editorRef.value
  if (! editor) return

  // Save the current selection and mentions
  const mentions = mentionsRange.value ? getRangeOffsets(editor, mentionsRange.value) : null
  const selection = getSelectionOffsets(editor)

  // See if we need to process this event with style (bold, italic, ...)
  if (nextTag.value &&
      selection &&
      (selection.start === selection.end) &&
      (event.inputType === 'insertText') &&
      (event.data !== '@') &&
      (! mentionsRange.value)) {
    const range = getOffsetsRange(editor, { start: selection.start - 1, end: selection.end })
    toggleTag(editor, range, nextTag.value)
  }
  nextTag.value = ''

  // First thing first: sanitize the content (this will also take care of links)
  sanitize(editor)

  // Restore mentions range *after* sanitization
  if (mentions) mentionsRange.value = getOffsetsRange(editor, mentions)

  // Restore the selection range
  if (selection) {
    // Edge case when all content is deleted: insert a single "<br>"
    if (editor.innerHTML === '<br>') {
      document.getSelection()?.setBaseAndExtent(editor, 0, editor, 0)
      editor.focus()
    } else {
      selectWithOffsets(selection)
    }
  }

  // When the input is "@" we might want to trigger a mention
  if ((! isLink.value) &&
      (! mentionsRange.value) &&
      (event.data === '@') &&
      (event.inputType === 'insertText')) {
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
  // Wipe all link information if we leave our component
  if (!(rootRef.value && getSelectionRange(rootRef.value))) {
    selectedLink.value = null
    previousLink.value = null
    activeLink.value = null
  }

  // Handle the current editor selection and remember its range (if any)
  selected.value = editorRef.value ? getSelectionRange(editorRef.value) : null

  // Process any changes to mentions
  computeMention()
}

/* ===== WATCHES AND COMPONENT LIFECYCLE ==================================== */

onMounted(() => {
  // Bind DOM events
  document.addEventListener('selectionchange', onSelectionChange)

  // References to our editor, popup, and list
  if (! rootRef.value) throw new Error('Root not referenced')
  if (! editorRef.value) throw new Error('Editor not referenced')
  if (! mentionsPopupRef.value) throw new Error('Popup not referenced')
  if (! mentionsListRef.value) throw new Error('List not referenced')
  if (! linksPopupRef.value) throw new Error('Popup not referenced')
  const root = rootRef.value
  const editor = editorRef.value
  const mentionsPopup = mentionsPopupRef.value
  const mentionsList = mentionsListRef.value
  const linksPopup = linksPopupRef.value

  /* On changes to the _local_ HTML, trigger an emit on our model value */
  watch(html, (html) => {
    if (html !== model.value) model.value = html // no changes, ignore!
  })

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

  /* Watch our links and update the popup */
  watch(isLink, (link) => {
    // Always update (or reset?) the link text and href of a link
    linkText.value = link?.textContent || ''
    linkHref.value = link?.getAttribute('href') || ''

    // If the link is a placeholder, consider this to be an empty link
    if (linkHref.value === 'http://__placeholder__/') {
      link?.setAttribute('href', '')
      linkHref.value = ''
    }

    // If we are no longer editing a link, sanitize and hide the popup
    if (! link) {
      const offsets = getSelectionOffsets(editor)
      sanitize(editor)
      if (offsets) restoreSelection(editor, offsets)

      linksPopup.style.display = 'none'
      linksPopup.style.top = '0'
      linksPopup.style.left = '0'
      return
    }

    // Wait for the next tick to make sure the DOM is updated
    nextTick(() => {
      // Position and show the popup
      linksPopup.style.display = 'flex'

      const rootRect = root.getBoundingClientRect()
      const rangeRect = link.getBoundingClientRect()
      const editorRect = editor.getBoundingClientRect()

      const popupStyle = getComputedStyle(linksPopup)
      const popupWidth = parseInt(popupStyle.width)
      const popupHeight = parseInt(popupStyle.height)

      const fitsTop = (rangeRect.top - popupHeight) - 6 > editorRect.top
      const fitsBottom = (rangeRect.bottom + popupHeight + 3) < editorRect.bottom
      const fitsRight = rangeRect.left + popupWidth < editorRect.right

      linksPopup.style.top = (! fitsBottom && fitsTop) ?
        `${rangeRect.top - popupHeight - rootRect.top - 6}px` : // over the link
        `${rangeRect.bottom - rootRect.top + 3}px` // below the link
      linksPopup.style.left = fitsRight ?
        `${rangeRect.left - rootRect.left}px` : // right of the link
        `${editorRect.right - popupWidth - rootRect.left}px` // aligned to the right of the editor
    })
  }, { immediate: true })

  /* Watch our mentions index and update the popup */
  watch([ mentionsIndex, mentionsRange, mentionsEntries ], ([ index, range, entries ], [ oldIndex = -1 ]) => {
    // Make sure that our index is within acceptable bounds
    if (index >= entries.length) index = Math.max(entries.length - 1, 0)
    mentionsIndex.value = index

    // No list or no popup, nothing to do
    if (! mentionsPopup) return
    if (! mentionsList) return

    // No range, hide and reset the popup
    if (! range) {
      mentionsIndex.value = 0
      mentionsPopup.style.display = 'none'
      mentionsPopup.style.top = '0'
      mentionsPopup.style.left = '0'
      mentionsList.scrollTop = 0
      return
    }

    // Wait for the next tick to make sure the DOM is updated
    nextTick(() => {
      // Position and show the popup
      mentionsPopup.style.display = 'block'

      const rootRect = root.getBoundingClientRect()
      const rangeRect = range.getBoundingClientRect()
      const editorRect = editor.getBoundingClientRect()

      const popupStyle = getComputedStyle(mentionsPopup)
      const popupWidth = parseInt(popupStyle.width)
      const popupHeight = parseInt(popupStyle.height)

      const fitsTop = (rangeRect.top - popupHeight) - 6 > editorRect.top
      const fitsBottom = (rangeRect.bottom + popupHeight + 3) < editorRect.bottom
      const fitsRight = rangeRect.left + popupWidth < editorRect.right

      mentionsPopup.style.top = (! fitsBottom && fitsTop) ?
        `${rangeRect.top - popupHeight - rootRect.top - 6}px` : // over the link
        `${rangeRect.bottom - rootRect.top + 3}px` // below the link
      mentionsPopup.style.left = fitsRight ?
        `${rangeRect.left - rootRect.left}px` : // right of the link
        `${editorRect.right - popupWidth - rootRect.left}px` // aligned to the right of the editor

      // Scroll the list to make sure the selected item is visible
      const item = mentionsList.querySelectorAll('li')[mentionsIndex.value]
      if (! item) return

      const style = getComputedStyle(item)
      const topBorder = parseFloat(style.getPropertyValue('border-top-width')) || 0
      const bottomBorder= parseFloat(style.getPropertyValue('border-bottom-width')) || 0

      // Get the bounding rectangles for the list and the selected item
      const listRect = mentionsList.getBoundingClientRect()
      const itemRect = item.getBoundingClientRect()

      // Some CSS magic to scroll the list
      const topTop = itemRect.top - listRect.top
      const btmBtm = itemRect.bottom - listRect.bottom
      const relativeBtm = itemRect.bottom - listRect.top

      // Going down
      if (index > oldIndex) {
        // Element is hidden below the visible list
        if (relativeBtm > listRect.height) {
          mentionsList.scrollTop += btmBtm - bottomBorder
          // Element is hidden above the visible list
        } else if (topTop < 0) {
          mentionsList.scrollTop += topTop + topBorder
        }
        // Going up
      } else {
        // Element is hidden above the visible list
        if (topTop < 0) {
          mentionsList.scrollTop += topTop + topBorder
          // Element is hidden below the visible list
        } else if (btmBtm > 0) {
          mentionsList.scrollTop += relativeBtm - listRect.height - bottomBorder
        }
      }
    })
  }, { immediate: true })

  /* Watch the selected range and infer state for bold, italic, ... */
  watch(selected, (selected) => {
    if (selected) {
      selectedLink.value = isTagged(editor, selected, 'a')
      isBold.value = isTagged(editor, selected, 'b')
      isItalic.value = isTagged(editor, selected, 'i')
    } else {
      selectedLink.value = null
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
  mention: [ string ],
  submit: [ string ],
}>()

/* Watch our local refs and emit */
watch(mentionsText, (text) => emit('mention', text.substring(1)), { immediate: true })
</script>

<style lang="pcss">
:root {
  --jte-text: currentColor;
  --jte-text-inactive: #999;
  --jte-border-radius: 5px;
  --jte-border-color: #ccc;
  --jte-shade: #eee;
  --jte-active-color: #ddf;

  --jte-mention-color: #090;
  --jte-mention-padding: 0.25em;
  --jte-mention-width: 0.5em;

  --jte-popup-background: #fff;
  --jte-popup-font-size: 0.85em;
}

.juit-tiny-edit {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  position: relative;
  box-sizing: content-box;
  border-radius: var(--jte-border-radius);

  /* ===== TOOLBAR ========================================================== */

  .-jte-toolbox {
    display: none;
    user-select: none;
    position: relative;
    height: 1.75em;
    overflow: hidden;
    margin-top: 0.75em;
    padding: 0 0.25em 0 0.25em;

    .-jte-editable & {
      display: flex;
    }

    .-jte-icon {
      width: 1em;
      height: 1em;
      border: 1px solid #ccc;
      padding: 0.125em 0.25em;
      margin: 0 0.25em;
      border-radius: var(--jte-border-radius);
      border: 1px solid var(--jte-border-color);
      vertical-align: top;

      &.-jte-disabled {
        color: var(--jte-text-inactive);
      }

      &.-jte-active {
        background-color: var(--jte-active-color);
      }

      &.-jte-icon-mention {
        margin-left: 0.125em;
      }

      &:hover:not(.-jte-disabled):not(.-jte-active) {
        background-color: var(--jte-shade);
      }

      &:active:not(.-jte-disabled) {
        background-color: var(--jte-border-color);
      }

      &.-jte-icon-send {
        margin-left: auto;
        margin-right: 0.125em;
        padding-left: 1em;
        padding-right: 1em;
      }
    }

  }

  /* ===== EDITOR =========================================================== */

  .-jte-editor {
    width: 100%;
    box-sizing: border-box;
    padding: 0.25em;
    white-space: pre-wrap;

    .-jte-editable & {
      padding-bottom: 2.5em;
      margin-bottom: -2.5em;
    }

    /** Our mentions */
    link[rel="mention"] {
      display: inline;
      background-color: var(--jte-shade);

      border-width: 1px;
      border-style: solid;
      border-color: var(--jte-border-color);
      border-radius: var(--jte-border-radius);
      border-left-width: var(--jte-mention-width);
      border-left-color: var(--jte-mention-color);
      border-left-style: solid;

      padding-right: var(--jte-mention-width);
      padding-left: var(--jte-mention-padding);

      cursor: default;
      user-select: none;
      font-weight: normal;
      font-style: normal;
      text-decoration: none;

      font-size: 0.85em;

      &:after {
        content: attr(title);
      }
    }
  }

  /* ===== POPUPS =========================================================== */

  /** Popups basics */
  .-jte-mentions-popup, .-jte-links-popup {
    display: none;
    position: absolute;
    z-index: 1000;

    font-size: var(--jte-popup-font-size);
    background-color: var(--jte-popup-background);
    border-radius: var(--jte-border-radius);
    border-color: var(--jte-border-color);
    border-style: solid;
    border-width: 1px;
  }

  /* ===== MENTIONS POPUP =================================================== */

  /** Our mentions popup */
  .-jte-mentions-popup {
    overflow: hidden;
    cursor: pointer;
    min-width: 8em;

    /** Our list of mentions */
    ul {
      overflow: scroll;
      max-height: calc(7.5em + 3px);
      white-space: nowrap;
      margin: 0;
      padding: 0;
    }

    /** Each mention entry */
    li {
      list-style-type: none;
      border-top: 1px solid transparent;
      border-bottom: 1px solid transparent;
      color: var(--jte-text-inactive);

      /** Inside of our mentions entry */
      .-jte-mentions-entry {
        padding-block: 0.125em;
        padding-left: var(--jte-mention-padding);
        padding-right: 1.5em;
        border-left-width: var(--jte-mention-width);
        border-left-style: solid;
        border-left-color: transparent;

        /** Refs want a smaller font */
        .-jte-mentions-ref {
          margin-left: 0.5em;
          font-size: 0.85em;
          font-style: italic;
        }
      }

      /** Selected list item */
      &.-jte-mentions-selected {
        color: var(--jte-text);
        background-color: var(--jte-shade);
        border-color: var(--jte-border-color);

        /** Apply our "tag" to the slected mention */
        .-jte-mentions-entry {
          border-color: var(--jte-mention-color);
        }
      }

      /** No borders for first and last item */
      &:first-child { border-top: none; }
      &:last-child { border-bottom: none; }
    }

    /** Basic style for waiting / no item found */
    .-jte-mentions-waiting, .-jte-mentions-none {
      font-size: var(--jte-popup-font-size);
      color: var(--jte-text-inactive);
      border-left-width: var(--jte-mention-width);
      border-left-style: solid;
      border-color: transparent;
      padding-block: 0.125em;
      padding-inline: var(--jte-mention-padding);
    }

    /** Waiting is in italic */
    .-jte-mentions-waiting {
      font-style: italic;
    }

    /** None has a grey tab */
    .-jte-mentions-none {
      border-color: var(--jte-shade);
    }
  }

  /* ===== LINKS POPUP ====================================================== */

  .-jte-links-popup {
    user-select: none;
    padding: 0.125em;
    width: 20em;
    flex-direction: column;

    div {
      display: flex;
      flex-direction: row;
    }

    .-jte-icon {
      position: absolute;
      display: inline-block;

      width: 1.25em;
      height: 1.25em;
      padding: 0.125em 0.25em;
      margin: 0.25em;

      border: 1px solid var(--jte-border-color);
      border-radius: var(--jte-border-radius) 0 0 var(--jte-border-radius);
      background-color: var(--jte-shade);

      z-index: 1;
    }

    input {
      display: inline-block;
      flex-grow: 1;

      height: 1.25em;
      margin: 0.25em;
      padding: 0.125em 0.5em;

      border: 1px solid var(--jte-border-color);
      border-radius: var(--jte-border-radius);
      background-color: transparent;
      padding-left: 2.25em;

      z-index: 2;
    }

    .-jte-error {
      .-jte-icon, input {
        background-color: #fee;
        border-color: #933;
        color: #933;
      }
    }
  }
}
</style>

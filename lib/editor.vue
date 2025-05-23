<template>
  <div class="juit-tiny-edit" :class="{ '-jte-editable': editable, '-jte-dark': dark }">
    <div ref="rootRef" class="-jte-root">
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

      <div v-if="placeholder && (! html)" class="-jte-placeholder">
        {{ placeholder }}
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
        <iconSend
          v-if="onSubmit"
          class="-jte-icon -jte-icon-send"
          :class="{ '-jte-disabled': !html, '-jte-active': !!html }"
          @click="submit"
        />
      </div>
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

defineOptions({ name: 'JuitTinyEditor' })

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
  /** A flag indicating whether dark mode is enabled or not */
  dark: {
    type: Boolean,
    required: false,
    default: false,
  },
  /** A placeholder for when no text is available */
  placeholder: {
    type: String,
    required: false,
    default: '',
  },
  /** A list of mentions to be used in the editor */
  mentions: {
    type: Object as PropType<Record<string, string> | null>,
    required: false,
    default: () => ({}),
  },
  /** Used as `@mention="..."`, notify the current mention text (`@abc...`) */
  onMention: {
    type: Function as PropType<((text: string) => any) | undefined>,
    required: false,
    default: undefined,
  },
  /** Used as `@submit="..."`, will display the send button and emit HTML */
  onSubmit: {
    type: Function as PropType<((html: string) => any) | undefined>,
    required: false,
    default: undefined,
  },
})

watch(() => props.dark, (dark) => {
  rootRef.value?.style.setProperty('color-scheme', dark ? 'dark light' : 'light dark')
  // document.body.classList.toggle('dark', dark)
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
  props.onSubmit?.(html.value)
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

/* Watch our local refs and emit */
watch(mentionsText, (text) => text && props.onMention?.(text))

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

    // wrap the text in <html><body>...</body></html>, if we don't do it then
    // any initial <link> tag will be moved to the <head> of the document...
    const string = `<html><body>${model}</body></html>`
    const body = new DOMParser().parseFromString(string, 'text/html').body
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
</script>

<style lang="pcss">
.juit-tiny-edit {

  /* ===== LIGHT THEME (default) ============================================ */

  .-jte-root {
    /* border radius */
    --jte-curr-border-radius: var(--jte-border-radius, 4px);

    /* main colors */
    --jte-curr-text: var(--jte-text, currentColor);
    --jte-curr-background: var(--jte-background, transparent);
    --jte-curr-active: var(--jte-active, #009);
    --jte-curr-mention: var(--jte-mention, #99f);
    --jte-curr-popup: var(--jte-popup, #fff);
    --jte-curr-link: var(--jte-link, #009);
    --jte-curr-error: var(--jte-error, #933);

    /* derived colors */
    --jte-curr-inactive: var(--jte-inactive, color-mix(in srgb, var(--jte-curr-text) 50%, transparent));
    --jte-curr-border: var(--jte-border, color-mix(in srgb, var(--jte-curr-text) 12.5%, transparent));
    --jte-curr-shade: var(--jte-shade, color-mix(in srgb, var(--jte-curr-text) 6.25%, transparent));
    --jte-curr-active-shade: var(--jte-active-shade, color-mix(in srgb, var(--jte-curr-active) 6.25%, transparent));

    /* button colors */
    --jte-curr-button-text: var(--jte-button-text, var(--jte-curr-text));
    --jte-curr-button-border: var(--jte-button-border, var(--jte-curr-border));
    --jte-curr-button-background: var(--jte-button-background, var(--jte-curr-background));

    --jte-curr-button-hovered-text: var(--jte-button-hovered-text, var(--jte-curr-text));
    --jte-curr-button-hovered-border: var(--jte-button-hovered-border, var(--jte-curr-border));
    --jte-curr-button-hovered-background: var(--jte-button-hovered-background, var(--jte-curr-shade));

    --jte-curr-button-active-text: var(--jte-button-active-text, var(--jte-curr-active));
    --jte-curr-button-active-border: var(--jte-button-active-border, var(--jte-curr-border));
    --jte-curr-button-active-background: var(--jte-button-active-background, var(--jte-curr-active-shade));

    --jte-curr-button-disabled-text: var(--jte-button-disabled-text, var(--jte-curr-inactive));
    --jte-curr-button-disabled-border: var(--jte-button-disabled-border, var(--jte-curr-border));
    --jte-curr-button-disabled-background: var(--jte-button-disabled-background, var(--jte-curr-shade));

    /* inputs within popup */
    --jte-curr-input-text: var(--jte-input-text, var(--jte-curr-text));
    --jte-curr-input-background: var(--jte-input-background, transparent);
    --jte-curr-input-border: var(--jte-input-border, var(--jte-curr-border));
    --jte-curr-input-shade: var(--jte-input-shade, var(--jte-curr-shade));
  }

  /* ===== DARK THEME ======================================================= */

  &.-jte-dark .-jte-root {
    /* main colors */
    --jte-curr-text: var(--jte-dark-text, currentColor);
    --jte-curr-background: var(--jte-dark-background, transparent);
    --jte-curr-active: var(--jte-dark-active, #99f);
    --jte-curr-mention: var(--jte-dark-mention, #669);
    --jte-curr-popup: var(--jte-dark-popup, #111);
    --jte-curr-link: var(--jte-dark-link, #99f);
    --jte-curr-error: var(--jte-dark-error, #f99);

    /* derived colors */
    --jte-curr-inactive: var(--jte-dark-inactive, color-mix(in srgb, var(--jte-curr-text) 50%, transparent));
    --jte-curr-border: var(--jte-dark-border, color-mix(in srgb, var(--jte-curr-text) 12.5%, transparent));
    --jte-curr-shade: var(--jte-dark-shade, color-mix(in srgb, var(--jte-curr-text) 12.5%, transparent));
    --jte-curr-active-shade: var(--jte-dark-active-shade, color-mix(in srgb, var(--jte-curr-active) 6.25%, transparent));

    /* button colors */
    --jte-curr-button-text: var(--jte-dark-button-text, var(--jte-curr-text));
    --jte-curr-button-border: var(--jte-dark-button-border, var(--jte-curr-border));
    --jte-curr-button-background: var(--jte-dark-button-background, var(--jte-curr-background));

    --jte-curr-button-hovered-text: var(--jte-dark-button-hovered-text, var(--jte-curr-text));
    --jte-curr-button-hovered-border: var(--jte-dark-button-hovered-border, var(--jte-curr-border));
    --jte-curr-button-hovered-background: var(--jte-dark-button-hovered-background, var(--jte-curr-shade));

    --jte-curr-button-active-text: var(--jte-dark-button-active-text, var(--jte-curr-active));
    --jte-curr-button-active-border: var(--jte-dark-button-active-border, var(--jte-curr-border));
    --jte-curr-button-active-background: var(--jte-dark-button-active-background, var(--jte-curr-active-shade));

    --jte-curr-button-disabled-text: var(--jte-dark-button-disabled-text, var(--jte-curr-inactive));
    --jte-curr-button-disabled-border: var(--jte-dark-button-disabled-border, var(--jte-curr-border));
    --jte-curr-button-disabled-background: var(--jte-dark-button-disabled-background, var(--jte-curr-shade));

    /* inputs within popup */
    --jte-curr-input-text: var(--jte-dark-input-text, var(--jte-curr-text));
    --jte-curr-input-background: var(--jte-dark-input-background, transparent);
    --jte-curr-input-border: var(--jte-dark-input-border, var(--jte-curr-border));
    --jte-curr-input-shade: var(--jte-dark-input-shade, var(--jte-curr-shade));
  }

  /* ======================================================================== *
   * STYLING                                                                  *
   * ======================================================================== */

  .-jte-root {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    position: relative;
    box-sizing: content-box;

    color: var(--jte-curr-text);
    background-color: var(--jte-curr-background);

    /* ===== TOOLBAR ======================================================== */

    .-jte-toolbox {
      display: none;
      user-select: none;
      position: relative;
      height: 1.75em;
      overflow: hidden;
      margin-top: 0.75em;
      padding: 0 0.25em 0 0.25em;

      .-jte-icon {
        width: 1em;
        height: 1em;
        padding: 0.125em 0.25em;
        margin: 0 0.25em;
        vertical-align: top;

        color: var(--jte-curr-button-text);
        background-color: var(--jte-curr-button-background);
        border: 1px solid var(--jte-curr-button-border);
        border-radius: var(--jte-curr-border-radius);

        &.-jte-icon-mention {
          margin-left: 0.125em;
        }

        &.-jte-icon-send {
          margin-left: auto;
          margin-right: 0.125em;
          padding-left: 1em;
          padding-right: 1em;
        }

        &.-jte-disabled {
          color: var(--jte-curr-button-disabled-text);
          border-color: var(--jte-curr-button-disabled-border);
          background-color: var(--jte-curr-button-disabled-background);
        }

        &.-jte-active {
          color: var(--jte-curr-button-active-text);
          border-color: var(--jte-curr-button-active-border);
          background-color: var(--jte-curr-button-active-background);
        }

        &:active:not(.-jte-disabled) {
          color: var(--jte-curr-button-active-text);
          border-color: var(--jte-curr-button-active-border);
          background-color: var(--jte-curr-button-active-background);
        }

        &:hover:not(.-jte-disabled):not(.-jte-active):not(:active) {
          color: var(--jte-curr-button-hovered-text);
          border-color: var(--jte-curr-button-hovered-border);
          background-color: var(--jte-curr-button-hovered-background);
        }
      }
    }

    /* ===== PLACEHOLDER ==================================================== */

    .-jte-placeholder {
      position: absolute;
      padding: 0.25em;
      pointer-events: none;
      color: var(--jte-curr-inactive);
    }

    /* ===== EDITOR ========================================================= */

    .-jte-editor {
      width: 100%;
      box-sizing: border-box;
      padding: 0.25em;
      white-space: pre-wrap;

      border-radius: var(--jte-curr-border-radius);
      border: 1px solid var(--jte-curr-border);

      &:focus {
        outline: 1px solid var(--jte-curr-active);
        border: 1px solid var(--jte-curr-active);
      }

      /** Links */
      a {
        color: var(--jte-curr-link);
      }

      /** Our mentions (this needs to be "inline" for contenteditable to work) */
      link[rel="mention"] {
        display: inline;

        cursor: default;
        user-select: none;
        font-weight: normal;
        font-style: normal;
        text-decoration: none;

        font-size: 0.85em;
        overflow: hidden;

        &:before {
          padding: 0 0.25em;
          content: '\200b'; /* zero width space */

          background-color: var(--jte-curr-mention);
          border: 1px solid var(--jte-curr-border);
          border-radius: var(--jte-curr-border-radius);
          border-right: none;
          border-top-right-radius: 0;
          border-bottom-right-radius: 0;
        }

        &:after {
          content: attr(title);
          padding: 0 0.5em 0 0.25em;

          background-color: var(--jte-curr-shade);
          border: 1px solid var(--jte-curr-border);
          border-radius: var(--jte-curr-border-radius);
          border-left: none;
          border-top-left-radius: 0;
          border-bottom-left-radius: 0;
        }
      }
    }

    /* ===== POPUPS ========================================================= */

    /** Popups basics */
    .-jte-mentions-popup, .-jte-links-popup {
      display: none;
      position: absolute;
      z-index: 1000;

      font-size: 0.85em;
      background-color: var(--jte-curr-popup);
      border-radius: var(--jte-curr-border-radius);
      border: 1px solid var(--jte-curr-border);
    }

    /* ===== MENTIONS POPUP ================================================= */

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
        color: var(--jte-curr-inactive);

        /** Inside of our mentions entry */
        .-jte-mentions-entry {
          padding-block: 0.125em;
          padding-left: 0.25em;
          padding-right: 1.5em;
          border-left-width: 0.5em;
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
          color: var(--jte-curr-input-text);
          background-color: var(--jte-curr-shade);
          border-color: var(--jte-curr-input-border);

          /** Apply our "tag" to the slected mention */
          .-jte-mentions-entry {
            border-color: var(--jte-curr-mention);
          }
        }

        /** No borders for first and last item */
        &:first-child { border-top: none; }
        &:last-child { border-bottom: none; }
      }

      /** Basic style for waiting / no item found */
      .-jte-mentions-waiting, .-jte-mentions-none {
        font-size: 0.85em;
        color: var(--jte-curr-inactive);
        border-left-width: 0.5em;
        border-left-style: solid;
        border-color: transparent;
        padding-block: 0.125em;
        padding-inline: 0.25em;
      }

      /** Waiting is in italic */
      .-jte-mentions-waiting {
        font-style: italic;
      }

      /** None has a grey tab */
      .-jte-mentions-none {
        border-color: var(--jte-curr-shade);
      }
    }

    /* ===== LINKS POPUP ==================================================== */

    .-jte-links-popup {
      user-select: none;
      padding: 0.125em;
      width: 20em;
      flex-direction: column;

      div {
        display: flex;
        flex-direction: row;
        margin: 0.25em;
        position: relative;
        background-color: var(--jte-curr-input-background);
        border-radius: var(--jte-curr-border-radius);
      }

      .-jte-icon {
        display: block;
        position: absolute;

        top: 1px;
        left: 1px;

        width: 1.25em;
        height: 1.25em;
        padding: 0.125em 0.25em;
        margin: 0;

        color: var(--jte-curr-input-text);
        background-color: var(--jte-curr-input-shade);
        border: none;
        border-radius: calc(var(--jte-curr-border-radius) - 1px);
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
        border-right: none;
      }

      input {
        display: block;
        flex-grow: 1;

        font-size: 1em;
        height: 1.25em;
        padding: 0.125em 0.25em 0.125em 2.25em;
        margin: 0;

        color: var(--jte-curr-input-text);
        border: 1px solid var(--jte-curr-input-border);
        border-radius: var(--jte-curr-border-radius);
        background-color: transparent;

        &:focus {
          outline: 1px solid var(--jte-curr-active);
          border: 1px solid var(--jte-curr-active);
        }
      }

      .-jte-error {
        .-jte-icon, input {
          color: var(--jte-curr-error);
        }
      }
    }
  }

  /* ===== TOOLBOX VISIBLE ONLY ON EDITABLE ================================= */

  &.-jte-editable {
    .-jte-editor {
      padding-bottom: 2.5em;
      margin-bottom: -2.5em;
    }

    .-jte-toolbox {
      display: flex;
    }
  }
}
</style>

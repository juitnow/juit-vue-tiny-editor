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

type FormatTag = 'b' | 'i' | 'u'
interface SelectionOffsets {
  start: number
  end: number
  backwards?: boolean
}

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
watch(html, (html) => model.value = html)

/* Watch our model, when the value is different from the local HTML, parse */
watch([ model, editor ], ([ model, editor ]) => {
  if (! editor) return // not initialized yet, ignore!
  if (model === html.value) return // no changes, ignore!

  const body = new DOMParser().parseFromString(model, 'text/html').body
  const fragment = document.createDocumentFragment()
  fragment.append(...body.childNodes)
  editor.replaceChildren(sanitize(fragment))
  commit()
})

/* ==== DOM EVENTS ========================================================== */

/** Trigger shortcuts for applying bold, italic, ... */
function onKeydown(event: KeyboardEvent): void {
  if (event.metaKey || event.ctrlKey) {
    switch (event.key) {
      case 'b':
        applyTag('b', isBold.value)
        event.preventDefault()
        break
      case 'i':
        applyTag('i', isItalic.value)
        event.preventDefault()
        break
    }
  }
}

function onPaste(event: ClipboardEvent): void {
  event.preventDefault()
  if (! selected.value) return
  if (! editor.value) return

  // Extract the pasted content as a document fragment
  const text = event.clipboardData?.getData('text/html') || ''
  const pasted = new DOMParser().parseFromString(text, 'text/html').body

  // Remove ignorable whitespace nodes
  const iterator = document.createNodeIterator(pasted, NodeFilter.SHOW_TEXT)
  for (let node = iterator.nextNode(); node; node = iterator.nextNode()) {
    if (node.nodeValue?.trim() === '') node.parentElement?.removeChild(node)
  }

  // Save our selection offsets
  const offsets = getSelectionOffsets()
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
  range.insertNode(sanitize(fragment))

  // Move caret to the end of the pasted content
  if (offsets) {
    const afterLength = editor.value.textContent?.length || 0
    const offset = offsets.end + afterLength - beforeLength
    restoreSelectionOffsets({ start: offset, end: offset })
  }

  // All done, we can commmit
  commit()
}

function onInput(_event?: Event): void {
  const event = _event as InputEvent | undefined
  console.log('AFTER INPUT', event?.inputType, event)
  commit()
}

/* ==== SELECTION & CARET  ================================================== */

/** The `Range` of the current selection, if within our editor */
const selected = shallowRef<Range & { backwards?: boolean }>()

/* Update the `selected` Range when the document selection changes */
function onSelectionChange(): void {
  const selection = document.getSelection()
  if (! selection?.rangeCount) return selected.value = undefined
  if (! editor.value) return selected.value = undefined

  const editorRange = new Range()
  editorRange.selectNodeContents(editor.value)

  const selectionRange = selection.getRangeAt(0)

  const startCheck = editorRange.intersectsNode(selectionRange.startContainer)
  const endCheck = editorRange.intersectsNode(selectionRange.endContainer)

  if (startCheck && endCheck) {
    const backwards =
        selection.isCollapsed ? false :
        selection.anchorNode === selection.focusNode ? selection.anchorOffset > selection.focusOffset :
        selection.anchorNode!.compareDocumentPosition(selection.focusNode!) === Node.DOCUMENT_POSITION_PRECEDING

    selected.value = Object.assign(selectionRange, { backwards })
  } else {
    selected.value = undefined
  }
}

onMounted(() => document.addEventListener('selectionchange', onSelectionChange))
onUnmounted(() => document.removeEventListener('selectionchange', onSelectionChange))

/* ==== SELECTION STATE ===================================================== */

/** Whether the current selection is all bold */
const isBold = shallowRef<boolean>(false)
/** Whether the current selection is all italic */
const isItalic = shallowRef<boolean>(false)

/**
 * Figure out if the current selection entirely enclosed in an element
 * with the specified tag name (normally bold, italic, ...)
 */
function isTagged(tagName: FormatTag, selected: Range | undefined): boolean {
  if (! selected) return false
  // console.log('IS TAGGED', tagName, selected)
  let parent: Node | null = selected.commonAncestorContainer
  while (parent && (parent !== editor.value)) {
    if (parent.nodeName.toLowerCase() === tagName) {
      return true
    } else {
      parent = parent.parentNode
    }
  }
  return false
}

/* Watch the selected range and infer state for bold, italic, ... */
watch(selected, (selected) => {
  emit('hasSelection', !! selected)
  isBold.value = isTagged('b', selected)
  isItalic.value = isTagged('i', selected)
}, { immediate: true })

/* Watch our bold, italic, .. states and emit */
watch(isBold, (bold) => emit('isBold', bold), { immediate: true })
watch(isItalic, (italic) => emit('isItalic', italic), { immediate: true })

/** Retrieve the current selection as character offsets within our editor */
function getSelectionOffsets(): SelectionOffsets | undefined {
  if (! editor.value) return
  if (! selected.value) return

  const result = { start: 0, end: 0, backwards: selected.value.backwards }

  const start = new Range()
  start.setStart(editor.value, 0)
  start.setEnd(selected.value.startContainer, selected.value.startOffset)
  result.start = result.end = start.toString().length

  if (selected.value.collapsed) return result

  const end = new Range()
  end.setStart(editor.value, 0)
  end.setEnd(selected.value.endContainer, selected.value.endOffset)
  result.end = end.toString().length

  return result
}

/** Restore the current selection from character offsets in the editor */
function restoreSelectionOffsets(offsets?: SelectionOffsets): void {
  if (! offsets) return
  if (! editor.value) return

  let { start, end, backwards } = offsets
  let startNode: Node = editor.value
  let startOffset: number = editor.value.childNodes.length
  let endNode: Node = startNode
  let endOffset: number = startOffset

  const iterator = document.createNodeIterator(editor.value, NodeFilter.SHOW_TEXT)
  for (let node = iterator.nextNode(); node && ((start >= 0) || (end > 0)); node = iterator.nextNode()) {
    const nodeLength = node.nodeValue?.length || 0
    if (nodeLength <= 0) continue

    // start is always calculated at the *start* of the text node
    if ((start >= 0) && (start < nodeLength)) {
      startNode = node
      startOffset = start
    }

    // end is always calculated at the *end* of the text node
    if ((end > 0) && (end <= nodeLength)) {
      endNode = node
      endOffset = end
    }

    start -= nodeLength
    end -= nodeLength
  }

  // Selection can be forwards or backwards... restore correctly
  if (backwards) {
    document.getSelection()?.setBaseAndExtent(endNode, endOffset, startNode, startOffset)
  } else {
    document.getSelection()?.setBaseAndExtent(startNode, startOffset, endNode, endOffset)
  }
}

/* ==== SANITIZATION AND FORMATTING ========================================= */

/** Sanitize a document fragment */
function sanitize(
    fragment: DocumentFragment,
): DocumentFragment {
  // Wrap a document fragment in a tag (b, i or u)
  function wrapInternal(
      fragment: DocumentFragment,
      tagName: string,
      noWrap: boolean,
  ): DocumentFragment | Element {
    if (noWrap) return fragment
    const tag = document.createElement(tagName)
    tag.append(fragment)
    return tag
  }

  // Recursively sanitize the fragment
  function sanitizeInternal(
      fragment: DocumentFragment | Element,
      isBold: boolean,
      isItalic: boolean,
  ): DocumentFragment {
    const result = document.createDocumentFragment()

    for (const node of fragment.childNodes) {
      result.normalize()

      // Text nodes are cloned if they have contents
      if (node.nodeType === Node.TEXT_NODE) {
        if ((node as Text).nodeValue) result.append(node.cloneNode())

      // Elements are processed recursively
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element
        const tagName = element.tagName.toLowerCase()

        const previous = result.lastChild?.nodeType === Node.ELEMENT_NODE ? {
          element: result.lastChild as Element,
          tagName: (result.lastChild as Element).tagName.toLowerCase(),
        } : null

        const child = document.createDocumentFragment()

        if ((tagName === 'b') || (tagName === 'strong')) {
          const fragment = sanitizeInternal(element, true, isItalic)
          if (! fragment.hasChildNodes()) continue

          if (previous?.tagName === 'b') previous.element.append(fragment)
          else child.append(wrapInternal(fragment, 'b', isBold))
        } else if ((tagName === 'i') || (tagName === 'em')) {
          const fragment = sanitizeInternal(element, isBold, true)
          if (! fragment.hasChildNodes()) continue

          if (previous?.tagName === 'i') previous.element.append(fragment)
          else child.append(wrapInternal(fragment, 'i', isItalic))
        } else if (tagName === 'br') {
          child.append(document.createTextNode('\n'))
        } else if (tagName === 'div') {
          child.append(sanitizeInternal(element, isBold, isItalic))
          child.append(document.createTextNode('\n'))
        } else if (tagName === 'p') {
          child.append(sanitizeInternal(element, isBold, isItalic))
          child.append(document.createTextNode('\n\n'))
        } else if (tagName === 'mention') {
          // Mention is a bit of a a special case (our custom element)
          const mention = document.createElement('mention')
          mention.setAttribute('contenteditable', 'false')

          // The "ref" in the mention is added only if it's present
          const ref = element.getAttribute('ref')
          if (ref) mention.setAttribute('ref', ref)

          // The value is also added only if it's present
          const value = element.textContent
          if (value) mention.append(document.createTextNode(value))

          child.append(mention)
        } else {
          child.append(sanitizeInternal(element, isBold, isItalic))
        }

        child.normalize()
        if (child.hasChildNodes()) result.append(child)
      }
    }
    return result
  }

  const result = sanitizeInternal(fragment, false, false)
  result.normalize()
  return result
}

/** Apply a "tag" (bold, italic, ...) */
function applyTag(tagName: FormatTag, remove: boolean): void {
  if (! selected.value) return
  if (! editor.value) return
  if (selected.value.collapsed) return // TODO

  const offsets = getSelectionOffsets()

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
  const selectedFragment = selected.value.extractContents()
  const beforeFragment = before.extractContents()
  range.deleteContents() // wipe everything, just in case

  // Create our fragment
  const fragment = document.createDocumentFragment()

  // Append our selected fragment, possibly wrapped in a tag
  if (remove) {
    fragment.append(selectedFragment)
  } else {
    const tag = document.createElement(tagName)
    tag.append(selectedFragment)
    fragment.append(tag)
  }

  // Surround with before and after fragments
  fragment.insertBefore(beforeFragment, fragment.firstChild)
  fragment.appendChild(afterFragment)

  // Sanitize and insert
  range.insertNode(sanitize(fragment))

  // Done! Restore selection and commit
  restoreSelectionOffsets(offsets)
  commit()
}

defineExpose({
  /** Toggle _bold_ for the current selected text */
  bold: () => applyTag('b', isBold.value),
  /** Toggle _italic_ for the current selected text */
  italic: () => applyTag('i', isItalic.value),
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

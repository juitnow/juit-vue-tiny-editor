import { containsRange, getOffsetsRange, getRangeOffsets, rangeFromContents } from './range'

import type { DirectedRange, Offsets } from './range'

/**
 * Retrieve the current selection as a {@link DirectedRange} within our editor
 *
 * @param parent The element defining the boundaries of accepatable selections
 * @returns The current selection as a {@link DirectedRange} if within the editor
 */
export function getSelectionRange(
    parent: Element,
): DirectedRange | null {
  const selection = document.getSelection()
  if (! selection?.rangeCount) return null

  const editorRange = rangeFromContents(parent)
  const selectionRange = selection.getRangeAt(0)

  if (! containsRange(editorRange, selectionRange)) return null

  const backwards =
        selection.isCollapsed ? false :
        selection.anchorNode === selection.focusNode ? selection.anchorOffset > selection.focusOffset :
        selection.anchorNode!.compareDocumentPosition(selection.focusNode!) === Node.DOCUMENT_POSITION_PRECEDING
  return Object.assign(selectionRange, { backwards })
}

/**
 * Retrieve the current selection as character {@link Offsets} within our editor
 *
 * @param parent The element defining the boundaries of accepatable selections
 * @returns The current selection as a {@link DirectedRange} if within the editor
 */
export function getSelectionOffsets(
    parent: Element,
): Offsets | null {
  const range = getSelectionRange(parent)
  return range ? getRangeOffsets(parent, range) : null
}

/**
 * Restore the current selection from character {@link Offsets} in the editor
 *
 * @param parent The element defining the boundaries of accepatable selections
 * @param offsets The character offsets to restore
 */
export function restoreSelection(
    parent: Element,
    offsets: Offsets,
): void {
  const {
    startContainer,
    startOffset,
    endContainer,
    endOffset,
    backwards,
  } = getOffsetsRange(parent, offsets)

  // Selection can be forwards or backwards... restore correctly
  if (backwards) {
    document.getSelection()?.setBaseAndExtent(endContainer, endOffset, startContainer, startOffset)
  } else {
    document.getSelection()?.setBaseAndExtent(startContainer, startOffset, endContainer, endOffset)
  }
}

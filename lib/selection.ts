import { containsRange, getOffsetsRange, getRangeOffsets } from './range'

import type { DirectedRange, Offsets } from './range'

/**
 * Retrieve the current selection as a {@link DirectedRange} within a parent
 * {@link Element}
 *
 * @param parent The element defining the boundaries of accepatable selections
 * @returns The current selection as a {@link DirectedRange} if within bounds
 */
export function getSelectionRange(
    parent: Element,
): DirectedRange | null {
  const selection = document.getSelection()
  if (! selection?.rangeCount) return null

  const selectionRange = selection.getRangeAt(0)
  if (! containsRange(parent, selectionRange)) return null

  const backwards =
        selection.isCollapsed ? false :
        selection.anchorNode === selection.focusNode ? selection.anchorOffset > selection.focusOffset :
        selection.anchorNode!.compareDocumentPosition(selection.focusNode!) === Node.DOCUMENT_POSITION_PRECEDING
  return Object.assign(selectionRange, { backwards })
}

/**
 * Retrieve the current selection as character {@link Offsets} within a parent
 * {@link Element}
 *
 * @param parent The element defining the boundaries of accepatable selections
 * @returns The current selection as a {@link DirectedRange} if within bounds
 */
export function getSelectionOffsets(
    parent: Element,
): Offsets | null {
  const range = getSelectionRange(parent)
  return range ? getRangeOffsets(parent, range) : null
}

/**
 * Restore the current selection from character {@link Offsets} in the
 * specified {@link Element}
 *
 * @param parent The element defining the boundaries of accepatable selections
 * @param offsets The character offsets to restore
 */
export function restoreSelection(
    parent: Element,
    offsets: Offsets,
    collapse = false,
): DirectedRange {
  const range = getOffsetsRange(parent, offsets)
  const { startContainer, startOffset, endContainer, endOffset, backwards } = range

  // Selection can be forwards or backwards... restore correctly
  const selection = document.getSelection()
  if (! selection) return range

  if (backwards) {
    selection.setBaseAndExtent(endContainer, endOffset, startContainer, startOffset)
  } else {
    selection.setBaseAndExtent(startContainer, startOffset, endContainer, endOffset)
  }
  if (collapse) selection.collapse(startContainer, startOffset)
  return range
}

import { containsRange, getRangeOffsets, rangeFromContents } from './range'
import { sanitize } from './sanitize'

import type { Offsets } from './range'

export function replaceRange(
    parent: Element,
    range: Range,
    html: DocumentFragment | string,
): Offsets {
  if (typeof html === 'string') {
    if (! containsRange(parent, range)) throw new Error('Range out of bounds')

    const body = new DOMParser().parseFromString(html, 'text/html').body
    html = document.createDocumentFragment()
    html.append(...body.childNodes)
  }

  // Save our selection offsets
  const offsets = getRangeOffsets(parent, range)
  const beforeLength = parent.textContent?.length || 0

  // Split into ranges (before and after)
  const parentRange = rangeFromContents(parent)

  const beforeRange = document.createRange()
  beforeRange.setStart(parentRange.startContainer, parentRange.startOffset)
  beforeRange.setEnd(range.startContainer, range.startOffset)

  const afterRange = document.createRange()
  afterRange.setStart(range.endContainer, range.endOffset)
  afterRange.setEnd(parentRange.endContainer, parentRange.endOffset)

  // Extract the content to keep
  const before = beforeRange.extractContents()
  const after = afterRange.extractContents()

  // Re-add all our content and sanitize
  parent.replaceChildren() // wipe everything
  parent.append(before, html, after)
  sanitize(parent)

  // Adjust our selection offsets depending on pasted data
  const afterLength = parent.textContent?.length || 0
  console.log('BEFORE', offsets)
  console.log('AFTER', { ...offsets, end: offsets.end + afterLength - beforeLength })
  return { ...offsets, end: offsets.end + afterLength - beforeLength }
  // offsets.end = offsets.end + afterLength - beforeLength

  // // Return a new range for the pasted content
  // return getOffsetsRange(parent, offsets)
}

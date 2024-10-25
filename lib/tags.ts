import { containsRange, rangeFromContents, rangeFromNode } from './range'
import { sanitize } from './sanitize'

/**
 * Figure out if the current selection entirely enclosed in an element
 * with the specified tag name (normally bold, italic, ...)
 *
 * @param parent The editor element (root of all the editable content)
 * @param tagName The tag name to check for (e.g. 'b', 'i', ...)
 * @param range The current selection (if any)
 * @returns The parent node with the specified tag name if found
 */
export function isTagged(
    parent: Node,
    tagName: string,
    range: Range,
): Node | null {
  // Get the parent range, and make sure the selection is within it
  const parentRange = rangeFromContents(parent)
  if (! containsRange(parent, range)) return null

  // Walk up from our common ancestor to to the parent to see if we find
  // an element with the specified tag name
  let ancestor: Node | null = range.commonAncestorContainer
  while (ancestor && parentRange.intersectsNode(ancestor)) {
    if ((ancestor.nodeType === Node.ELEMENT_NODE) &&
        (ancestor.nodeName.toLowerCase() === tagName)) {
      return ancestor
    }
    ancestor = ancestor.parentNode
  }

  // Nothing found!
  return null
}

/**
 * Toggle a tag within the specified {@link Element}, around the specified
 * selection.
 *
 * @param parent The element whose contents we are modifying
 * @param tagName The tag name (e.g. 'b', 'i', ...) to toggle
 * @param range The range to toggle the tag around
 * @param attributes Any attributes to set on the tag (will be sanitized)
 */
export function toggleTag(
    parent: Element,
    tagName: string,
    range: Range,
    attributes: Record<string, string> = {},
): void {
  if (range.collapsed) return
  if (! containsRange(parent, range)) return

  const ancestor = isTagged(parent, tagName, range)

  const ancestorRange = ancestor ?
      rangeFromNode(ancestor) :
      rangeFromContents(range.commonAncestorContainer)

  const before = document.createRange()
  before.setStart(ancestorRange.startContainer, ancestorRange.startOffset)
  before.setEnd(range.startContainer, range.startOffset)

  const after = document.createRange()
  after.setStart(range.endContainer, range.endOffset)
  after.setEnd(ancestorRange.endContainer, ancestorRange.endOffset)

  // Remove back to front...
  const afterFragment = after.extractContents()
  const selectedFragment = range.extractContents()
  const beforeFragment = before.extractContents()
  ancestorRange.deleteContents() // wipe everything, just in case

  // Create our fragment
  const fragment = document.createDocumentFragment()
  fragment.append(beforeFragment)

  // Append our selected fragment, possibly wrapped in a tag
  if (ancestor) {
    fragment.append(selectedFragment)
  } else {
    const tag = document.createElement(tagName)
    Object.entries(attributes).forEach((attr) => tag.setAttribute(...attr))
    tag.append(selectedFragment)
    fragment.append(tag)
  }

  // Surround with before and after fragments
  // fragment.insertBefore(beforeFragment, fragment.firstChild)
  fragment.append(afterFragment)

  // Sanitize and insert
  ancestorRange.insertNode(fragment)

  sanitize(parent)
}

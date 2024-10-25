import { containsRange, getOffsetsRange, getRangeOffsets, rangeFromContents } from './range'

import type { Offsets } from './range'

/** Tags that will be stripped from output */
const STRIP_TAGS = new Set([
  'button',
  'embed',
  'form',
  'iframe',
  'input',
  'object',
  'script',
  'select',
  'style',
  'textarea',
])

/**
 * Wrap a document fragment in a tag unless `noWrap` is `true`
 *
 * @param fragment The fragment to wrap
 * @param tagName The tag to wrap the fragment in
 * @param noWrap If `true`, the fragment will not be wrapped
 * @param attribues Additional attributes to add to the tag
 * @returns The wrapped fragment or the fragment itself
 */
function maybeWrap(
    fragment: DocumentFragment,
    tagName: string,
    noWrap: boolean = false,
): DocumentFragment | Element {
  if (noWrap) return fragment

  const tag = document.createElement(tagName)
  tag.append(fragment)
  return tag
}

/**
 * Sanitize a {@link Node}'s content for styles (bold, italic, ...)
 *
 * The `state` object is used to track the current state of the sanitizer: if
 * `bold` is `true`, then all nested `<b>` and `<strong>` tags will be stripped,
 * the same works for `italic` with `<i>` and `<em>`.
 *
 * @param fragment The fragment to sanitize
 * @param state The current state of the sanitizer
 * @returns The sanitized fragment
 */
function sanitizeStyles(
    parent: Node,
    state: {
      bold?: boolean,
      italic?: boolean,
    } = {},
): DocumentFragment {
  const result = document.createDocumentFragment()

  for (const node of parent.childNodes) {
    // Text nodes are cloned if they have contents
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node as Text).nodeValue) result.append(node.cloneNode())

      // Elements are processed recursively
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element
      const tagName = element.tagName.toLowerCase()

      // Strip unwanted tags
      if (STRIP_TAGS.has(tagName)) continue

      const previous = result.lastChild?.nodeType === Node.ELEMENT_NODE ? {
        element: result.lastChild as Element,
        tagName: (result.lastChild as Element).tagName.toLowerCase(),
      } : null

      const child = document.createDocumentFragment()

      // Bold / strong
      if ((tagName === 'b') || (tagName === 'strong')) {
        const fragment = sanitizeStyles(element, { ...state, bold: true })
        if (! fragment.hasChildNodes()) continue

        if (previous?.tagName === 'b') previous.element.append(fragment)
        else child.append(maybeWrap(fragment, 'b', state.bold))

        // Italic / emphasis
      } else if ((tagName === 'i') || (tagName === 'em')) {
        const fragment = sanitizeStyles(element, { ...state, italic: true })
        if (! fragment.hasChildNodes()) continue

        if (previous?.tagName === 'i') previous.element.append(fragment)
        else child.append(maybeWrap(fragment, 'i', state.italic))

        // Paragraphs, divs, line breaks
      } else if ((tagName === 'br') || (tagName === 'div') || (tagName === 'p')) {
        child.append('\n')
        const fragment = sanitizeStyles(element, state)
        if (fragment.hasChildNodes()) {
          child.append(fragment)
          child.append('\n')
        }

      // Mention is a bit of a a special case (our custom element)
      } else if (tagName === 'mention') {
        const ref = element.getAttribute('ref')
        const value = element.textContent

        if (!(value && ref)) continue // empty mentions are stripped

        const mention = document.createElement('mention')
        mention.setAttribute('contenteditable', 'false')
        mention.setAttribute('ref', ref)
        mention.append(value)

        child.append(mention)
      } else {
        child.append(sanitizeStyles(element, state))
      }

      if (child.hasChildNodes()) result.append(child)
    }
  }

  return result
}

/**
 * Find the various links in a {@link Node}, and return their offsets and hrefs.
 *
 * @param parent The {@link Node} for which links will be sanitized
 * @returns An array of offsets and related hrefs of all links
 */
function sanitizeLinks(parent: Node): (Offsets & { href: string })[] {
  // An iterator over all the <a> elements
  const iterator = document.createNodeIterator(parent, NodeFilter.SHOW_ELEMENT, (node) => {
    return node.nodeName.toLowerCase() === 'a' ?
      NodeFilter.FILTER_ACCEPT :
      NodeFilter.FILTER_SKIP
  })

  // Ranges for all our <a> elements
  const ranges = new Set<Range & { href: string }>()
  for (let node = iterator.nextNode(); node; node = iterator.nextNode()) {
    const href = (node as Element).getAttribute('href')
    if (href) ranges.add(Object.assign(rangeFromContents(node), { href }))
  }

  // Filter out any ranges that is contained within another range
  ranges.forEach((outerRange) => {
    ranges.forEach((innerRange) => {
      // Here `containsRange` returns `inner` if its the same as `outer`
      const range = containsRange(outerRange, innerRange)
      if (range && (range !== outerRange)) ranges.delete(innerRange)
    })
  })

  // Convert our ranges to offsets
  const offsets = [ ...ranges ]
      // Compute offsets for all the ranges
      .map((range) => {
        const offsets = getRangeOffsets(parent, range)
        return { ...offsets, href: range.href }
      })
      // See if we need to merge consecutive <a> with the same href
      .filter((current, i, offsets) => {
        const previous = offsets[i - 1]

        // If it ends where this starts, and the href is the same, merge
        if ((previous?.end === current.start) && (previous.href === current.href)) {
          previous.end = current.end
          return false
        }

        // Also remove any empty links
        return current.start !== current.end
      })

  // All done, return anything we found
  return offsets
}

/**
 * Strip all empty elements out from the children of a specified {@link Node}.
 *
 * @param parent The {@link Node} to sanitize
 */
function sanitizeEmpty(parent: Node): void {
  parent.normalize()

  const iterator = document.createNodeIterator(parent, NodeFilter.SHOW_ELEMENT)
  for (let node = iterator.nextNode(); node; node = iterator.nextNode()) {
    if (node.hasChildNodes()) continue
    node.parentNode?.removeChild(node)
  }
}

/**
 * Sanitize the contents of a {@link Element}  normalizing styles (bold,
 * italic, ...) and links.
 *
 * @param parent The {@link Element} to sanitize
 * @returns The same `parent` specified as an argument
 */
export function sanitize(parent: Element): Element

/**
 * Sanitize the contents of a {@link DocumentFragment}  normalizing styles
 * (bold, italic, ...) and links.
 *
 * @param parent The {@link DocumentFragment} to sanitize
 * @returns The same `parent` specified as an argument
 */
export function sanitize(parent: DocumentFragment): DocumentFragment

/**
 * Sanitize the contents of an {@link Element} or {@link DocumentFragment}
 * normalizing styles (bold, italic, ...) and links.
 *
 * @param parent The {@link Element} or {@link DocumentFragment} to sanitize
 * @returns The same `parent` specified as an argument
 */
export function sanitize(parent: Element | DocumentFragment): Element | DocumentFragment

// Overload implementation
export function sanitize(
    parent: Element | DocumentFragment,
): Element | DocumentFragment {
  // Cleanup before we start
  parent.normalize()

  // Save any and all links
  const offsets = sanitizeLinks(parent)

  // Sanitize the content and replace our contents
  const sanitized = sanitizeStyles(parent)
  parent.replaceChildren(sanitized)

  // Restore the links
  offsets.forEach((offsets) => {
    const range = getOffsetsRange(parent, offsets)
    const wrapped = range.extractContents()
    const link = document.createElement('a')
    link.setAttribute('href', offsets.href)
    link.append(wrapped)
    range.insertNode(link)
  })

  // Cleanup any empty elements which might have been introduced
  // when restoring the links above
  sanitizeEmpty(parent)

  // Return the same element we were given
  return parent
}
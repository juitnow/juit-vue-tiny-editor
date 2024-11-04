import { getOffsetsRange, getRangeOffsets, rangeFromContents } from './range'

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

/** Parse an URL and return the normalized HREF if it's a valid HTTP url */
function parseURL(string?: string | null): string | null {
  if (! string) return null
  if (! string.match(/^https?:\/\/[^\s]+$/)) return null
  try {
    return new URL(string).href
  } catch {
    return null
  }
}

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
    parent: Element,
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
      } else if (tagName === 'br') {
        child.append(document.createElement('br'))
      } else if ((tagName === 'div') || (tagName === 'p') || (tagName === 'pre') ||
                 (tagName === 'h1') || (tagName === 'h2') || (tagName === 'h3') ||
                 (tagName === 'h4') || (tagName === 'h5') || (tagName === 'h6') ||
                 (tagName === 'ul') || (tagName === 'ol') || (tagName === 'li')) {
        child.append(document.createElement('br'))
        const fragment = sanitizeStyles(element, state)
        if (fragment.hasChildNodes()) {
          child.append(fragment)
          child.append(document.createElement('br'))
        }

      // Mentions are implemented as <link rel="mention" name="..." title="...">
      } else if (tagName === 'link') {
        const rel = element.getAttribute('rel')
        if (rel !== 'mention') continue

        const name = element.getAttribute('name')
        const title = element.getAttribute('title')
        if (!(name && title)) continue

        const link = document.createElement('link')
        link.setAttribute('rel', 'mention')
        link.setAttribute('title', title)
        link.setAttribute('name', name)
        child.append(link)

      // Anything else is processed recursively (strip tag, keep contents)
      } else {
        child.append(sanitizeStyles(element, state))
      }

      if (child.hasChildNodes()) result.append(child)
    }
  }

  return result
}

/** Merge offsets with HREF (exported for tests) */
export function mergeOffsets(list: (Offsets & { href: string })[]): (Offsets & { href: string })[] {
  // Map all our offsets to an array of objects with an index
  const offsets = list.map((offset, i) => ({ ...offset, index: i }))

  // Sort by start, keep longest first, if seame, the first one has priority
  offsets.sort((a, b) => {
    return a.start < b.start ? -1 :
           a.start > b.start ? 1 :
           a.end < b.end ? 1 :
           a.end > b.end ? -1 :
           /* v8 ignore next 3 */
           a.index < b.index ? -1 :
           a.index > b.index ? 1 :
           0
  })

  // Find all ranges that are nested/overlapping within another range
  const nested = new Set<Offsets>()

  for (let i = 0; i < offsets.length; i++) {
    const outer = offsets[i]!
    for (let j = i + 1; j < offsets.length; j++) {
      const inner = offsets[j]!
      if (nested.has(inner)) continue
      if (inner.start === inner.end) nested.add(inner)
      else if ((inner.start >= outer.start) && (inner.start < outer.end)) nested.add(inner)
      else if ((inner.end >= outer.start) && (inner.end < outer.end)) nested.add(inner)
    }
  }

  // All our anchor offsets
  return offsets
      // Filter out any nested/overlapping offsets
      .filter((offset) => ! nested.has(offset))
      // Join consecutive offsets with the same href
      .filter((offset, i, offsets) => {
        const previous = offsets[i - 1]
        if ((previous?.end === offset.start) && (previous.href === offset.href)) {
          previous.end = offset.end
          return false
        } else {
          return true
        }
      })
}

/**
 * Find the various links in a {@link Node}, and return their offsets and hrefs.
 *
 * @param parent The {@link Node} for which links will be sanitized
 * @returns An array of offsets and related hrefs of all links
 */
function sanitizeLinks(parent: Element): (Offsets & { href: string })[] {
  // Process links parsed directly from the text ()
  const textRanges: (Offsets & { href: string })[] = []

  const re = /(https?:\/\/[^\s]+)/gm
  const plain = parent.textContent!
  for (let match = re.exec(plain); match; match = re.exec(plain)) {
    const text = match[1]!
    const href = parseURL(text)
    if (href) textRanges.push({ start: match.index, end: match.index + text.length, href })
  }

  // Process links parsed from <a> elements
  const linkRanges: (Offsets & { href: string })[] = []

  const iterator = document.createNodeIterator(parent, NodeFilter.SHOW_ELEMENT, (node) => {
    return node.nodeName.toLowerCase() === 'a' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
  })

  for (let node = iterator.nextNode(); node; node = iterator.nextNode()) {
    const element = node as Element

    const href = parseURL(element.getAttribute('href'))
    if (href) {
      const range = rangeFromContents(element)
      linkRanges.push({ ...getRangeOffsets(parent, range), href })
    }
  }

  return mergeOffsets([ ...textRanges, ...linkRanges ])
}

/**
 * Strip all empty elements out from the children of a specified {@link Node}.
 *
 * @param parent The {@link Element} to sanitize
 */
function sanitizeEmpty(parent: Element): void {
  parent.normalize()

  const iterator = document.createNodeIterator(parent, NodeFilter.SHOW_ELEMENT)
  for (let node = iterator.nextNode(); node; node = iterator.nextNode()) {
    if (node.nodeName.toLowerCase() === 'link') continue // mentions
    if (node.hasChildNodes()) continue // non-empty elements
    if (node.nodeName.toLowerCase() === 'br') { // keep line breaks
      node.parentNode!.replaceChild(document.createTextNode('\n'), node)
    }
    // remove empty elements
    node.parentNode?.removeChild(node)
  }

  parent.normalize()
}

/**
 * Sanitize the contents of a {@link Element}  normalizing styles (bold,
 * italic, ...) and links.
 *
 * @param parent The {@link Element} to sanitize
 * @returns The same `parent` specified as an argument
 */
export function sanitize(parent: Element): Element {
  // Edge case: empty editor
  if (parent.innerHTML === '<br>') return parent

  // Cleanup before we start
  parent.normalize()

  // Save any and all links
  const offsets = sanitizeLinks(parent)

  // Sanitize the content
  const sanitized = sanitizeStyles(parent)
  // Append a space if the last child was a link (mention)
  if (sanitized.lastChild?.nodeName.toLowerCase() === 'link') {
    sanitized.append(document.createTextNode(' '))
  }
  // Replace our contents
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

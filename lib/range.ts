/** A DOM {@link Range} with an optional flag indicating its direction */
export interface DirectedRange extends Range {
  /** If `end` should come before `start` (for user selection) */
  backwards?: boolean
}

/** Offsets for a selected region (in characters) */
export interface Offsets {
  /** The start character position */
  start: number
  /** The end character position */
  end: number
  /** If the selection is backwards */
  backwards?: boolean
}

/**
 * Figure out if the specified `needle` {@link Range} is entirely enclosed in
 * the `haystack` {@link Range} or {@link Node} and return the `haystack` if
 * true.
 *
 * @param haystack The outer range
 * @param needle The inner range
 * @returns The `needle` if it is entirely enclosed in the `haystack`
 */
export function containsRange(
    haystack: Node | Range,
    needle: Range,
): Range | null {
  if (haystack instanceof Node) haystack = rangeFromContents(haystack)

  // Check if the selection is entirely within the tag
  const inRange =
    haystack.isPointInRange(needle.startContainer, needle.startOffset) &&
    haystack.isPointInRange(needle.endContainer, needle.endOffset)

  // Return the needle if it is within the haystack
  return inRange ? needle : null
}

/**
 * Create a new {@link Range} object that selects the specified node
 *
 * @param node The node to select
 * @returns A new {@link Range} created with `selectNode(...)`
 */
export function rangeFromNode(node: Node): Range {
  const range = document.createRange()
  range.selectNode(node)
  return range
}

/**
 * Create a new {@link Range} object that selects the _contents_ of the
 * specified node
 *
 * @param node The node to select
 * @returns A new {@link Range} created with `selectNodeContents(...)`
 */
export function rangeFromContents(node: Node): Range {
  const range = document.createRange()
  range.selectNodeContents(node)
  return range
}

/**
 * Retrieve the characters contained in a parent {@link Node} up to the
 * specified {@link Node} and offset.
 */
export function getCharacters(
    parent: Node,
    child: Node,
    offset: number,
): string {
  const parentRange = rangeFromContents(parent)

  if (! parentRange.isPointInRange(child, offset)) {
    throw new Error('Range out of bounds')
  }

  const range = document.createRange()
  range.setStart(parent, 0)
  range.setEnd(child, offset)

  return range.toString()
}

/**
 * Retrieve the character {@link Offsets} for the specified {@link Range}.
 *
 * @param parent The container {@link Node} for the {@link Range}
 * @param range The {@link Range} to calculate offsets for
 * @returns The {@link Offsets} for the specified {@link Range}
 */
export function getRangeOffsets(
    parent: Node,
    range: DirectedRange,
): Offsets {
  const result = { start: 0, end: 0, backwards: range.backwards }

  result.start = result.end = getCharacters(parent, range.startContainer, range.startOffset).length
  if (range.collapsed) return result

  result.end = getCharacters(parent, range.endContainer, range.endOffset).length
  return result
}

/**
 * Return a {@link Range} for the specified character {@link Offsets}.
 *
 * @param parent The container {@link Node} for the {@link Range}
 * @returns The {@link Range} for the specified {@link Offsets}
 */
export function getOffsetsRange(
    parent: Node,
    offsets: Offsets,
): DirectedRange {
  const range: DirectedRange = rangeFromContents(parent)
  if (offsets.backwards) range.backwards = true
  let { start, end } = offsets

  let firstNode: Text | null = null
  let lastNode: Text | null = null
  let foundStart: boolean | string = false
  let foundEnd: boolean | string = false

  const iterator = document.createNodeIterator(parent, NodeFilter.SHOW_TEXT)
  for (
    let text = iterator.nextNode() as Text | null;
    text && ((start >= 0) || (end > 0));
    text = iterator.nextNode() as Text | null
  ) {
    if (! firstNode) firstNode = text
    lastNode = text

    const length = text.nodeValue!.length

    // start is always calculated at the *start* of the text node
    if ((start >= 0) && (start < length)) {
      foundStart = true
      range.setStart(text, start)
      if (start === end) {
        foundEnd = 'extra'
        range.setEnd(text, end)
        return range
      }
    }

    // end is always calculated at the *end* of the text node
    if ((end > 0) && (end <= length)) {
      foundEnd = true
      range.setEnd(text, end)
      if (end === start) {
        foundStart = 'extra'
        range.setStart(text, start)
        return range
      }
    }

    start -= length
    end -= length
  }

  if ((! foundStart) && (firstNode)) range.setStart(firstNode, 0)
  if ((! foundEnd) && (lastNode)) range.setEnd(lastNode, lastNode.length)

  return range
}

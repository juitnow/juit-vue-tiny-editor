/** A DOM {@link Range} with an optional flag indicating its direction */
export interface DirectedRange extends Range {
  /** If `end` should come before `start` (for user selection) */
  backwards?: boolean
}

/** Offsets for a selected region in our editor */
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
  const range = new Range()
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
  const range = new Range()
  range.selectNodeContents(node)
  return range
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
  if (! containsRange(parent, range)) throw new Error('Range outside editor')

  const result = { start: 0, end: 0, backwards: range.backwards }

  const start = new Range()
  start.setStart(parent, 0)
  start.setEnd(range.startContainer, range.startOffset)
  result.start = result.end = start.toString().length

  if (range.collapsed) return result

  const end = new Range()
  end.setStart(parent, 0)
  end.setEnd(range.endContainer, range.endOffset)
  result.end = end.toString().length

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

  const iterator = document.createNodeIterator(parent, NodeFilter.SHOW_TEXT)
  for (
    let text = iterator.nextNode() as Text | null;
    text && ((start >= 0) || (end > 0));
    text = iterator.nextNode() as Text | null
  ) {
    const length = text.nodeValue!.length

    // start is always calculated at the *start* of the text node
    if ((start >= 0) && (start < length)) {
      range.setStart(text, start)
    }

    // end is always calculated at the *end* of the text node
    if ((end > 0) && (end <= length)) {
      range.setEnd(text, end)
    }

    start -= length
    end -= length
  }

  return range
}

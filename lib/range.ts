/**
 * Figure out if the specified `needle` `Range` is entirely enclosed in the
 * `haystack` `Range` and return the `haystack` if true.
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

  // Returns the range if it is within the editor
  return inRange ? needle : null
}

/**
 * Create a new `Range` object that selects the specified node
 *
 * @param node The node to select
 * @returns A new `Range` object that selects the specified node
 */
export function rangeFromNode(node: Node): Range {
  const range = new Range()
  range.selectNode(node)
  return range
}

/**
 * Create a new `Range` object that selects the contents of the specified node
 *
 * @param node The node to select
 * @returns A new `Range` object that selects the contents of the specified node
 */
export function rangeFromContents(node: Node): Range {
  const range = new Range()
  range.selectNodeContents(node)
  return range
}

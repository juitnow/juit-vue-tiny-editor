import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { containsRange, getOffsetsRange, getRangeOffsets, rangeFromContents, rangeFromNode } from './range'

describe('Range', () => {
  let before: Text
  let after: Text
  let content: Text
  let editor: HTMLElement

  beforeAll(() => {
    before = document.createTextNode('before')
    after = document.createTextNode('after')

    content = document.createTextNode('content')
    editor = document.createElement('div')
    editor.append(content)

    document.body.append(before, editor, after)
  })

  afterAll(() => {
    document.body.innerHTML = ''
  })

  it('should create a range for an element contents', () => {
    const range = rangeFromContents(editor)
    expect(range.startContainer).toBe(editor)
    expect(range.endContainer).toBe(editor)
    expect(range.startOffset).toBe(0)
    expect(range.endOffset).toBe(1)
  })

  it('should create a range for an element', () => {
    const range = rangeFromNode(editor)
    expect(range.startContainer).toBe(document.body)
    expect(range.endContainer).toBe(document.body)
    expect(range.startOffset).toBe(1)
    expect(range.endOffset).toBe(2)
  })

  it('should check if a range contains another range', () => {
    const outer = rangeFromContents(editor)
    expect(containsRange(outer, outer)).toBe(outer)

    const inner = rangeFromContents(content)
    expect(containsRange(outer, inner)).toBe(inner)

    inner.setStart(before, 3) // expands before the range
    expect(containsRange(outer, inner)).toBe(null)

    inner.setEnd(after, 3) // expands before AND after the range
    expect(containsRange(outer, inner)).toBe(null)

    inner.setStart(content, 3) // expands after the range
    expect(containsRange(outer, inner)).toBe(null)

    inner.setEnd(content, 3) // collapsed in the range
    expect(containsRange(outer, inner)).toBe(inner)
  })

  it('should check if an element contains a range', () => {
    const outer = rangeFromContents(editor)
    expect(containsRange(editor, outer)).toBe(outer)

    const inner = rangeFromContents(content)
    expect(containsRange(editor, inner)).toBe(inner)

    inner.setStart(before, 3) // expands before the range
    expect(containsRange(editor, inner)).toBe(null)

    inner.setEnd(after, 3) // expands before AND after the range
    expect(containsRange(editor, inner)).toBe(null)

    inner.setStart(content, 3) // expands after the range
    expect(containsRange(editor, inner)).toBe(null)

    inner.setEnd(content, 3) // collapsed in the range
    expect(containsRange(editor, inner)).toBe(inner)
  })

  it('should return the offsets for a range', () => {
    const range = rangeFromContents(editor)
    const offsets = getRangeOffsets(editor, range)
    expect(offsets).toEqual({ start: 0, end: 'content'.length })

    range.setStart(content, 3)
    range.collapse(true) // collapsed at the start
    const offsets2 = getRangeOffsets(editor, Object.assign(range, { backwards: true }))
    expect(offsets2).toEqual({ start: 3, end: 3, backwards: true })
  })

  it('should not calculate offsets when a range is outside the editor', () => {
    const range = rangeFromContents(editor)
    range.setStart(before, 3)
    range.setEnd(after, 3)
    expect(() => getRangeOffsets(editor, range)).toThrow('Range out of bounds')
  })

  it('should calculate the correct range from some offsets', () => {
    const offsets = { start: 3, end: 6, backwards: true }
    const range = getOffsetsRange(editor, offsets)
    expect(range.startContainer).toBe(content)
    expect(range.startOffset).toBe(3)
    expect(range.endContainer).toBe(content)
    expect(range.endOffset).toBe(6)
    expect(range.backwards).toBe(true)
  })

  it('should calculate the correct range from some offsets', () => {
    const offsets = { start: 18, end: 18, backwards: false }
    const range = getOffsetsRange(document.body, offsets)
    expect(range.startContainer).toBe(after)
    expect(range.startOffset).toBe(5)
    expect(range.endContainer).toBe(after)
    expect(range.endOffset).toBe(5)
    expect(range.backwards).toBeUndefined()
  })

  it('should not go beyond the extend of the element when offsets are wonky', () => {
    const offsets = { start: -123, end: 123, backwards: false }
    const range = getOffsetsRange(editor, offsets)
    expect(range.startContainer).toBe(editor)
    expect(range.startOffset).toBe(0)
    expect(range.endContainer).toBe(editor)
    expect(range.endOffset).toBe(1)
    expect(range.backwards).toBeUndefined()
  })
})

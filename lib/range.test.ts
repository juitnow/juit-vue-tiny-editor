import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { containsRange, rangeFromContents, rangeFromNode } from './range'

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
})

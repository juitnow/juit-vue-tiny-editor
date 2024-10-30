import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getSelectionOffsets, getSelectionRange, restoreSelection } from '../lib/selection'

describe('Selection', () => {
  const selection = document.getSelection()!
  let before: Text
  let after: Text
  let content: Text
  let editor: HTMLElement

  beforeAll(() => {
    if (! selection) throw new Error('No selection available')

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

  it('should not get the selection when outside of the parent', () => {
    selection.setBaseAndExtent(before, 3, after, 3)
    expect(getSelectionRange(editor)).toBeNull()
    expect(getSelectionOffsets(editor)).toBeNull()
    expect(getSelectionRange(document.body)).toBeDefined()

    selection.setBaseAndExtent(before, 3, content, 1)
    expect(getSelectionRange(editor)).toBeNull()
    expect(getSelectionOffsets(editor)).toBeNull()
    expect(getSelectionRange(document.body)).toBeDefined()

    selection.removeAllRanges()
    expect(getSelectionRange(editor)).toBeNull()
    expect(getSelectionOffsets(editor)).toBeNull()
    expect(getSelectionRange(document.body)).toBeNull()
  })

  it('should get the selection when inside the parent (collapsed)', () => {
    selection.setBaseAndExtent(content, 1, content, 1)
    const range = getSelectionRange(editor)
    expect(range).toBeDefined()
    expect(range!.startContainer).toBe(content)
    expect(range!.endContainer).toBe(content)
    expect(range!.startOffset).toBe(1)
    expect(range!.endOffset).toBe(1)
    expect(range!.collapsed).toBe(true)
    expect(range!.backwards).toBe(false)

    expect(getSelectionOffsets(editor)).toEqual({ start: 1, end: 1, backwards: false })
  })

  it('should get the selection when inside the parent (forwards)', () => {
    selection.setBaseAndExtent(content, 1, content, 4)
    const range = getSelectionRange(editor)
    expect(range).toBeDefined()
    expect(range!.startContainer).toBe(content)
    expect(range!.endContainer).toBe(content)
    expect(range!.startOffset).toBe(1)
    expect(range!.endOffset).toBe(4)
    expect(range!.collapsed).toBe(false)
    expect(range!.backwards).toBe(false)

    expect(getSelectionOffsets(editor)).toEqual({ start: 1, end: 4, backwards: false })
  })

  it('should get the selection when inside the parent (backwards)', () => {
    selection.setBaseAndExtent(content, 4, content, 1)
    const range = getSelectionRange(editor)
    expect(range).toBeDefined()
    expect(range!.startContainer).toBe(content)
    expect(range!.endContainer).toBe(content)
    expect(range!.startOffset).toBe(1)
    expect(range!.endOffset).toBe(4)
    expect(range!.collapsed).toBe(false)
    expect(range!.backwards).toBe(true)

    expect(getSelectionOffsets(editor)).toEqual({ start: 1, end: 4, backwards: true })
  })

  it('should compare node positions when selection spans across nodes (forwards)', () => {
    selection.setBaseAndExtent(before, 3, after, 4)
    const range = getSelectionRange(document.body)
    expect(range).toBeDefined()
    expect(range!.startContainer).toBe(before)
    expect(range!.endContainer).toBe(after)
    expect(range!.startOffset).toBe(3)
    expect(range!.endOffset).toBe(4)
    expect(range!.collapsed).toBe(false)
    expect(range!.backwards).toBe(false)

    expect(getSelectionOffsets(document.body)).toEqual({ start: 3, end: 17, backwards: false })
  })

  it('should compare node positions when selection spans across nodes (backwards)', () => {
    selection.setBaseAndExtent(after, 4, before, 3)
    const range = getSelectionRange(document.body)
    expect(range).toBeDefined()
    expect(range!.startContainer).toBe(before)
    expect(range!.endContainer).toBe(after)
    expect(range!.startOffset).toBe(3)
    expect(range!.endOffset).toBe(4)
    expect(range!.collapsed).toBe(false)
    expect(range!.backwards).toBe(true)

    expect(getSelectionOffsets(document.body)).toEqual({ start: 3, end: 17, backwards: true })
  })

  it('should restore the selection from offsets', () => {
    selection.removeAllRanges()

    restoreSelection(document.body, { start: 3, end: 17, backwards: false })
    expect(selection.anchorNode).toBe(before)
    expect(selection.focusNode).toBe(after)
    expect(selection.anchorOffset).toBe(3)
    expect(selection.focusOffset).toBe(4)

    restoreSelection(document.body, { start: 3, end: 17, backwards: true })
    expect(selection.anchorNode).toBe(after)
    expect(selection.focusNode).toBe(before)
    expect(selection.anchorOffset).toBe(4)
    expect(selection.focusOffset).toBe(3)
  })

  it('should restore the selection from invalid offsets', () => {
    selection.removeAllRanges()

    restoreSelection(document.body, { start: -123, end: 123 })
    expect(selection.anchorNode).toBe(before)
    expect(selection.focusNode).toBe(after)
    expect(selection.anchorOffset).toBe(0)
    expect(selection.focusOffset).toBe(5)
  })
})

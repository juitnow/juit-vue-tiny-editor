import { describe, expect, it } from 'vitest'

import { replaceRange } from './replace'

import type { DirectedRange } from './range'

describe('Replace', () => {
  it('should replace some content and sanitize', () => {
    const before = document.createTextNode('before')
    const after = document.createTextNode('after')

    const content = document.createTextNode('content')
    const styled = document.createElement('b')
    styled.append(content)

    const editor = document.createElement('div')
    editor.append(before, styled, after)

    const range: DirectedRange = document.createRange()
    range.setStart(before, 3)
    range.setEnd(after, 3)
    range.backwards = true

    const html = `
      <script>1</script>
      <b>2</b><b>3</b>
      <a name="foo">4</a>
      <a href="bar">5</a>
    `

    const result = replaceRange(editor, range, html)

    expect(editor.innerHTML).toBe('bef<b>23</b>4<a href="bar">5</a>er')
    expect(result.startContainer.nodeValue).toBe('23') // first text inserted after stripping "script"
    expect(result.startOffset).toBe(0)
    expect(result.endContainer.nodeValue).toBe('5') // last text inserted
    expect(result.endOffset).toBe(1)
    expect(result.backwards).toBe(true)
  })

  it('should insert and wipe some content', () => {
    const element = document.createElement('div')

    const range = document.createRange()
    range.setStart(element, 0)
    range.setEnd(element, 0)

    const result1 = replaceRange(element, range, '<i>new</i>')
    expect(element.innerHTML).toBe('<i>new</i>')
    expect(result1.startContainer.nodeValue).toBe('new')
    expect(result1.startOffset).toBe(0)
    expect(result1.endContainer.nodeValue).toBe('new')
    expect(result1.endOffset).toBe(3)

    const result2 = replaceRange(element, result1, '')
    expect(element.innerHTML).toBe('')
    expect(result2.startContainer).toBe(element)
    expect(result2.startOffset).toBe(0)
    expect(result2.endContainer).toBe(element)
    expect(result2.endOffset).toBe(0)
  })

  it('should fail when range is out of bounds some content', () => {
    const before = document.createTextNode('before')
    const after = document.createTextNode('after')

    const content = document.createTextNode('content')
    const element = document.createElement('div')
    element.append(content)

    const range = document.createRange()
    range.setStart(before, 3)
    range.setEnd(after, 3)

    expect(() => replaceRange(element, range, 'foobar')).toThrow('Range out of bounds')
  })
})

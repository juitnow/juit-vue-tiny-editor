import { describe, expect, it } from 'vitest'

import { getOffsetsRange } from './range'
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

    const html = '<script>1</script><b>2</b><b>3</b>&nbsp;<a name="foo">4</a><a href="http://bar">5</a>'

    const result = replaceRange(editor, range, html)

    expect(editor.innerHTML).toBe('bef<b>23</b>&nbsp;4<a href="http://bar/">5</a>er')
    expect(result).toEqual({ start: 3, end: 8, backwards: true })
  })

  it('should insert and wipe some content', () => {
    const element = document.createElement('div')

    const range1 = document.createRange()
    range1.setStart(element, 0)
    range1.setEnd(element, 0)

    const result1 = replaceRange(element, range1, '<i>new</i>')
    expect(element.innerHTML).toBe('<i>new</i>')
    expect(result1).toEqual({ start: 0, end: 3 })

    const range2 = getOffsetsRange(element, result1)

    const result2 = replaceRange(element, range2, '')
    expect(element.innerHTML).toBe('')
    expect(result2).toEqual({ start: 0, end: 0 })
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

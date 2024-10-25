import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { isTagged, toggleTag } from './tags'

describe('Tags', () => {
  let before: Text
  let after: Text
  let content: Text
  let styled: HTMLElement

  beforeEach(() => {
    before = document.createTextNode('before')
    after = document.createTextNode('after')

    content = document.createTextNode('content')
    styled = document.createElement('b')
    styled.append(content)

    document.body.append(before, styled, after)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('should recognize when a range is tagged', () => {
    const range = document.createRange()
    range.setStart(content, 0)
    range.setEnd(content, content.length)

    expect(isTagged(document.body, 'b', range)).toBe(styled)
    expect(isTagged(styled, 'b', range)).toBe(styled)

    range.setStart(before, 3)
    range.setEnd(after, 3)

    expect(isTagged(document.body, 'b', range)).toBe(null)
    expect(isTagged(styled, 'b', range)).toBe(null)
  })

  it('should add a tag', () => {
    const range = document.createRange()
    range.setStart(content, 0)
    range.setEnd(content, content.length)

    toggleTag(document.body, 'i', range)

    expect(document.body.innerHTML).toBe('before<b><i>content</i></b>after')
  })

  it('should add a tag with some attributes', () => {
    const range = document.createRange()
    range.setStart(content, 0)
    range.setEnd(content, content.length)

    toggleTag(document.body, 'a', range, { href: 'https://example.com', name: 'example' })

    expect(document.body.innerHTML).toBe('before<b><a href="https://example.com">content</a></b>after')
  })

  it('should remove a tag', () => {
    const range = document.createRange()
    range.setStart(content, 0)
    range.setEnd(content, content.length)

    toggleTag(document.body, 'b', range)

    expect(document.body.innerHTML).toBe('beforecontentafter')
  })

  it('should tag a range intersecting another tag', () => {
    const range = document.createRange()
    range.setStart(before, 3)
    range.setEnd(content, 3)

    toggleTag(document.body, 'i', range)

    expect(document.body.innerHTML).toBe('bef<i>ore<b>con</b></i><b>tent</b>after')
  })

  it('should not tag outside of our element', () => {
    const range = document.createRange()
    range.setStart(before, 3)
    range.setEnd(content, 3)

    toggleTag(styled, 'i', range)

    expect(document.body.innerHTML).toBe('before<b>content</b>after')
  })

  it('should not tag when the range is collapsed', () => {
    const range = document.createRange()
    range.setStart(content, 3)
    range.setEnd(content, 3)

    toggleTag(document.body, 'i', range)

    expect(document.body.innerHTML).toBe('before<b>content</b>after')
  })
})

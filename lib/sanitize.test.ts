import { describe, expect, it } from 'vitest'

import { sanitize as sanitizeElement } from './sanitize'

function sanitize(html: string): string {
  const element = document.createElement('div')
  element.innerHTML = html

  sanitizeElement(element)
  return element.innerHTML
}

describe('HTML Sanitizer', () => {
  it('should strip unwanted tags', () => {
    expect(sanitize('<script>1</script>')).toEqual('')
    expect(sanitize('1<script>2</script>3')).toEqual('13')
    expect(sanitize('1<script>2<b>3</b>4</script>5')).toEqual('15')
  })

  it('should preserve content for unknown tags', () => {
    expect(sanitize('<span>1</span>')).toEqual('1')
    expect(sanitize('1<span>2</span>3')).toEqual('123')
    expect(sanitize('1<span>2<b>3</b>4</span>5')).toEqual('12<b>3</b>45')
    expect(sanitize('1<b>2<span>3</span>4</b>5')).toEqual('1<b>234</b>5')
  })

  it('should normalize nested <b> and <i> tags', () => {
    expect(sanitize('1<b>2<b>3</b>4</b>5')).toEqual('1<b>234</b>5')
    expect(sanitize('1<b>2<strong>3</strong>4</b>5')).toEqual('1<b>234</b>5')
    expect(sanitize('1<strong>2<b>3</b>4</strong>5')).toEqual('1<b>234</b>5')

    expect(sanitize('1<i>2<i>3</i>4</i>5')).toEqual('1<i>234</i>5')
    expect(sanitize('1<i>2<em>3</em>4</i>5')).toEqual('1<i>234</i>5')
    expect(sanitize('1<em>2<i>3</i>4</em>5')).toEqual('1<i>234</i>5')
  })

  it('should join contiguous <b> and <i> tags', () => {
    expect(sanitize('1<b>2</b><b>3</b>4')).toEqual('1<b>23</b>4')
    expect(sanitize('1<b>2</b><strong>3</strong>4')).toEqual('1<b>23</b>4')
    expect(sanitize('1<strong>2</strong><b>3</b>4')).toEqual('1<b>23</b>4')

    expect(sanitize('1<i>2</i><i>3</i>4')).toEqual('1<i>23</i>4')
    expect(sanitize('1<i>2</i><em>3</em>4')).toEqual('1<i>23</i>4')
    expect(sanitize('1<em>2</em><i>3</i>4')).toEqual('1<i>23</i>4')
  })

  it('should strip empty <b> and <i> tags', () => {
    expect(sanitize('1<b></b>2')).toEqual('12')
    expect(sanitize('1<strong></strong>2')).toEqual('12')

    expect(sanitize('1<i></i>2')).toEqual('12')
    expect(sanitize('1<em></em>2')).toEqual('12')
  })

  it('should replace <p>, <div> and <br> tags with newlines', () => {
    expect(sanitize('1<div></div>2')).toEqual('1\n2')
    expect(sanitize('1<div>2</div>3')).toEqual('1\n2\n3')

    expect(sanitize('1<p></p>2')).toEqual('1\n2')
    expect(sanitize('1<p>2</p>3')).toEqual('1\n2\n3')

    expect(sanitize('1<br>2')).toEqual('1\n2')
  })

  it('should sanitize links', () => {
    expect(sanitize('1<a href="http://foo" name="bar">2</a>3'))
        .toEqual('1<a href="http://foo/">2</a>3')
    expect(sanitize('1<a href="http://foo">2</a><a href="http://bar">3</a>4'))
        .toEqual('1<a href="http://foo/">2</a><a href="http://bar/">3</a>4')
    expect(sanitize('1<a href="http://foo">2</a>3<a href="http://foo">4</a>5'))
        .toEqual('1<a href="http://foo/">2</a>3<a href="http://foo/">4</a>5')
  })

  it('should preserve formatting across links', () => {
    expect(sanitize('1<b>2</b><a href="http://foo"><b>3</b>4</a>5'))
        .toEqual('1<b>2</b><a href="http://foo/"><b>3</b>4</a>5')
    // this shoud basically rewrite links as "top level" elements
    expect(sanitize('1<a href="http://foo">2</a><b><a href="http://foo">3</a>4</b>5'))
        .toEqual('1<a href="http://foo/">2<b>3</b></a><b>4</b>5')
  })

  it('should strip empty links', () => {
    expect(sanitize('1<a></a>2')).toEqual('12')
    expect(sanitize('1<a><b></b></a>2')).toEqual('12')
    expect(sanitize('1<a href="http://foo"></a>2')).toEqual('12')
    expect(sanitize('1<a href="http://foo"><b></b></a>2')).toEqual('12')
  })

  it('should strip links with invalid or missing hrefs', () => {
    expect(sanitize('1<a href="foo">2</a>3')).toEqual('123')
    expect(sanitize('1<a href="foo"><b>2</b></a>3')).toEqual('1<b>2</b>3')
    expect(sanitize('1<a name="foo">2</a>3')).toEqual('123')
    expect(sanitize('1<a name="foo"><b>2</b></a>3')).toEqual('1<b>2</b>3')
    expect(sanitize('1<a>2</a>3')).toEqual('123')
    expect(sanitize('1<a>2<b></b>3</a>4')).toEqual('1234')
    expect(sanitize('1<a>2<b>3</b>4</a>5')).toEqual('12<b>3</b>45')
  })

  it('should join contiguous links', () => {
    expect(sanitize('1<a href="http://foo">2</a><a href="http://foo">3</a>4')).toEqual('1<a href="http://foo/">23</a>4')
  })

  it('should wipe nested links', () => {
    // this is an edge case, as the parser won't normally allow this
    const inner = document.createElement('a')
    inner.setAttribute('href', 'http://inner')
    inner.setAttribute('name', 'remove-this')
    inner.append('nested')

    const outer = document.createElement('a')
    outer.setAttribute('href', 'http://outer')
    inner.setAttribute('name', 'remove-this')
    outer.append('before')
    outer.append(inner)
    outer.append('after')

    const element = document.createElement('div')
    element.append('prefix')
    element.append(outer)
    element.append('suffix')

    sanitizeElement(element)

    expect(element.innerHTML).toEqual('prefix<a href="http://outer/">beforenestedafter</a>suffix')
  })

  it('should add links from text', () => {
    // This is an invalid URL
    expect(sanitize('1 https://: 2')).toEqual('1 https://: 2')

    // This will be normalized with an extra "/" at the end
    expect(sanitize('1 http://example.com 2'))
        .toEqual('1 <a href="http://example.com/">http://example.com</a> 2')

    // A text link wrapped in an <a> tag should be ignored
    expect(sanitize('1<a href="http://example.com">https://www.juit.com/</a>2'))
        .toEqual('1<a href="http://example.com/">https://www.juit.com/</a>2')

    // A text link wrapped in an <a> tag should be ignored
    expect(sanitize('http://foo http://bar'))
        .toEqual('<a href="http://foo/">http://foo</a> <a href="http://bar/">http://bar</a>')
  })

  it('should strp empty or invalid mentions', () => {
    expect(sanitize('1<mention></mention>2')).toEqual('12')
    expect(sanitize('1<mention ref="2"></mention>3')).toEqual('13')
    expect(sanitize('1<mention>2</mention>3')).toEqual('13')
  })

  it('should sanitize mentions', () => {
    expect(sanitize('1<mention ref="2" foo="bar">3</mention>4'))
        .toEqual('1<mention contenteditable="false" ref="2">3</mention>4')
  })
})

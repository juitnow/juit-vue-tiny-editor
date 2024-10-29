import { describe, expect, it } from 'vitest'

import { Editor } from './index'

describe('Editor', () => {
  it('should expose a Vue component', () => {
    expect(Editor).toBeDefined()
    expect(Editor.props).toBeDefined()
    expect(Editor.emits).toBeDefined()
    expect(Editor.setup).toBeDefined()
  })
})

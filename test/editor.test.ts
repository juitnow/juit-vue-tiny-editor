import { describe, expect, it } from 'vitest'

import TinyEdit from '../lib/index'

describe('Editor', () => {
  it('should expose a Vue component', () => {
    expect(TinyEdit).toBeDefined()
    expect(TinyEdit.props).toBeDefined()
    expect(TinyEdit.emits).toBeDefined()
    expect(TinyEdit.setup).toBeDefined()
  })
})

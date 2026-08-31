import { describe, expect, test } from 'bun:test'
import { Flag } from './flag'

describe('Flag', () => {
  test('parses aliases, defaults, booleans, and positionals with Go-style signatures', () => {
    const flag = new Flag()
    const verbose = flag.bool('v/verbose', false, 'verbose output')
    const count = flag.number('count', 3, 'count')
    const query = flag.string('q/query+', '', 'query')

    flag.parse([
      'input',
      '/verbose:false',
      '/query:first',
      '/count:0',
      '/q:second',
    ])

    expect(verbose.value).toBe(true)
    expect(count.value).toBe(0)
    expect(query.value).toEqual(['first', 'second'])
    expect(flag.argv()).toEqual([{ pos: 0, value: 'input' }])
  })

  test('uses the last scalar occurrence and defaults when absent', () => {
    const flag = new Flag()
    const count = flag.number('count', 1, 'count')
    const name = flag.string('name', '', 'name')

    flag.parse(['/count:2', '/count:4'])
    expect(count.value).toBe(4)
    expect(name.value).toBe('')
  })

  test('resets values on each parse', () => {
    const flag = new Flag()
    const count = flag.number('count', 1, 'count')

    flag.parse(['/count:5'])
    flag.parse([])
    expect(count.value).toBe(1)
  })

  test('atomic parsing: does not partially update values when parsing fails', () => {
    const flag = new Flag()
    const count = flag.number('count', 1, 'count')
    flag.parse(['/count:5'])

    expect(() => flag.parse(['/count:not-a-number'])).toThrow()
    expect(count.value).toBe(5)
  })

  describe('Validation and Name Rules', () => {
    test('rejects empty alias in name', () => {
      const flag = new Flag()
      expect(() => flag.bool('invalid/', false, 'invalid')).toThrow('flag names cannot be empty')
      expect(() => flag.bool('/invalid', false, 'invalid')).toThrow('flag names cannot be empty')
    })

    test('rejects duplicate alias in the same flag definition', () => {
      const flag = new Flag()
      expect(() => flag.bool('l/l', false, 'duplicate self')).toThrow('duplicate alias in flag name')
      expect(() => flag.string('list/l/list', '', 'duplicate self')).toThrow('duplicate alias in flag name')
    })

    test('rejects duplicate flag names across registrations', () => {
      const flag = new Flag()
      flag.bool('constructor', false, 'valid name')
      expect(() => flag.bool('constructor', false, 'duplicate')).toThrow('duplicate flag name: constructor')
    })

    test('rejects combining + and ? modifiers', () => {
      const flag = new Flag()
      expect(() => flag.string('t+?', '', 'invalid combo')).toThrow('cannot combine + and ? modifiers')
      expect(() => flag.string('t?+', '', 'invalid combo')).toThrow('cannot combine + and ? modifiers')
    })

    test('rejects invalid characters in flag name', () => {
      const flag = new Flag()
      expect(() => flag.bool('inv@lid', false, 'invalid')).toThrow('name must contain only letters, numbers, or hyphens')
      expect(() => flag.string('l?/list', '', 'misplaced modifier')).toThrow('name must contain only letters, numbers, or hyphens')
    })
  })

  describe('Optional Flags (?)', () => {
    test('handles optional string flags', () => {
      const flag = new Flag()
      const list = flag.string('l/list?', 'all', 'show list')

      // 1. Initial / unprovided state
      expect(list.value).toBeUndefined()

      // 2. Empty parse retains undefined
      flag.parse([])
      expect(list.value).toBeUndefined()

      // 3. Flag provided without value -> assumes default/implicit value
      flag.parse(['/l'])
      expect(list.value).toBe('all')

      // 4. Flag provided with custom value -> uses custom value
      flag.parse(['/list:new'])
      expect(list.value).toBe('new')
    })

    test('handles optional number flags', () => {
      const flag = new Flag()
      const limit = flag.number('limit?', 10, 'page limit')

      expect(limit.value).toBeUndefined()

      flag.parse(['/limit'])
      expect(limit.value).toBe(10)

      flag.parse(['/limit:50'])
      expect(limit.value).toBe(50)
    })

    test('throws error if optional flag is passed with empty separator (:)', () => {
      const flag = new Flag()
      flag.string('l/list?', 'all', 'show list')

      expect(() => flag.parse(['/l:'])).toThrow('l requires a value')
    })
  })

  describe('Multi-value Flags (+)', () => {
    test('accepts zero values when default is zero-value', () => {
      const flag = new Flag()
      const query = flag.string('q/query+', '', 'query')
      flag.parse([])
      expect(query.value).toEqual([])
    })

    test('handles multiple flag with non-zero default value properly', () => {
      const flag = new Flag()
      const tags = flag.string('t/tag+', 'default-tag', 'tags')

      // When no args provided, uses default array
      flag.parse([])
      expect(tags.value).toEqual(['default-tag'])

      // When args provided, overrides the default
      flag.parse(['/t:one', '/tag:two'])
      expect(tags.value).toEqual(['one', 'two'])

      // Resets back to default on empty parse
      flag.parse([])
      expect(tags.value).toEqual(['default-tag'])
    })
  })

  describe('Number Parsing', () => {
    test('parses negative and decimal numbers correctly', () => {
      const flag = new Flag()
      const temp = flag.number('temp', 0, 'temperature')
      const ratio = flag.number('ratio', 0, 'ratio')

      flag.parse(['/temp:-15.5', '/ratio:.75'])
      expect(temp.value).toBe(-15.5)
      expect(ratio.value).toBe(0.75)
    })

    test('parses scientific and hex numbers correctly', () => {
      const flag = new Flag()
      const sci = flag.number('sci', 0, 'scientific')
      const hex = flag.number('hex', 0, 'hexadecimal')

      flag.parse(['/sci:1e5', '/hex:0xff'])
      expect(sci.value).toBe(100000)
      expect(hex.value).toBe(255)
    })

    test('throws on non-numeric strings', () => {
      const flag = new Flag()
      flag.number('count', 0, 'count')

      expect(() => flag.parse(['/count:abc'])).toThrow('Not a number: abc')
      expect(() => flag.parse(['/count:'])).toThrow('count requires a value')
    })
  })

  describe('Positional Arguments & -- Delimiter', () => {
    test('collects positional arguments with position index', () => {
      const flag = new Flag()
      const verbose = flag.bool('v', false, 'verbose')

      flag.parse(['foo', '/v', 'bar'])
      expect(verbose.value).toBe(true)
      expect(flag.argv()).toEqual([
        { pos: 0, value: 'foo' },
        { pos: 2, value: 'bar' },
      ])
    })

    test('stops parsing flags after --', () => {
      const flag = new Flag()
      const verbose = flag.bool('v/verbose', false, 'verbose')

      flag.parse(['/verbose', '--', '/etc/passwd', '/not-a-flag'])

      expect(verbose.value).toBe(true)
      expect(flag.argv()).toEqual([
        { pos: 2, value: '/etc/passwd' },
        { pos: 3, value: '/not-a-flag' },
      ])
    })
  })

  describe('Help and Usage Formatting', () => {
    test('formats help output correctly (omits falsy defaults, includes non-zero and optional defaults)', () => {
      const flag = new Flag()
      flag.bool('v/verbose', false, 'enable verbose')
      flag.number('count', 1, 'repeat count')
      flag.string('name', '', 'user name')
      flag.string('q/query+', '', 'search queries')
      flag.string('l/list?', 'all', 'list items')

      const usageString = flag.usage()

      // Zero-value defaults (false, '', 0) should NOT display [default=...]
      expect(usageString).toContain('/?, /h, /help')
      expect(usageString).toContain('/v, /verbose')
      expect(usageString).not.toContain('/v, /verbose        enable verbose [default=')
      expect(usageString).toContain('/name:string')
      expect(usageString).not.toContain('/name:string         user name [default=')

      // Non-zero defaults and optional flags SHOULD display [default=...]
      expect(usageString).toContain('/count:number')
      expect(usageString).toContain('repeat count [default=1]')
      expect(usageString).toContain('/q, /query:string...')
      expect(usageString).toContain('/l, /list:string?')
      expect(usageString).toContain('list items [default=all]')
    })

    test('auto-registers help and exits on parse', () => {
      const flag = new Flag()
      flag.number('count', 1, 'repeat count')
      flag.help(`my-cli\n${flag.usage()}`)

      const logs: string[] = []
      const originalLog = console.log
      console.log = (...args: unknown[]) => {
        logs.push(args.join(' '))
      }

      let exitCalled = false
      const originalExit = process!.exit
      process!.exit = (code?: number) => {
        exitCalled = true
        if (code !== 0) throw new Error('Expected exit 0')
      }

      try {
        flag.parse(['/help'])
      } finally {
        console.log = originalLog
        process!.exit = originalExit
      }

      expect(exitCalled).toBe(true)
      expect(logs[0]).toContain('my-cli')
      expect(logs[0]).toContain('/?, /h, /help')
      expect(logs[0]).toContain('/count:number')
    })

    test('shows default help output when flag.help is not called', () => {
      const flag = new Flag()
      flag.number('count', 1, 'repeat count')

      const logs: string[] = []
      const originalLog = console.log
      console.log = (...args: unknown[]) => {
        logs.push(args.join(' '))
      }

      let exitCalled = false
      const originalExit = process!.exit
      process!.exit = () => {
        exitCalled = true
      }

      try {
        flag.parse(['/h'])
      } finally {
        console.log = originalLog
        process!.exit = originalExit
      }

      expect(exitCalled).toBe(true)
      expect(logs[0]).toContain('Usage:')
      expect(logs[0]).toContain('/?, /h, /help')
      expect(logs[0]).toContain('/count:number')
    })

    test('shows help even if there are validation errors prior to /help', () => {
      const flag = new Flag()
      flag.number('count', 0, 'count')

      const logs: string[] = []
      const originalLog = console.log
      console.log = (...args: unknown[]) => {
        logs.push(args.join(' '))
      }

      let exitCalled = false
      const originalExit = process!.exit
      process!.exit = () => {
        exitCalled = true
      }

      try {
        flag.parse(['/unknown', '/count:abc', '/help'])
      } finally {
        console.log = originalLog
        process!.exit = originalExit
      }

      expect(exitCalled).toBe(true)
      expect(logs[0]).toContain('Usage:')
    })

    test('supports custom appName', () => {
      const flag = new Flag()
      expect(flag.appName('custom-tool')).toBe('custom-tool')
      expect(flag.appName()).toBe('custom-tool')
    })
  })
})

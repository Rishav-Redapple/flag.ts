import { describe, expect, test } from 'bun:test'
import { Flag } from './flag'

describe('Flag', () => {
  test('parses aliases, defaults, booleans, and positionals', () => {
    const flag = new Flag()
    const verbose = flag.bool('v/verbose', 'verbose output')
    const count = flag.number('count', 'count', 3)
    const query = flag.string('q/query+', 'query')

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
    const count = flag.number('count', 'count', 1)
    const name = flag.string('name', 'name')

    flag.parse(['/count:2', '/count:4'])
    expect(count.value).toBe(4)
    expect(name.value).toBe('')
  })

  test('resets values on each parse', () => {
    const flag = new Flag()
    const count = flag.number('count', 'count', 1)

    flag.parse(['/count:5'])
    flag.parse([])
    expect(count.value).toBe(1)
  })

  test('does not partially update values when parsing fails', () => {
    const flag = new Flag()
    const count = flag.number('count', 'count', 1)
    flag.parse(['/count:5'])

    expect(() => flag.parse(['/count:not-a-number'])).toThrow()
    expect(count.value).toBe(5)
  })

  test('rejects invalid and duplicate names', () => {
    const flag = new Flag()
    expect(() => flag.bool('invalid/', 'invalid')).toThrow()
    flag.bool('a/b/c/d', 'now valid')
    flag.bool('constructor', 'valid name')
    expect(() => flag.bool('constructor', 'duplicate')).toThrow()
  })

  test('accepts zero values for a multiple flag', () => {
    const flag = new Flag()
    const query = flag.string('q/query+', 'query')
    flag.parse([])
    expect(query.value).toEqual([])
  })

  test('formats help output with ... for multiple flags', () => {
    const flag = new Flag()
    flag.number('count', 'repeat count', 1)
    flag.string('q/query+', 'search queries')
    flag.string('o', 'output file')
    flag.string('x/y/z', 'many aliases')

    const usageString = flag.usage()

    expect(usageString).toContain('/count:number')
    expect(usageString).toContain('/q, /query:string...')
    expect(usageString).toContain('/o:string')
    expect(usageString).toContain('/x, /y, /z:string')
  })

  test('auto-registers help and exits on parse', () => {
    const flag = new Flag()
    flag.number('count', 'repeat count', 1)

    flag.help(`my-cli\n${flag.usage()}`)

    const logs: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '))
    }

    let exitCalled = false
    const originalExit = process.exit
    // @ts-ignore
    process.exit = (code: number) => {
      exitCalled = true
      if (code !== 0) throw new Error('Expected exit 0')
    }

    try {
      flag.parse(['/help'])
    } finally {
      console.log = originalLog
      process.exit = originalExit
    }

    expect(exitCalled).toBe(true)
    expect(logs[0]).toContain('my-cli')
    expect(logs[0]).toContain('/?, /h, /help')
    expect(logs[0]).toContain('/count:number')
  })

  test('shows default help output when flag.help is not called', () => {
    const flag = new Flag()
    flag.number('count', 'repeat count', 1)

    const logs: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '))
    }

    let exitCalled = false
    const originalExit = process.exit
    // @ts-ignore
    process.exit = (code: number) => {
      exitCalled = true
    }

    try {
      flag.parse(['/h'])
    } finally {
      console.log = originalLog
      process.exit = originalExit
    }

    expect(exitCalled).toBe(true)
    expect(logs[0]).toContain('Usage:')
    expect(logs[0]).toContain('/?, /h, /help')
    expect(logs[0]).toContain('/count:number')
  })

  test('handles multiple flag with default value properly', () => {
    const flag = new Flag()
    const tags = flag.string('t/tag+', 'tags', 'default-tag')

    // When no args provided, uses default array
    flag.parse([])
    expect(tags.value).toEqual(['default-tag'])

    // When args provided, overrides the default rather than prepending to it
    flag.parse(['/t:one', '/tag:two'])
    expect(tags.value).toEqual(['one', 'two'])

    // Resets back to default on empty parse
    flag.parse([])
    expect(tags.value).toEqual(['default-tag'])
  })

  test('parses negative and decimal numbers correctly', () => {
    const flag = new Flag()
    const temp = flag.number('temp', 'temperature')
    const ratio = flag.number('ratio', 'ratio')

    flag.parse(['/temp:-15.5', '/ratio:.75'])
    expect(temp.value).toBe(-15.5)
    expect(ratio.value).toBe(0.75)
  })

  test('stops parsing flags after --', () => {
    const flag = new Flag()
    const verbose = flag.bool('v/verbose', 'verbose')

    flag.parse(['/verbose', '--', '/etc/passwd', '/not-a-flag'])

    expect(verbose.value).toBe(true)
    expect(flag.argv()).toEqual([
      { pos: 2, value: '/etc/passwd' },
      { pos: 3, value: '/not-a-flag' },
    ])
  })

  test('parses scientific and hex numbers correctly', () => {
    const flag = new Flag()
    const sci = flag.number('sci', 'scientific')
    const hex = flag.number('hex', 'hexadecimal')

    flag.parse(['/sci:1e5', '/hex:0xff'])
    expect(sci.value).toBe(100000)
    expect(hex.value).toBe(255)
  })

  test('shows help even if there are validation errors', () => {
    const flag = new Flag()
    flag.number('count', 'count')

    const logs: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => {
      logs.push(args.join(' '))
    }

    let exitCalled = false
    const originalExit = process.exit
    // @ts-ignore
    process.exit = (code: number) => {
      exitCalled = true
    }

    try {
      // /unknown is an error, /count:abc is an error, but /help should trigger first!
      flag.parse(['/unknown', '/count:abc', '/help'])
    } finally {
      console.log = originalLog
      process.exit = originalExit
    }

    expect(exitCalled).toBe(true)
    expect(logs[0]).toContain('Usage:')
  })
})

import { describe, expect, test } from 'bun:test'
import { Flag } from './flag'

describe('Flag', () => {
  test('parses aliases, defaults, booleans, and positionals', () => {
    const flag = new Flag()
    const help = flag.bool('h/help', 'show help')
    const count = flag.number('count', 'count', 3)
    const query = flag.string('q/query+', 'query')

    flag.parse([
      'input',
      '/help:false',
      '/query:first',
      '/count:0',
      '/q:second',
    ])

    expect(help.value).toBe(true)
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
    expect(() => flag.bool('help/', 'invalid')).toThrow()
    expect(() => flag.bool('help/other/third', 'invalid')).toThrow()
    flag.bool('constructor', 'valid name')
    expect(() => flag.bool('constructor', 'duplicate')).toThrow()
  })

  test("accepts zero values for a multiple flag", () => {
    const flag = new Flag()
    const query = flag.string("q/query+", "query")
    flag.parse([])
    expect(query.value).toEqual([])
  })

  test("formats help output with ... for multiple flags", () => {
    const flag = new Flag()
    flag.bool("h/help", "show help")
    flag.number("count", "repeat count", 1)
    flag.string("q/query+", "search queries")

    const logs: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => {
      logs.push(args.join(" "))
    }
    try {
      flag.help("my-tool [options]")
    } finally {
      console.log = originalLog
    }

    expect(logs[0]).toBe("Usage: my-tool [options]")
    expect(logs[1]).toContain("/h, /help")
    expect(logs[2]).toContain("/count:number")
    expect(logs[3]).toContain("/q, /query:string...")
  })
})

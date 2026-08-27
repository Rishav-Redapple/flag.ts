enum Kind {
  bool = 'bool',
  string = 'string',
  number = 'number',
}

export type FlagRef<T> = { readonly value: T }

type MultipleName<N extends string> = N extends `${string}${'+'}` ? true : false

type RegisteredValue<N extends string, T> =
  MultipleName<N> extends true ? T[] : T

type FlagDef = {
  aliases: string[]
  modifier: '+' | null
  kind: Kind
  description: string
  multiple: boolean
  required: boolean
  hasDefault: boolean
  defaultValue: unknown
  setValue: (value: unknown) => void
}

export type PositionalArg = { pos: number; value: string }

export class Flag {
  private defs = new Map<string, FlagDef>()
  private definitions: FlagDef[] = []
  private positionals: PositionalArg[] = []

  private register<Name extends string, T>(
    name: Name,
    kind: Kind,
    description: string,
    defaultValue: T,
    hasDefault: boolean,
  ): FlagRef<RegisteredValue<Name, T>> {
    const modifier = name.endsWith('+') ? ('+' as const) : null
    const aliasText = modifier ? name.slice(0, -1) : name
    const aliases = aliasText.split('/')
    if (aliases.length > 2 || aliases.some((alias) => alias.length === 0)) {
      throw new Error('a flag must have one or two non-empty names')
    }
    const validAliases = aliases.map((alias) => this.validateFlagName(alias))
    for (const alias of validAliases) {
      if (this.defs.has(alias)) throw new Error(`duplicate flag name: ${alias}`)
    }
    const multiple = modifier !== null
    let current: unknown = multiple
      ? hasDefault
        ? [defaultValue]
        : []
      : defaultValue

    const ref = {} as FlagRef<RegisteredValue<Name, T>>
    Object.defineProperty(ref, 'value', {
      enumerable: true,
      get: () => current,
    })

    const def: FlagDef = {
      aliases: validAliases,
      modifier,
      kind,
      description,
      multiple,
      required: false,
      hasDefault,
      defaultValue,
      setValue: (value) => {
        current = value
      },
    }
    this.definitions.push(def)
    for (const alias of validAliases) this.defs.set(alias, def)
    return ref
  }

  private validateFlagName(name: string): string {
    name = name.trim()
    if (name.length === 0) throw new Error('empty name found')
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(name)) {
      throw new Error('name must contain only letters, numbers, or hyphens')
    }
    return name
  }

  public bool<Name extends string>(
    name: Name,
    description: string,
    defaultValue = false,
  ) {
    return this.register(
      name,
      Kind.bool,
      description,
      defaultValue,
      arguments.length >= 3,
    )
  }

  public string<Name extends string>(
    name: Name,
    description: string,
    defaultValue = '',
  ) {
    return this.register(
      name,
      Kind.string,
      description,
      defaultValue,
      arguments.length >= 3,
    )
  }

  public number<Name extends string>(
    name: Name,
    description: string,
    defaultValue = 0,
  ) {
    return this.register(
      name,
      Kind.number,
      description,
      defaultValue,
      arguments.length >= 3,
    )
  }

  public parse(
    argv = typeof process === 'undefined' ? [] : process.argv.slice(2),
  ): void {
    // Stage all results first. A malformed input must not partially update refs.
    const staged = new Map<FlagDef, unknown>()
    for (const def of this.definitions) {
      staged.set(
        def,
        def.multiple
          ? def.hasDefault
            ? [def.defaultValue]
            : []
          : def.defaultValue,
      )
    }
    const positionals: PositionalArg[] = []
    const seen = new Set<FlagDef>()

    argv.forEach((arg, pos) => {
      if (!arg.startsWith('/')) {
        positionals.push({ pos, value: arg })
        return
      }

      const raw = arg.slice(1)
      const separator = raw.indexOf(':')
      const name = separator < 0 ? raw : raw.slice(0, separator)
      const value = separator < 0 ? null : raw.slice(separator + 1)
      const def = this.defs.get(name)
      if (!def) throw new Error(`Unknown flag: ${name}`)

      if (def.kind === Kind.bool) {
        // Boolean flags are presence-based; /help:false is still true.
        if (def.multiple) {
          const values = staged.get(def) as boolean[]
          values.push(true)
        } else {
          staged.set(def, true)
        }
      } else {
        if (value === null || value.length === 0)
          throw new Error(`${name} requires a value`)
        const parsed = this.convert(value, def.kind)
        if (def.multiple) {
          const values = staged.get(def) as unknown[]
          values.push(parsed)
        } else {
          staged.set(def, parsed)
        }
      }
      seen.add(def)
    })

    for (const def of this.definitions) {
      if (def.required && !seen.has(def) && !def.hasDefault) {
        throw new Error(`${def.aliases.join('/')} requires at least one value`)
      }
    }

    this.positionals = positionals
    for (const def of this.definitions) def.setValue(staged.get(def))
  }

  private convert(value: string, kind: Kind): string | number {
    if (kind === Kind.string) return value
    if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) {
      throw new Error(`Not a number: ${value}`)
    }
    const number = Number(value)
    if (!Number.isFinite(number)) throw new Error(`Not a number: ${value}`)
    return number
  }

  public argv(): PositionalArg[] {
    return [...this.positionals]
  }

  public help(usage = ''): void {
    console.log('Usage:', usage)
    const left = (def: FlagDef) =>
      `/${def.aliases.join(', /')}${def.kind !== Kind.bool ? `:${def.kind}` : ''}${def.multiple ? '...' : ''}`
    const max =
      this.definitions.length === 0
        ? 0
        : Math.max(...this.definitions.map((def) => left(def).length))
    this.definitions.forEach((def) => {
      const suffix = def.hasDefault
        ? ` [default=${String(def.defaultValue)}]`
        : ''
      console.log(`  ${left(def).padEnd(max + 2)}${def.description}${suffix}`)
    })
  }
}

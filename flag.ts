enum Kind {
  bool = 'bool',
  string = 'string',
  number = 'number',
}

export type FlagRef<T> = { readonly value: T }

type FlagModifier<N extends string> = N extends '?' ? null : N extends `${string}+` ? '+' : N extends `${string}?` ? '?' : null;

type RegisteredValue<N extends string, T> =
  FlagModifier<N> extends '+' ? T[] : FlagModifier<N> extends '?' ? T | undefined : T;

type FlagDef = {
  aliases: string[]
  modifier: '+' | '?' | null
  kind: Kind
  description: string
  multiple: boolean
  optional: boolean
  defaultValue: unknown
  setValue: (value: unknown) => void
}

export type PositionalArg = { pos: number; value: string }

const PREFIX = '/'
const SEPARATOR = ':'

export class Flag {
  private defs = new Map<string, FlagDef>()
  private definitions: FlagDef[] = []
  private positionals: PositionalArg[] = []
  private helpTemplate?: string

  constructor() {
    this.bool('?/h/help', false, 'show help')
  }

  private register<Name extends string, T>(
    name: Name,
    kind: Kind,
    defaultValue: T,
    description: string,
  ): FlagRef<RegisteredValue<Name, T>> {
    let modifier: '+' | '?' | null = null
    let aliasText = name as string
    if (name.endsWith('+?') || name.endsWith('?+')) {
      throw new Error('cannot combine + and ? modifiers')
    }
    if (name !== '?' && name.endsWith('?')) {
      modifier = '?'
      aliasText = name.slice(0, -1)
    } else if (name.endsWith('+')) {
      modifier = '+'
      aliasText = name.slice(0, -1)
    }
    const aliases = aliasText.split('/')
    if (aliases.some((alias) => alias.length === 0)) {
      throw new Error('flag names cannot be empty')
    }
    const validAliases = aliases.map((alias) => this.validateFlagName(alias))
    const uniqueAliases = new Set(validAliases)
    if (uniqueAliases.size !== validAliases.length) {
      throw new Error('duplicate alias in flag name')
    }
    for (const alias of validAliases) {
      if (this.defs.has(alias)) throw new Error(`duplicate flag name: ${alias}`)
    }
    const multiple = modifier === '+'
    const optional = modifier === '?'
    const isZero = this.isZeroValue(kind, defaultValue)
    let current: unknown = multiple
      ? isZero
        ? []
        : [defaultValue]
      : optional
        ? undefined
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
      optional,
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
    if (name === '?') return name
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(name)) {
      throw new Error('name must contain only letters, numbers, or hyphens')
    }
    return name
  }

  private isZeroValue(kind: Kind, value: unknown): boolean {
    return (
      (kind === Kind.bool && value === false) ||
      (kind === Kind.string && value === '') ||
      (kind === Kind.number && value === 0)
    )
  }

  public bool<Name extends string>(
    name: Name,
    defaultValue: boolean,
    description: string,
  ) {
    return this.register(name, Kind.bool, defaultValue, description)
  }

  public string<Name extends string>(
    name: Name,
    defaultValue: string,
    description: string,
  ) {
    return this.register(name, Kind.string, defaultValue, description)
  }

  public number<Name extends string>(
    name: Name,
    defaultValue: number,
    description: string,
  ) {
    return this.register(name, Kind.number, defaultValue, description)
  }

  public parse(
    argv = typeof process === 'undefined' ? [] : process.argv.slice(2),
  ): void {
    // Stage all results first. A malformed input must not partially update refs.
    const staged = new Map<FlagDef, unknown>()
    for (const def of this.definitions) {
      staged.set(def, def.multiple ? [] : def.optional ? undefined : def.defaultValue)
    }
    const positionals: PositionalArg[] = []
    let onlyPositionals = false

    const errors: Error[] = []

    argv.forEach((arg, pos) => {
      if (onlyPositionals) {
        positionals.push({ pos, value: arg })
        return
      }
      if (arg === '--') {
        onlyPositionals = true
        return
      }
      if (!arg.startsWith(PREFIX)) {
        positionals.push({ pos, value: arg })
        return
      }

      const raw = arg.slice(PREFIX.length)
      const separator = raw.indexOf(SEPARATOR)
      const name = separator < 0 ? raw : raw.slice(0, separator)
      const value = separator < 0 ? null : raw.slice(separator + 1)
      const def = this.defs.get(name)
      if (!def) {
        errors.push(new Error(`Unknown flag: ${name}`))
        return
      }

      if (def.kind === Kind.bool) {
        // Boolean flags are presence-based; /help:false is still true.
        if (def.multiple) {
          const values = staged.get(def) as boolean[]
          values.push(true)
        } else {
          staged.set(def, true)
        }
      } else {
        if (value === null || value.length === 0) {
          if (def.optional && value === null) {
            staged.set(def, def.defaultValue)
            return
          }
          errors.push(new Error(`${name} requires a value`))
          return
        }
        try {
          const parsed = this.convert(value, def.kind)
          if (def.multiple) {
            const values = staged.get(def) as unknown[]
            values.push(parsed)
          } else {
            staged.set(def, parsed)
          }
        } catch (err) {
          errors.push(err as Error)
        }
      }
    })

    const helpDef =
      this.defs.get('help') || this.defs.get('h') || this.defs.get('?')
    if (helpDef && staged.get(helpDef) === true) {
      if (this.helpTemplate !== undefined) {
        console.log(this.helpTemplate)
      } else {
        console.log(`Usage: ${this.appName()}\n${this.usage()}`)
      }
      if (typeof process !== 'undefined' && process.exit) {
        process.exit(0)
      }
      return
    }

    if (errors.length > 0) {
      throw errors[0]
    }

    for (const def of this.definitions) {
      if (
        def.multiple &&
        !this.isZeroValue(def.kind, def.defaultValue) &&
        (staged.get(def) as unknown[]).length === 0
      ) {
        staged.set(def, [def.defaultValue])
      }
    }

    this.positionals = positionals
    for (const def of this.definitions) def.setValue(staged.get(def))
  }

  private convert(value: string, kind: Kind): string | number {
    if (kind === Kind.string) return value
    const number = Number(value)
    if (!Number.isFinite(number) || value.trim() === '') {
      throw new Error(`Not a number: ${value}`)
    }
    return number
  }

  public argv(): PositionalArg[] {
    return [...this.positionals]
  }

  private _appName?: string

  public appName(customName?: string): string {
    if (customName !== undefined) {
      this._appName = customName
      return customName
    }
    if (this._appName !== undefined) {
      return this._appName
    }
    if (
      typeof process === 'undefined' ||
      !process.argv ||
      process.argv.length < 2
    ) {
      return 'app'
    }
    const script = process.argv[1]
    if (!script) return 'app'
    const parts = script.split(/[/\\]/)
    return parts[parts.length - 1] || 'app'
  }

  public usage(): string {
    const left = (def: FlagDef) =>
      `${PREFIX}${def.aliases.join(`, ${PREFIX}`)}${def.kind !== Kind.bool ? `${SEPARATOR}${def.kind}` : ''}${def.optional ? '?' : ''}${def.multiple ? '...' : ''}`
    const max =
      this.definitions.length === 0
        ? 0
        : Math.max(...this.definitions.map((def) => left(def).length))
    return this.definitions
      .map((def) => {
        const suffix = def.optional || !this.isZeroValue(def.kind, def.defaultValue)
          ? ` [default=${String(def.defaultValue)}]`
          : ''
        return `  ${left(def).padEnd(max + 2)}${def.description}${suffix}`
      })
      .join('\n')
  }

  public help(template: string): void {
    this.helpTemplate = template
  }
}

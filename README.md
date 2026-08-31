# flag.ts

<p align="center">
  <img src="./assets/banner.png" alt="flag banner" width="100%" />
</p>

A small, typed, unconventional command-line flag parser.

Flags use a `/name:value` syntax by default. Aliases, multi-value collection, optional values, and
automatic help formatting are built in. Every registered flag returns a
reactive `FlagRef<T>` whose `.value` always reflects the latest parse result.

## Inspiration

Go's standard [`flag`](https://pkg.go.dev/flag) package is beautifully minimal
— define flags with explicit names, defaults, and descriptions, parse, use. No decorators, no complex config objects, just clean functions that return pointers. When [tsoding/flag.h](https://github.com/tsoding/flag.h) proved the same idea works as a single C header, it felt natural to bring it to TypeScript: **one file, zero dependencies, strongly typed, and explicit.**

The twist is the default syntax. Instead of the conventional `--long` / `-s` style, `flag.ts` uses `/name:value` — closer to Windows and Plan 9 conventions than Unix. It's unconventional on purpose: a small experiment in what CLI ergonomics look like when you drop the dashes. (And if you prefer `-name=value`, you can easily configure it with constants at the top of the file!)

## Install

### 1. Drop-in single file (recommended)

Simply copy [`flag.ts`](./flag.ts) into your project — zero runtime dependencies:

```ts
import { Flag } from './flag'
```

### 2. As a package

```bash
npm install Rishav-Redapple/flag.ts
# or
bun add github:Rishav-Redapple/flag.ts
```

## Quick Start

Following Go's philosophy, all flag definitions take 3 explicit arguments: `(name, defaultValue, description)`.

```ts
import { Flag } from './flag'

const flag = new Flag()

// 1. Boolean flag (default false)
const verbose = flag.bool('v/verbose', false, 'enable verbose logging')

// 2. Number flag (default 1)
const count = flag.number('count', 1, 'repeat count')

// 3. Multi-value flag (trailing '+') -> returns string[]
const queries = flag.string('q/query+', '', 'search queries')

// 4. Optional value flag (trailing '?') -> returns string | undefined
const list = flag.string('l/list?', 'all', 'show list')

flag.help(`Usage: my-tool [options] [files...]
${flag.usage()}`)

flag.parse() // defaults to process.argv.slice(2)

console.log({
  verbose: verbose.value,
  count: count.value,
  queries: queries.value,
  list: list.value,
  files: flag.argv(),
})
```

```bash
my-tool /verbose /count:3 /q:foo /query:bar /l readme.md
# verbose.value → true
# count.value   → 3
# queries.value → ["foo", "bar"]
# list.value    → "all"
# flag.argv()   → [{ pos: 5, value: "readme.md" }]
```

## Flag Syntax

Flags are prefixed with `/` on the command line:

```
/name            boolean flag (presence = true) or optional flag (takes default)
/name:value      string or number flag (or optional flag with custom value)
```

Arguments that don't start with `/` are collected as **positional arguments**.

## Defining Flags

Every flag definition requires **name**, **default value**, and **description**:

### `flag.bool(name, defaultValue, description)`

Register a boolean flag. The flag is `true` when present on the command line, regardless of any value passed (e.g. `/help:false` still results in `true`).

```ts
const verbose = flag.bool('v/verbose', false, 'verbose output')
```

### `flag.string(name, defaultValue, description)`

Register a string flag. Requires a value after the `:` separator.

```ts
const output = flag.string('o/output', 'dist', 'output folder')
```

### `flag.number(name, defaultValue, description)`

Register a numeric flag. Requires a valid numeric value (supports integers, decimals, negative numbers, scientific notation, and hex).

```ts
const port = flag.number('p/port', 8080, 'server port')
```

---

Each method returns a `FlagRef<T>` — a read-only object with a `.value` getter that always reflects the most recent `parse()` result.

## Name Format & Modifiers

Flag names follow this pattern:

```
primary/alias   → one or more aliases separated by /
name+           → multi-value collection (array)
name?           → optional value flag (can be used with or without :value)
```

| Name          | Aliases              | Type                  | Description                               |
| ------------- | -------------------- | --------------------- | ----------------------------------------- |
| `"o"`         | `/o`                 | `string`              | Single alias                              |
| `"h/help"`    | `/h`, `/help`        | `boolean`             | Multiple aliases                          |
| `"n/c/count"` | `/n`, `/c`, `/count` | `number`              | Multiple aliases                          |
| `"q/query+"`  | `/q`, `/query`       | `string[]`            | Collects 0 or more values                 |
| `"l/list?"`   | `/l`, `/list`        | `string \| undefined` | Optional value flag (`/l` or `/l:custom`) |

### Rules

- Names must contain only letters, digits, and hyphens (`a-z`, `0-9`, `-`). The `?` character is also strictly allowed for the built-in help flag (`/?`).
- Aliases are separated by `/`.
- Modifiers (`+` or `?`) must only be placed at the very end of the full name string.
- You cannot combine `+` and `?` modifiers (`+?` / `?+`).
- Duplicate names or aliases (even within the same flag definition like `l/l`) are rejected.

## Optional Flags (`?`)

A trailing `?` on the flag name allows a flag to function as both a toggle and a value flag:

- **Omitted from CLI**: Value is `undefined`.
- **Passed without value** (`/l`): Value is the default / implicit value (e.g. `"all"`).
- **Passed with value** (`/l:new`): Value is the provided value (`"new"`).

```ts
const list = flag.string('l/list?', 'all', 'show list')

// CLI: (no flags) -> list.value is undefined
// CLI: /l         -> list.value is "all"
// CLI: /l:recent  -> list.value is "recent"
```

## Multi-Value Flags (`+`)

A trailing `+` on the name collects multiple occurrences into an array:

```ts
const queries = flag.string('q/query+', '', 'search queries')

flag.parse(['/q:first', '/query:second'])
queries.value // → ["first", "second"]
```

If a non-zero default is provided (e.g., `'default'`), it is used when no flags are supplied on the CLI. If flags are supplied, they override the default:

```ts
const tags = flag.string('t/tag+', 'general', 'tags')

flag.parse([])
tags.value // → ["general"]

flag.parse(['/t:news'])
tags.value // → ["news"]
```

## Customizing Delimiters

If you prefer traditional Unix-style flags (like `-name=value`), simply modify the constants at the top of [`flag.ts`](./flag.ts):

```ts
const PREFIX = '-'
const SEPARATOR = '='
```

The parser and the auto-generated help output immediately adapt to the new delimiters.

## Positional Arguments & `--`

Anything that doesn't start with `/` (or your configured `PREFIX`) is treated as a positional argument:

```ts
flag.parse(['input.txt', '/verbose', 'output.txt'])
flag.argv()
// → [
//     { pos: 0, value: "input.txt" },
//     { pos: 2, value: "output.txt" }
//   ]
```

Use the standard `--` delimiter to stop flag parsing. This is required if you need to pass paths or literal strings starting with `/` as positional arguments:

```bash
my-tool /verbose -- /etc/passwd /tmp/file
```

## Help Output

By default, `flag.ts` mimics Go's zero-configuration auto-help:

1. The flags `/?`, `/h`, and `/help` are automatically registered.
2. Passing any of these flags causes `flag.parse()` to print the usage table and safely exit `process.exit(0)`.
3. Zero/falsy default values (`false`, `""`, `0`) are omitted from `[default=...]` to keep output concise. Only meaningful non-zero defaults and optional flags display `[default=...]`.

```bash
$ my-tool /help
Usage: my-tool
  /?, /h, /help        show help
  /v, /verbose         enable verbose logging
  /count:number        repeat count [default=1]
  /l, /list:string?    show list [default=all]
  /q, /query:string... search queries
```

### Overriding Default Output

Call `flag.help(template)` before parsing to customize the help layout:

```ts
flag.help(`Usage: my-tool [options] [files...]
${flag.usage()}`)
```

## Error Handling & Atomic Parsing

Parsing is **atomic** — if any flag is malformed or unknown, no flag refs are updated. Previous successful parse states remain intact.

`parse()` throws on:
- Unknown flags (`/unknown`)
- Missing values for non-optional flags (`/count` or `/count:`)
- Non-numeric input for number flags (`/count:abc`)

## API Reference

| Export          | Type    | Description                                            |
| --------------- | ------- | ------------------------------------------------------ |
| `Flag`          | `class` | The flag parser instance                               |
| `FlagRef<T>`    | `type`  | Read-only reactive ref with `.value: T`                |
| `PositionalArg` | `type`  | `{ pos: number; value: string }`                       |

## Development

```bash
bun install          # install dependencies
bun run typecheck    # type-check without emitting
bun test             # run tests
bun run build        # compile to dist/
```

## License

MIT

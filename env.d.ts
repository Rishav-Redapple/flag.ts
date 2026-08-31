declare var process:
  | {
      argv: string[]
      exit?: (code?: number) => void
    }
  | undefined

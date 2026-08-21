export class PandoraError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly apiCode: number | undefined

  constructor(
    code: string,
    message: string,
    retryable: boolean,
    options: { readonly apiCode?: number; readonly cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = "PandoraError"
    this.code = code
    this.retryable = retryable
    this.apiCode = options.apiCode
  }
}

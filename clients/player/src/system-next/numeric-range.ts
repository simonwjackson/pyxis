// Product-owned bounds. Plain numbers (such as counts) deliberately do not use this type.
export type NumericRange<
  Min extends number,
  Max extends number,
  Step extends number = 1,
> = number & { readonly __numericRange?: readonly [Min, Max, Step] }

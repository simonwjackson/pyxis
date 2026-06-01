import { Schema } from "effect";

type SynchronousProviderSchema = Schema.Top & Schema.Decoder<unknown, never>;

export type DecodedSchema<S extends SynchronousProviderSchema> = S & {
  readonly parse: (input: unknown) => Schema.Schema.Type<S>;
  readonly safeParse: (
    input: unknown,
  ) =>
    | { readonly success: true; readonly data: Schema.Schema.Type<S> }
    | { readonly success: false; readonly error: unknown };
};

/**
 * Effect-native provider response decoder seam.
 *
 * Source providers keep exporting concrete Effect Schema values while clients can
 * call the same parse/safeParse surface they previously used with Zod. This
 * keeps the migration mechanical at call sites without keeping Zod as a second
 * runtime schema language.
 */
export const withDecoders = <S extends SynchronousProviderSchema>(
  schema: S,
): DecodedSchema<S> => {
  const parse = Schema.decodeUnknownSync(schema) as (
    input: unknown,
  ) => Schema.Schema.Type<S>;

  return Object.assign(schema, {
    parse,
    safeParse: (input: unknown) => {
      try {
        return { success: true as const, data: parse(input) };
      } catch (error) {
        return { success: false as const, error };
      }
    },
  });
};

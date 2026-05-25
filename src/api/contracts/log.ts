import { Schema } from "effect";

export const ClientLogInputSchema = Schema.Struct({
	message: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4096)),
});

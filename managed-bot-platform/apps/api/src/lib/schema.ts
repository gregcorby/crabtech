import { zodToJsonSchema } from "zod-to-json-schema";
import type { z } from "zod";

export function zodBody<T extends z.ZodType>(schema: T) {
  return {
    body: zodToJsonSchema(schema, { target: "openApi3" }),
  };
}

export function zodResponse<T extends z.ZodType>(schema: T) {
  return zodToJsonSchema(schema, { target: "openApi3" });
}

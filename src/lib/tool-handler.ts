import type { z } from "zod";

/**
 * Wraps an MCP tool handler with schema validation and consistent error formatting.
 * Replaces the repetitive try/catch pattern across all 48 tool registrations.
 */
export function toolHandler<T extends z.ZodType>(
  schema: T,
  handler: (params: z.infer<T>) => Promise<unknown>
) {
  return async (params: Record<string, unknown>) => {
    try {
      const parsed = schema.parse(params);
      const result = await handler(parsed);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  };
}

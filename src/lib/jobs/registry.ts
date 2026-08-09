import { JobError, type AnyJobHandlerDefinition } from "./types";

export function createJobHandlerRegistry(definitions: readonly AnyJobHandlerDefinition[]) {
  const handlers = new Map<string, AnyJobHandlerDefinition>();

  for (const definition of definitions) {
    const type = definition.type.trim();
    if (!type || handlers.has(type)) {
      throw new Error(`Duplicate or empty job type: ${type || "(empty)"}`);
    }
    handlers.set(type, definition);
  }

  return {
    get(type: string) {
      const handler = handlers.get(type);
      if (!handler) {
        throw new JobError("unknown-type", `Обработчик задачи «${type}» не зарегистрирован.`, {
          retryable: false,
        });
      }
      return handler;
    },
    list() {
      return [...handlers.values()];
    },
  };
}

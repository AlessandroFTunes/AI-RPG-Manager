import { AsyncLocalStorage } from "node:async_hooks";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  campaign_id?: string;
  interaction_id?: string;
  operation_key?: string;
}

export interface LogFields extends LogContext {
  duration_ms?: number;
  [key: string]: unknown;
}

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  code?: string | number;
  cause?: SerializedError | unknown;
}

type LogWriter = (line: string, level: LogLevel) => void;

const contextStorage = new AsyncLocalStorage<LogContext>();

export function runWithLogContext<T>(context: LogContext, callback: () => T): T {
  return contextStorage.run({ ...contextStorage.getStore(), ...context }, callback);
}

export function getLogContext(): Readonly<LogContext> {
  return contextStorage.getStore() ?? {};
}

export function serializeError(error: unknown, seen = new WeakSet<object>()): SerializedError | unknown {
  if (!(error instanceof Error)) return safeValue(error, seen);
  if (seen.has(error)) return { name: error.name, message: "[Circular error]" };
  seen.add(error);
  const value: SerializedError = { name: error.name, message: error.message };
  if (error.stack) value.stack = error.stack;
  const code = (error as Error & { code?: unknown }).code;
  if (typeof code === "string" || typeof code === "number") value.code = code;
  if (error.cause !== undefined) value.cause = serializeError(error.cause, seen);
  return value;
}

function safeValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value instanceof Error) return serializeError(value, seen);
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object" || value === null) return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => safeValue(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, safeValue(item, seen)]));
}

function defaultWriter(line: string, level: LogLevel) {
  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(`${line}\n`);
}

export function createLogger(service: string, options: { write?: LogWriter; now?: () => Date } = {}) {
  const write = options.write ?? defaultWriter;
  const now = options.now ?? (() => new Date());

  function emit(level: LogLevel, event: string, fields: LogFields = {}) {
    const payload = safeValue({
      ...getLogContext(),
      ...fields,
      service,
      event,
      timestamp: now().toISOString(),
      level,
    }, new WeakSet());
    write(JSON.stringify(payload), level);
  }

  return {
    debug: (event: string, fields?: LogFields) => emit("debug", event, fields),
    info: (event: string, fields?: LogFields) => emit("info", event, fields),
    warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
    error: (event: string, error: unknown, fields: LogFields = {}) => emit("error", event, {
      ...fields,
      error: serializeError(error),
    }),
  };
}

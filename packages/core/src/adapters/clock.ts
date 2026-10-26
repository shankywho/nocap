import type { ClockPort, LoggerPort } from "../ports.js";

export class SystemClock implements ClockPort {
  now(): number {
    return Date.now();
  }

  iso(): string {
    return new Date().toISOString();
  }
}

/** Deterministic clock for tests and golden receipts. */
export class FixedClock implements ClockPort {
  constructor(
    private ms = Date.parse("2026-10-26T13:00:00.000Z"),
    private readonly stepMs = 1,
  ) {}

  now(): number {
    const current = this.ms;
    this.ms += this.stepMs;
    return current;
  }

  iso(): string {
    return new Date(this.ms).toISOString();
  }
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export class ConsoleLogger implements LoggerPort {
  constructor(private readonly level: LogLevel = "info") {}

  private enabled(level: LogLevel): boolean {
    const order: LogLevel[] = ["debug", "info", "warn", "error"];
    return order.indexOf(level) >= order.indexOf(this.level);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    if (this.enabled("debug")) console.debug(message, meta ?? "");
  }

  info(message: string, meta?: Record<string, unknown>): void {
    if (this.enabled("info")) console.info(message, meta ?? "");
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    if (this.enabled("warn")) console.warn(message, meta ?? "");
  }

  error(message: string, meta?: Record<string, unknown>): void {
    if (this.enabled("error")) console.error(message, meta ?? "");
  }
}

/** Collects structured log lines; used by tests and the web request logger. */
export class MemoryLogger implements LoggerPort {
  readonly lines: { level: LogLevel; message: string; meta?: Record<string, unknown> }[] = [];

  debug(message: string, meta?: Record<string, unknown>): void {
    this.lines.push({ level: "debug", message, meta });
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.lines.push({ level: "info", message, meta });
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.lines.push({ level: "warn", message, meta });
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.lines.push({ level: "error", message, meta });
  }
}
import type { JobRunSource } from "./model";

export class JobError extends Error {
  code: string;
  retryable: boolean;

  constructor(code: string, message: string, options?: { retryable?: boolean; cause?: unknown }) {
    super(message, options);
    this.name = "JobError";
    this.code = code;
    this.retryable = options?.retryable ?? true;
  }
}

export type JobHandlerContext<TPayload> = {
  attempt: number;
  jobId: number | null;
  payload: TPayload;
  runId: number;
  signal: AbortSignal;
  source: JobRunSource;
};

export type JobHandlerDefinition<TPayload> = {
  defaultMaxAttempts?: number;
  defaultRetryBaseSeconds?: number;
  defaultRetryMaxSeconds?: number;
  defaultTimeoutSeconds?: number;
  execute: (context: JobHandlerContext<TPayload>) => Promise<void>;
  label: string;
  parsePayload: (value: unknown) => TPayload;
  schedulable?: boolean;
  type: string;
};

export type AnyJobHandlerDefinition = {
  defaultMaxAttempts?: number;
  defaultRetryBaseSeconds?: number;
  defaultRetryMaxSeconds?: number;
  defaultTimeoutSeconds?: number;
  execute: (context: JobHandlerContext<never>) => Promise<void>;
  label: string;
  parsePayload: (value: unknown) => unknown;
  schedulable?: boolean;
  type: string;
};

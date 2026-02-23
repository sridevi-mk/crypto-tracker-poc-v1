import { randomUUID } from "crypto";

export type ApiErrorBody = {
  error: string;
  message: string;
  request_id: string;
  details?: unknown;
};

export function apiError(params: {
  status: number;
  error: string;
  message: string;
  details?: unknown;
  headers?: Record<string, string>;
}) {
  const requestId = randomUUID();
  const body: ApiErrorBody = {
    error: params.error,
    message: params.message,
    request_id: requestId,
    ...(params.details !== undefined ? { details: params.details } : {}),
  };
  return new Response(JSON.stringify(body), {
    status: params.status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": requestId,
      ...(params.headers || {}),
    },
  });
}

export function apiOk(data: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
  });
}

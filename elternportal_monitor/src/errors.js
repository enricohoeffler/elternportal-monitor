export class MonitorError extends Error {
  constructor(message, { kind = "unknown", cause, retryable = false } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = this.constructor.name;
    this.kind = kind;
    this.retryable = retryable;
  }
}

export class ReadOnlyPolicyError extends MonitorError {
  constructor(message) {
    super(message, { kind: "policy" });
  }
}

export class PortalAuthError extends MonitorError {
  constructor(message, { cause, retryable = false } = {}) {
    super(message, { kind: "authentication", cause, retryable });
  }
}

export class PortalNetworkError extends MonitorError {
  constructor(message, { cause } = {}) {
    super(message, { kind: "network", cause, retryable: true });
  }
}

export class PortalParserError extends MonitorError {
  constructor(message, { cause } = {}) {
    super(message, { kind: "parser", cause });
  }
}

export class PortalResponseError extends MonitorError {
  constructor(message, { cause } = {}) {
    super(message, { kind: "portal", cause, retryable: true });
  }
}

export function classifyMonitorError(error) {
  if (error instanceof MonitorError) {
    return { type: error.kind, message: error.message };
  }
  return {
    type: "unknown",
    message: error instanceof Error ? error.message : String(error),
  };
}

/**
 * Local error store to capture and display errors in the UI
 * Works alongside Sentry to provide real-time error visibility
 */

export interface CapturedError {
  id: string;
  message: string;
  severity: "error" | "warning" | "info" | "fatal";
  timestamp: Date;
  component?: string;
  errorType?: string;
  stack?: string;
  extra?: Record<string, unknown>;
}

type ErrorSubscriber = (errors: CapturedError[]) => void;

// In-memory error store
let errors: CapturedError[] = [];
const subscribers: Set<ErrorSubscriber> = new Set();
const MAX_ERRORS = 50; // Keep last 50 errors

// Generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Notify all subscribers
function notifySubscribers() {
  subscribers.forEach((callback) => callback(errors));
}

/**
 * Add an error to the store
 */
export function addError(
  error: Error | string,
  options?: {
    severity?: CapturedError["severity"];
    component?: string;
    errorType?: string;
    extra?: Record<string, unknown>;
  },
): void {
  const capturedError: CapturedError = {
    id: generateId(),
    message: typeof error === "string" ? error : error.message,
    severity: options?.severity || "error",
    timestamp: new Date(),
    component: options?.component,
    errorType: options?.errorType,
    stack: typeof error === "string" ? undefined : error.stack,
    extra: options?.extra,
  };

  errors = [capturedError, ...errors].slice(0, MAX_ERRORS);
  notifySubscribers();
}

/**
 * Clear all errors from the store
 */
export function clearErrors(): void {
  errors = [];
  notifySubscribers();
}

/**
 * Subscribe to error updates
 * Returns an unsubscribe function
 */
export function subscribeToErrors(callback: ErrorSubscriber): () => void {
  subscribers.add(callback);
  // Immediately call with current errors
  callback(errors);
  
  return () => {
    subscribers.delete(callback);
  };
}

/**
 * Get all current errors
 */
export function getErrors(): CapturedError[] {
  return [...errors];
}

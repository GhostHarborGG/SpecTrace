/** Represents an authenticated user session. */
export interface Session {
  id: string;
  lastActiveAt: number;
}

export interface SessionConfig {
  inactivityTimeoutMs: number;
}

/** Manages session lifecycle. */
export class SessionManager {
  private timeoutMs: number;

  constructor(config: SessionConfig) {
    this.timeoutMs = config.inactivityTimeoutMs;
  }

  /** Expires a session after the configured inactivity period. */
  expireInactive(session: Session): void {
    session.lastActiveAt = 0;
  }

  get active(): boolean {
    return this.timeoutMs > 0;
  }

  set active(value: boolean) {
    this.timeoutMs = value ? this.timeoutMs : 0;
  }
}

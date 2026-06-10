/**
 * Progress reporter for the conversion pipeline (P2-T2).
 *
 * PRD §10.3 latency tenet: "loading state renders progress, not a blank spinner".
 * This module provides a typed event system so the pipeline can report legible
 * progress to any consumer (CLI logging, API streaming, UI state updates).
 *
 * Usage:
 *   const progress = new ProgressReporter((evt) => console.log(evt.message));
 *   progress.report("parsing", "Parsing document…");
 *   …
 *   progress.report("converting", "Sending to Claude Sonnet…");
 *   progress.report("validating", "Checking structural contract…");
 *   progress.report("done", "Done.");
 */

export type ProgressStage =
  | "idle"
  | "parsing"
  | "converting"
  | "validating"
  | "done"
  | "error";

export interface ProgressEvent {
  stage: ProgressStage;
  message: string;
  timestamp: number; // Date.now()
}

export type ProgressCallback = (event: ProgressEvent) => void;

export class ProgressReporter {
  private readonly _cb: ProgressCallback;
  readonly events: ProgressEvent[] = [];

  constructor(cb: ProgressCallback = () => undefined) {
    this._cb = cb;
  }

  report(stage: ProgressStage, message: string): void {
    const event: ProgressEvent = { stage, message, timestamp: Date.now() };
    this.events.push(event);
    this._cb(event);
  }

  /** Elapsed ms between first and last event. */
  elapsedMs(): number {
    if (this.events.length < 2) return 0;
    return (this.events.at(-1)?.timestamp ?? 0) - (this.events[0]?.timestamp ?? 0);
  }

  /** All stages that were reported, in order. */
  stages(): ProgressStage[] {
    return this.events.map((e) => e.stage);
  }
}

/** A no-op reporter for use in tests that don't care about progress. */
export const silentReporter = new ProgressReporter();

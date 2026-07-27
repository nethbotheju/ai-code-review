/** Shapes emitted by pi in `--mode json` (JSONL on stdout). */

export interface PiContentPart {
  type: string;
  text?: string;
}

export interface PiUsage {
  input?: number;
  output?: number;
  total?: number;
}

export interface PiMessage {
  role: string;
  content?: PiContentPart[] | string;
  usage?: PiUsage;
  stopReason?: string;
  errorMessage?: string;
}

export interface PiEvent {
  type: string;
  message?: PiMessage;
  messages?: PiMessage[];
}

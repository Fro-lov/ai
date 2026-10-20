export interface NoteQuestionResponse {
  question: string;
  options: string[]; // Exactly 3 options
  isReadyToFinalize?: boolean;
}

export interface NoteClarificationStep {
  question: string;
  options: string[];
  answer: string;
}

export interface NoteSession {
  userId: number;
  chatId: number;
  rawIdea: string;
  steps: NoteClarificationStep[];
  currentQuestion?: string;
  currentOptions?: string[];
  stepNumber: number;
  maxSteps: number;
  createdAt: number;
  lastActivityAt: number;
}

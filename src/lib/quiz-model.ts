// Domain types and authoring constants for Quizzes. Vocabulary follows
// docs/CONTEXT.md: a Quiz is an authored template; a Question belongs to a Quiz
// and owns its Options; exactly one Option is the correct one.

export type QuestionType = "single" | "truefalse";

// Preset authoring choices (PRD user stories 9-11).
export const TIME_LIMITS_SEC = [10, 20, 30, 60] as const;
export const POINT_VALUES = [500, 1000, 2000] as const;

export type TimeLimitSec = (typeof TIME_LIMITS_SEC)[number];
export type PointValue = (typeof POINT_VALUES)[number];

// A new Question defaults to single-choice / 20s / 1000 points.
export const DEFAULT_TIME_LIMIT_SEC: TimeLimitSec = 20;
export const DEFAULT_POINTS: PointValue = 1000;
export const SINGLE_CHOICE_OPTION_COUNT = 4;

// A True/False Question has exactly two fixed Options (still Options, per
// docs/CONTEXT.md), in this order, with the first ("True") correct by default.
export const TRUE_FALSE_OPTION_TEXTS = ["True", "False"] as const;
export const TRUE_FALSE_OPTION_COUNT = TRUE_FALSE_OPTION_TEXTS.length;

export interface Option {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  quizId: string;
  position: number;
  type: QuestionType;
  text: string;
  imageUrl: string | null;
  options: Option[];
  correctOptionId: string;
  timeLimitSec: number;
  points: number;
}

export interface Quiz {
  id: string;
  title: string;
  questions: Question[];
  createdAt: string;
  updatedAt: string;
}

// Row shown in the /admin library — cheap to list without loading every Option.
export interface QuizSummary {
  id: string;
  title: string;
  questionCount: number;
  lastPlayedAt: string | null;
}

// Shape accepted when editing a Question. Option ids are kept stable across
// edits so the correct flag and any in-flight Responses stay anchored.
export interface QuestionInput {
  text: string;
  timeLimitSec: number;
  points: number;
  options: Option[];
  correctOptionId: string;
}

Issue: https://github.com/RazvanAga/quiz/issues/3

## What to build

End-to-end authoring of single-choice Quizzes. A SQLite schema for Quiz/Question/Option, a repository module wrapping it (synchronous better-sqlite3), and the `/admin` Quiz library UI. From the library an Admin can create a Quiz (title), add single-choice Questions (4 Options, mark exactly one correct, pick a time limit from 10/20/30/60s and points from 500/1000/2000), edit them, and delete a Question or a whole Quiz behind a confirm dialog. A new Question defaults to single-choice / 20s / 1000 points. Everything persists across a restart.

Vocabulary per [docs/CONTEXT.md](../CONTEXT.md).

## Acceptance criteria

- [ ] Repository CRUD for Quiz/Question/Option with tests against a throwaway SQLite (temp-file or `:memory:`)
- [ ] `/admin` lists all Quizzes with title, number of Questions, and last-played
- [ ] Create a Quiz; add/edit single-choice Questions with 4 Options and exactly one correct
- [ ] Per-Question time (10/20/30/60s) and points (500/1000/2000) presets; new Question defaults to single-choice / 20s / 1000
- [ ] Deleting a Question and deleting a Quiz each require a confirm dialog
- [ ] Edits persist across a server restart
- [ ] UI and code use glossary vocabulary (Quiz, Question, Option)
- [ ] Finish with a commit describing what was achieved

## Blocked by

- #2
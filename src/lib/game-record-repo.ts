import { getDb } from "./db";
// The Game Record repository is plain CommonJS (shared with the custom server);
// allowJs + its JSDoc typedefs give this import full types.
import {
  createGameRecordRepository,
  type GameRecordRepository,
} from "./game-record-repository";

// App-wide Game Record repository, bound lazily to the shared data/quiz.db
// connection. The custom server writes Game Records over its own connection on
// finish; the History pages read them through this one.
let repo: GameRecordRepository | null = null;

export function gameRecordRepository(): GameRecordRepository {
  if (!repo) repo = createGameRecordRepository(getDb());
  return repo;
}

# Quiz

A Kahoot-style live multiplayer trivia app. An admin authors quizzes; players join a live play-through on their phones and compete on a shared screen.

## Language

**Quiz**:
The authored, reusable template — a title plus an ordered list of questions. Has no players or scores; it is not a play-through.
_Avoid_: Quizz, questionnaire, survey

**Game**:
One live play-through of a Quiz. Has players, scores, a current question, and a lifecycle (lobby → playing → finished). Lives in memory while active; becomes a history record when it finishes.
_Avoid_: Room, session, match, round

**Game PIN**:
The 4-digit code (0000–9999) that uniquely identifies one active Game so players can join it.
_Avoid_: Room code, code, PIN, room number

**Question**:
A single prompt within a Quiz — text, an optional image, its Options, the correct one, a time limit, and a point value. Authored; belongs to a Quiz.
_Avoid_: Item, prompt, card

**Option**:
One of the selectable choices belonging to a Question (4 for single-choice, 2 for True/False). Exactly one Option is flagged correct. Authored; part of the Quiz.
_Avoid_: Answer, choice, alternative

**Response**:
What a Player submitted for a Question during a Game — which Option they picked, how long they took, and points earned. Runtime only; part of the Game, never authored.
_Avoid_: Answer, submission, guess

**Admin**:
The authoring role. Works in the nginx-gated `/admin` area: creates, edits, and deletes Quizzes, browses history, and starts Games. Persistent; not tied to any single Game.
_Avoid_: Owner, creator, moderator

**Host**:
The live-game control role that drives the shared screen for one Game — advances Questions, runs the reveal, shows the leaderboard. Exists only for that Game's duration. The Admin becomes the Host on starting a Game.
_Avoid_: Presenter, moderator, MC

**Player**:
A participant in one Game, identified by a unique-per-Game display name plus a chosen Avatar. Joins via the Game PIN from their own phone. Exists only within that Game.
_Avoid_: User, guest, contestant, participant

**Avatar**:
A visual identity a Player picks from a fixed preset set when joining (no uploads). Stored as an identifier alongside the Player.
_Avoid_: Icon, picture, profile image

**Lobby**:
The Game phase after creation (PIN shown) and before the first Question, where Players join. Joining closes when the Host starts the Game.
_Avoid_: Waiting room, room, pregame

**Reveal**:
The Game phase right after a Question closes, showing the correct Option and the distribution of Responses across Options.
_Avoid_: Results, answer screen, solution

**Leaderboard**:
The interim standings shown between Questions, after each Reveal. Updates every Question.
_Avoid_: Scoreboard, ranking, standings (when interim)

**Podium**:
The single final-standings screen at the end of a Game — the top-3 celebration plus full ranking. This is the climax saved to history.
_Avoid_: Final leaderboard, results, clasament

**History**:
The collection of past finished Games belonging to a Quiz, browsable from the Admin area.
_Avoid_: Log, archive, past games

**Game Record**:
One persisted finished Game in a Quiz's History — its date, the final Podium standings, every Player's per-Question Responses, and each Question's Distribution. The unit written to the database when a Game finishes.
_Avoid_: Result, match record, history entry

**Distribution**:
The per-Question aggregate of how many Responses chose each Option. Shown live during Reveal and stored in the Game Record.
_Avoid_: Stats, tally, breakdown

# SQLite (better-sqlite3, WAL) over Postgres

Persistence is a single SQLite file (`better-sqlite3`) in `data/`, with `journal_mode = WAL` set at startup. Chosen over Postgres because the workload is a single Node process making rare, tiny writes (save Quiz, save Game Record) — no service to install or secure, and backup is copying one file.

## Considered Options

The whole-file write lock people associate with SQLite does not apply here: WAL lets readers and writers proceed concurrently (only writers serialize, one at a time), and the app is single-threaded with one event loop, so there is never more than one writer from our own process. Postgres was rejected as operational overhead with no benefit at this scale; it can be revisited only if the app ever needs multiple writer processes.

## Consequences

- `better-sqlite3` is a native module that compiles on install — needs build tools on the VPS.

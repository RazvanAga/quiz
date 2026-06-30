Issue: https://github.com/RazvanAga/quiz/issues/12

## What to build

A small set of Socket.IO integration smoke tests (Seam 3): connect a real Socket.IO client to a test server and run one happy-path Game (create → join → start → answer → reveal → finish), asserting that key emitted events arrive and serialize correctly. Kept minimal to avoid flakiness.

## Acceptance criteria

- [ ] At least one end-to-end happy-path Game test through a real Socket.IO client
- [ ] Asserts key lifecycle events arrive and serialize correctly
- [ ] The suite stays fast and stable (few tests)
- [ ] Finish with a commit describing what was achieved

## Blocked by

- #7
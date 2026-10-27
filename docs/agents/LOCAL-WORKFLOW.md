# Local agent workflow (32K starting configuration)

This is an on-demand procedure, not extra always-loaded context. A model alias or instruction file does not train the model, add retrieval tools or guarantee correct changes. The existing 32K Qwen configuration is the starting point; no Ollama/OpenCode configuration is changed by these documents. Evaluate results before increasing task scope.

## Retrieve only what the task needs

1. Define one observable outcome and its acceptance checks. Split a large feature into independently verifiable steps; expand scope when tracing the cause requires it, not by an arbitrary file limit.
2. Check Git status and the worklist. Use `docs/agents/REPOSITORY-MAP.md` to choose starting files, then confirm them in source.
3. Discover filenames before reading content. Example: `rg --files src tests server/src -g '*request*' -g '*social*'`.
4. Search symbols in explicit files/directories, for example `rg -n -m 12 'accept|request' src/message-requests.js server/src/message-requests.js`. Replace generic patterns with exact discovered symbols as soon as possible. `-m` limits matches per file, not total output.
5. Read the enclosing function and enough surrounding code to understand inputs, state, callers and cleanup. Use bounded line ranges; widen deliberately. Do not stop at an isolated match when permissions or async lifecycle cross files.
6. Track a short list of established file/symbol facts and unresolved questions. Use language-server diagnostics when available. Do not claim a language server, vector database or repository index is installed unless verified.

Search tracked source first. Do not index/read `node_modules`, generated packages, `.git`, `src/vendor`, caches, logs, private configuration, secrets or local databases. Public examples and release configuration may be read when the task requires them. Any future semantic index must obey the same exclusions and be refreshed after source changes; retrieval results still need checking against current files.

## Implement and verify

Reproduce a defect before fixing it when practical. Use a meaningful regression test where it can check behavior; do not invent a brittle test just to satisfy a ritual. Make the smallest coherent change, run relevant checks, inspect the diff, and broaden verification according to impact. Keep existing tests intact unless behavior intentionally changes. See `docs/agents/VERIFICATION.md` for actual commands.

Do not start several local model agents by default. One active coding task is the baseline on this machine. Avoid huge tool transcripts: retain the exact command, exit status, important errors and summary. Keep full logs out of Git and inspect relevant excerpts. If a command fails twice without new evidence, stop repeating it, investigate assumptions and report the blocker or choose a different justified approach.

## Context and handoff

Do not wait until the context is exhausted. At a coherent boundary, leave a concise checkpoint and start a fresh session when the conversation is dominated by old tool output, compaction loses important constraints, or the tool reports little space remaining. Context indicators are estimates; reserve room for edits and verification. Do not automatically load every linked reference document.

Use this handoff format in the task response; update `WORKLIST.md` when it affects project progress:

```text
Task / expected behavior:
Branch and base revision:
Changed files and why (including uncommitted work):
Established facts: file + symbol + short finding
Checks: exact commands, results, and checks not run
Remaining issue / next concrete action:
Commit/push state and artifact locations if applicable:
```

Never store credentials or private user data in handoffs. A model must report uncertainty instead of presenting inferred results as observed evidence.

## Using UB Mode

The useful baseline is small changes, root-cause fixes, behavior tests and verifiable steps. The upstream skill also specifies companion tools and push behavior. Do not claim complexity/duplication/mutation gates ran if the tools are missing. Introduce expensive gates selectively after verifying compatibility. Existing project scope, permission, collaboration and release rules still apply; do not perform unrelated refactors, worktree cleanup or automatic pushes merely because an upstream template suggests them.

## Initial evaluation

First do a read-only trace of Social message-request acceptance with current file/function references and relevant tests. Then attempt one bounded bug fix in an isolated branch/worktree with coordinated ownership. Assess correct retrieval, minimal diff, actual verification, truthful reporting and a usable handoff. Review failures before granting broader tasks. Do not treat successful navigation as proof of implementation ability.

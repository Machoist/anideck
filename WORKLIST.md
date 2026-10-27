# AniDeck worklist

Updated 27 October 2026. This file is the resumable checklist; earlier development notes are historical.

## Saved and verified

- App source through `3de4263` is backed up on GitHub `main`. All 48 previously local commits were pushed.
- Current local Windows installer and portable ZIP: `preview-3de4263`. 425 automated tests pass; package audit, packaged Electron UI checks, archive integrity and installer/portable runtime equality pass.
- [Windows test build](https://github.com/Machoist/anideck/actions/runs/40459268760) and [Mac test build](https://github.com/Machoist/anideck/actions/runs/40459268720) both succeeded for `3de4263`. Successful CI does not establish physical device acceptance.
- Latest UI work is complete: progressive profile rendering, labeled most-watched genres and next milestone, fluid milestone navigation, compact Social requests/refresh, opaque three-card shuffle with matching reveal size, and equal-height Tonight/Horizon widgets.
- Profile customization, recovery-key sign-in, consent-based message requests, notification preferences, local-list import adapters and isolated optional Jellyfin functionality are implemented. The live checks below remain necessary.
- Subsequent changes add agent documentation and one regression test; current source suite has 426 passing tests. App runtime and existing packages still correspond to `3de4263` (425 tests at packaging). No public release or release tag was created.

## Local agent readiness

`AGENTS.md` is a compact entry point with on-demand repository map, product rules, verification and 32K workflow under `docs/agents/`. These documents do not install indexing/LSP/UB tools or change model settings.

The local Qwen agent completed a Social request trace/document and a policy-change regression test with substantial review. Reviewed test now verifies denial without writes/chat, pending-state preservation, successful restoration, retry status and exactly-once introduction delivery without friendship. Focused tests: 6 pass. Full suite independently rerun: 426 pass (localhost access required). See `docs/agents/MESSAGE-REQUEST-FLOW.md`.

Evaluation: useful for bounded supervised tasks; independent accuracy has not been established. Observed issues included guessed details after truncated reads, PowerShell/tool mismatches, incomplete assertions and unsupported verification claims. Use fresh scoped sessions, actual command evidence and diff review. Do not treat this exercise as model training or physical/live acceptance. Next local-agent assignment can be a read-only import-mapping review in parallel with CI artifact acceptance, with coordinated ownership before edits. Runtime remains `preview-3de4263`.

## Next, in order

1. Inspect/download the successful Windows and Mac CI artifacts and confirm their expected contents. Retain the verified local Windows package as the current checkpoint.
2. Test live AniList and Kitsu sign-in and a deliberate local-list import, then read the destination list back. Verify status, progress, ratings, rewatch values and preservation of existing entries. Fixture-HTTP adapter coverage passes; no live provider list was changed during automated checks.
3. Test recovery-key sign-in and profile presentation on a physical second device; verify private Jellyfin playback and isolation from anime discovery and Social.
4. Test physical TV picture, sound, captions, codecs, LAN connectivity and recovery during media playback. Same-tab refresh, pairing retention, centered wordmark and pairing-code lifecycle pass packaged checks; media decoding remains simulated in protocol tests.
5. Verify real OS desktop alerts and two-account request/accept/decline, No messages and notification timing. Backend permission tests and UI bindings pass in isolation.
6. **Deferred backlog:** live Friends acceptance with Gio, including consent, messages, invitations and notifications. Resume when available; do not repeatedly request testing.
7. **Deferred backlog:** physical Mac installation, sign-in, playback and cross-platform Friends acceptance. Mac CI is now successful; physical acceptance and notarization remain separate work.
8. Consider public release after acceptance. Only Anikoto is user-confirmed working; other playback providers remain unverified or unreliable. Watch invitations save a plan; they do not synchronize playback.

## Resume safely

Use this checkout and preserve unrelated local files. Automated checks use isolated fixtures; do not change production lists, profiles or messages as part of unattended verification. No local process needs to remain running to preserve this checkpoint.

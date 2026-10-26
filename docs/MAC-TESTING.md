# AniDeck Mac testing

Mac support is experimental until the GitHub Mac builds and real-device checks pass. The existing Windows .exe does not run on macOS.

## Get the test build

1. Push the current source to main. Open the repository’s Actions tab and select **Mac test build** for that commit.
2. Both jobs must pass: **macOS arm64** and **macOS x64**. Each runs the test suite, package privacy audit, signature verification and an isolated native launch check.
3. Download **AniDeck-mac-arm64-test** for Apple Silicon (M1/M2/M3/M4 and later), or **AniDeck-mac-x64-test** for an Intel Mac. Apple menu → About This Mac shows the chip/processor.
4. Extract the GitHub artifact ZIP, then the AniDeck Mac ZIP inside it. Copy AniDeck.app to Applications and open it from Finder.

The current Electron 33 runtime requires macOS 11 Big Sur or newer. Actual older-system and hardware compatibility still need testing.

These private test apps use ad-hoc signing, not an Apple Developer ID certificate or Apple notarization. macOS may block opening them. If so, report the exact message before proceeding. Do not disable Gatekeeper or remove quarantine attributes. Normal public Mac distribution still needs Developer ID signing and notarization.

Test builds install manually and do not auto-update. In Settings → About, verify a build ID beginning `mac-arm64-` or `mac-x64-` from the selected run.

## Windows ↔ Mac Friends check

1. Both testers open their current builds and sign in to their own AniList or Kitsu account.
2. Open Friends; confirm the profile handle is correct.
3. Exchange the Mac user’s AniDeck handle/friend code and send a request from Windows.
4. Accept it on Mac. Confirm each list updates without restarting.
5. Send the agreed test message; press Enter to send and Shift+Enter for a new line.
6. Confirm delivery on both sides. Then try a shared anime card, adding it to Planning, and a watch invitation/response.
7. For desktop alerts, the Mac user chooses whether to enable them and handles any macOS permission prompts.

Check Command-C/V/A in input fields, Command-F search, window resizing/fullscreen, playback, subtitle selection and TV connection separately. A successful Friends message does not establish playback/TV compatibility.

## Build locally on a Mac

```sh
npm ci
npm test
npm run dist:mac:test -- --arm64
# Intel instead:
npm run dist:mac:test -- --x64
```

`dist:mac:test` creates an explicitly marked test app and runs the test-only ad-hoc signing hook. It refuses ad-hoc signing of unmarked release builds. Production Mac release publication is not enabled by the test workflow.

Closing the main AniDeck window quits the app and stops its receiver/relay, matching the current Windows behavior. Sign-in data is stored locally on each computer; do not copy a Windows credential store to the Mac.

# AniDeck feature guide

## Your Decks

Open **Decks** in the top navigation. Tonight and Priority are built in; create other collections with names, descriptions, and optional comma-separated genre rules. Genre rules match up to the first 1,000 titles from the active tracker list; manual additions work independently. Matching happens in the background. Add titles through a deck's search or **Add to Deck** on catalog and matched library title pages.

A title can belong to several decks. Creating a deck, adding a title, passing a backlog card, or deleting a deck does not change AniList/Kitsu statuses. Decks, dashboard layout, swipe decisions, and new activity records are stored locally under the active tracker profile. Connect the same account on another device and these local collections will not automatically sync.

**Share deck** exports a JSON file with the deck's public title metadata and matched genre snapshot. **Import deck** makes a new collection from that file in one local save. There is no hosted community gallery yet. Files support up to 500 titles; imported account credentials and executable fields are not accepted.

## Your Home deck

Home includes Quick Log, an airing countdown, pinned decks, a planning-list roulette, and an optional activity widget. Use **Widgets** to show/hide modules. Use **Arrange** to drag headers, move modules with arrow buttons, choose widths, or drag the resize grip. Widths snap to compact, half, wide, and full; narrow windows stack the modules.

Quick Log shows current watching titles. Choose an episode with the slider and explicitly press **Log N** to update the selected tracker. Fresh progress is checked before writing. The airing widget counts down to the next upcoming airing among your shows this week. Roulette deals from a batch of planning titles and can add the selected title to Tonight.

The existing Home rows remain configurable separately in Settings → Home screen.

## Swipe backlog

Open **Swipe backlog** from Decks or My List. Right queues Tonight, up adds to Priority, and left passes locally. Touch/pointer gestures, arrow keys, and visible buttons are supported. Undo restores the last decision and preserves any deck membership that existed before it. Showing passed titles again leaves Tonight/Priority choices intact.

## Review deck

Open **Review cards** from Decks, My List, or Profile. Select this month, season, year, or all recorded activity. Export the Activity and Taste cards as PNG files using native save dialogs.

Activity starts being recorded with this release. It includes Quick Log increments and episodes completed in the player. The same episode logged and played on the same day counts once. Episode minutes are known episode lengths, not measured screen time. Genres and studios appear only when metadata is available. Earlier tracker progress is not assigned invented dates or watch durations. The latest 10,000 recorded episodes are retained locally.

## Verification

Automated checks cover isolated profile storage, serialized saves, imports, independent collection membership, local-only swipe decisions, undo, layout persistence, fresh Quick Log progress, activity deduplication, date windows, bounded canvas text, and export validation. A running-app click-through is still needed for pointer gestures, resizing, native save dialogs, and final visual polish.

## Next work

- Verify AnimePahe against a live session. JSON/XHR headers and HTML/challenge response handling have been improved; live requests are currently blocked in the research environment.
- Add AniWatch after the intended website URL is provided and its actual page structure is inspected.
- Design the AniDeck wordmark and app icon after the feature surfaces settle. The current mark remains in place.

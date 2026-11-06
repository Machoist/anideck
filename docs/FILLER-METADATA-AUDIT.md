# Filler metadata audit — 5 November 2026

Initial audit and implementation specification, followed by the 5 November implementation note below.

## Existing boundaries

`main.js` forwards catalog requests to `src/streamResolver.js`. Its catalog response normalizes provider episodes into integers. `src/hianime.js` parses provider episode IDs/numbers; `src/anikoto.js` supplies its listing and exact season mapping. Neither current path supplies a canon/mixed/filler classification to the renderer. Do not derive it from list gaps, thumbnail availability, titles or streaming errors.

`src/api.js` already exposes exact AniList → MAL mapping through AniZip. Keep filler enrichment separate from playback availability: a catalog classification never creates an episode or Play button. Private non-anime Jellyfin items must not enter public metadata lookup.

## Source findings

| Candidate | Established evidence | Constraint / decision |
| --- | --- | --- |
| [Jikan official OpenAPI schema](https://github.com/jikan-me/jikan-rest/blob/master/storage/api-docs/api-docs.json) | `/anime/{id}/episodes` is paginated; entries expose boolean `filler` and `recap`. The documented API allows 3 requests/second and60/minute. | Candidate for explicit filler/recap annotations, not a complete mixed-canon taxonomy. This audit's public MAL20 episode-page request timed out after12 seconds; live payload acceptance remains pending. Do not treat absent/false flags as a researched canon verdict. |
| [AniFillerPedia guide](https://anifillerpedia.wiki/docs/guide/) | Exact AniList/MAL/ AniDB lookup and researched canon/mixed/filler rows; absent rows mean no data. | Live AniList20 lookup resolved to internal115/Naruto with matching MAL20. Its episode GET returned220 rows, including canon1, mixed7 and filler26. A sampled citation had a description but no recorded source URL, so citation presence alone is not independent quality verification. |
| [AniFillerPedia dataset license](https://github.com/Napandee/AniFillerPedia/blob/master/DATA_LICENSE) | The live public `/api/v1/license` response reported CC BY-NC-SA4.0 and separate commercial licensing contact. | Keep it an evaluated candidate; establish suitable dataset reuse/attribution terms before shipping an integration or bundled classifications. The repository code's license does not replace the dataset license. |

Live GETs were read-only, public and unauthenticated. Evidence summaries: `work/filler-source-audit.log` and `work/filler-episodes-audit.log`. No account creation, contributions, export access requests or writes were performed. No third-party dataset was committed or bundled.

## Concrete implementation contract

Implement a provider-neutral record keyed by exact anime identity plus original episode number: `{identity, number, classification, source, sourceUrl, checkedAt}`. Classification is `canon`, `mixed`, `filler`, `recap` or `unknown`; only explicitly supported source values populate it. Keep source classifications distinguishable rather than converting Jikan's `filler:false` into canon.

Resolve exact AniList/MAL correspondence before requesting data. Split entries and absolute-numbered franchise guides require an explicit verified offset; matching a franchise title or subtracting previous season totals is insufficient. Specials and ambiguous offsets remain unknown. Validate positive integer episode numbers, identity agreement, bounded pages and conflicting duplicate rows before applying anything.

Fetch in the background with concurrent-request deduplication, bounded caching, throttling and failure backoff. A timeout,429, invalid response or missing mapping leaves episodes visible and playback usable; do not retry on every tab click or block title rendering. Fetch only the relevant mapped title/page range, not an entire catalog.

Add independent preferences: **Show filler indicators** and **Hide filler episodes**. Hiding defaults off. Use accessible labels and a source affordance; retain mixed/unknown episodes. Hiding pure filler affects only presentation, preserves original numbers and list totals, and offers a visible way to show hidden episodes. It must not alter watch progress, completion, automatic next-episode behavior or tracker writes. Player auto-skip is separate work.

Next implementation increment: neutral classification/parser and mapping fixtures first, followed by the background adapter and two real UI preferences once the source path has live acceptance. Cover split cours/absolute offsets, specials, conflicting IDs, duplicate classifications, null/false flags, pagination,429/timeouts, title/account changes, all-hidden results and restoration of the full list. Use the same results with AniList, Kitsu and local tracking.

## 5 November implementation

`src/filler.js` now adds optional Jikan episode annotations to remote anime title lists, with independent per-title preferences controlled above that title’s episode grid. The global Playback controls from the first build were removed following user feedback; old global flags are ignored. Only explicit `filler:true` without recap hides a row; `recap:true` gets a distinct label. False, null, conflicting flags and conflicting duplicate rows remain unknown. Each marked badge links to the exact MAL episode source. No third-party dataset is bundled.

Exact AniZip AniList/MAL/Kitsu correspondence, or exact Kitsu external MAL mapping, precedes lookup. Conflicting identities and different Kitsu/canonical combined counts reject enrichment; no implicit absolute-number offsets are used. Split/combined entries with unproven offsets remain unclassified. Jellyfin library pages are not integrated.

Reads are background-only, page/range bounded (100 episodes per Jikan page, at most two relevant pages), deduplicated, serialized at least 1.1 seconds apart, cached up to 100 pages for six hours, with a shared 60-second failure cooldown. No tracker identity, tokens or account data are sent. Labels/hiding affect DOM presentation only; actual availability, Play Next and all progress writes retain their existing episode lists and numbers.

Verification includes generated parser/mapping/cache/outage tests and actual Chromium DOM checks for labels, hide/show all, all-hidden recovery, stale navigation and unavailable-source visibility at wide/narrow sizes. Public Jikan requests through PowerShell/curl and the web tool did not succeed from this connection (DNS/connection timeout); live annotations are **not** claimed verified. Keep source availability acceptance open. No automatic skipping or researched canon/mixed classifications are implemented.

Per-title controls are available even when both choices are off or annotation lookup fails. Selecting labels/hiding updates the existing rows without reloading the page. Title-scoped choices persist through normal settings storage, independently from other titles. Save failures restore the prior choice and show an inline error.

The title-page controls were simplified to compact Filler Markers / Hide Filler dot toggles beside episode sorting (wrapping on narrow screens). The large Episode guide panel and routine status prose were removed; source links remain on badges, lookup status remains accessible to screen readers, and storage errors remain visible. Per-title persistence/filtering behavior is unchanged.

## 5 November — live One Piece source acceptance and functional correction

The initial Jikan-only adapter was not live-accepted and its visible toggles hid lookup failure. Jikan still timed out. A public GET to `https://api.tenrai.org/v1/anime/21/episodes?page=1` succeeded with 100 rows and explicit filler flags for 50,51,54–60,98,99. Official endpoint/schema documentation: https://api.tenrai.org/documentation. Tenrai is now the first source, Jikan the fallback, each with independent 60-second service cooldown. No API keys or account data are sent.

Remove the mandatory artwork mapping dependency when exact AniList MAL identity is already provided by the title's public metadata, or when exact Kitsu external IDs establish correspondence. Reject conflicting supplied external identities and mismatched episode URLs. Retain AniZip as a mapping fallback when necessary; its failure cannot suppress already verified catalog identities. Different running episode counts on explicitly airing titles no longer block exact-ID episode annotation; completed combined/split mismatch safeguards remain.

Recorded live source data drives the actual native renderer/controller check (no hardcoded classifications in runtime): sample 49,50,51,54,60,61 marks 50,51,54,60, then hiding leaves exactly49 and61 with unchanged numbers. The source GET is live; native DOM injection replays its recorded response with generated row layout, not the installed user's account/title page. This establishes source payload and parser/filter integration, not complete provider/title coverage or playback acceptance. The optional live payload is kept outside the repository and application package.

Redesign uses icon controls with separate On/Off/Loading/Waiting/hidden-count feedback, a small press confirmation and reduced-motion support. Filler rows receive a gold poster tag and source badge. Loading/unavailable/no-filler status is visible; an enabled preference is no longer presented as proof of successful annotation. Per-title preferences, progress/numbering preservation and Show-all recovery remain unchanged.

# Filler metadata audit — 5 November 2026

This is a source/mapping audit and implementation specification. No filler labels, hiding, automatic skipping or production metadata provider were enabled by this increment.

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

# Product rules

Read before changing the affected product behavior. These are existing requirements, not requests for additional features.

- AniDeck profiles and external trackers are optional. First-run tracking selection leads to AniDeck profile creation, existing-key sign-in, or Skip for now. A handle is public identity; the private account/recovery key authenticates the account.
- Customization belongs in Profile; account recovery and connections belong in Settings > Account. Preserve rich About me, avatar/banner guidance, optional time zone and the favorites shelf.
- Jellyfin connects only through Settings > Account. Keep private/non-anime library data separate from anime search, recommendations, public profile statistics and Social activity.
- Local-list import must preview changes and preserve the local list and existing destination entries by default. Explicit reviewed progress updates may advance episodes when status and rewatch state match, without changing destination scores or statuses. Keep provider IDs/mapping exact; avoid silently overwriting destination progress or ratings.
- Social contains Messages, Friends, Requests and Settings. Preserve recipient consent, privacy, block rules and permission checks on the server as well as the client. Accepting a message request does not create a friendship or grant private watcher-card access.
- Watch invitations save a plan; do not describe them as synchronized playback. Notification preferences must affect actual delivery, not just toggle appearance.
- Home/Back controls belong to the page and scroll away naturally. Preserve responsive layouts, contained opaque shuffle cards, matching shuffle/reveal dimensions and reduced-motion behavior.
- TV branding uses the centered wordmark. Same-tab refresh must preserve valid pairing; closed pairing must not regenerate a code simply on refresh. Keep lifecycle/security checks intact.
- Preserve the compatibility app ID and existing settings/session storage names. Do not rename them as cosmetic cleanup.

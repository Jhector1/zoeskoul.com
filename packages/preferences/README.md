# Shared application preferences

`@zoeskoul/preferences` is the browser-safe contract for ZoeSkoul display
preferences. It does not import Prisma, Next.js, Auth.js, database adapters, or
server-only modules.

## Legacy inventory

Before this checkpoint, the active preference writers and readers were:

| Key | Writers | Readers |
| --- | --- | --- |
| `NEXT_LOCALE` | Web and Student `persistLocale` helpers | Web locale server utilities and proxy |
| `learnoir:locale` | Web and Student `persistLocale` helpers | Browser compatibility fallback |
| `zoeskoul-theme` | `next-themes` in Student; Web used its default key | `next-themes` in Student and shared startup fallback |
| `APP_FONT_SIZE_PX` | Web and transplanted Student headers | Those same headers |
| `learnoir.sfx` | Web and transplanted Student `SfxProvider` | Those same providers |

Web and Student had duplicated locale, font, theme, and sound persistence.
Teacher had no preference initialization.

## Authority and synchronization

Authenticated bootstrap order is database, shared cookie, in-memory state,
legacy local storage, then defaults. A successful GET always replaces stale
local values with the database snapshot. Browser updates are optimistic, then
PATCH the Web API; a failed save leaves the responsive in-memory/local fallback
and exposes an error, but the next authenticated bootstrap replaces it from the
database.

Anonymous bootstrap order is shared cookie, local storage, then defaults. A
local anonymous snapshot is adopted only after GET explicitly reports that no
shared cookie exists; Web then validates it and writes the anonymous cookie.

Storage events synchronize same-origin tabs. The credentialed API and cookie
mirror synchronize cross-app navigation and revalidation. Logout leaves only
the non-sensitive display cookie and legacy appearance fallbacks.

## Cookie

`zoeskoul.preferences` contains a compact `v1` locale/theme/font/sound snapshot.
It contains no identity, role, token, email, billing, or private fields. Web is
the only cookie writer. Production uses `Domain=zoeskoul.com`, `Path=/`,
`SameSite=Lax`, and `Secure`; localhost omits `Domain` and `Secure`.

The cookie is intentionally not `HttpOnly` because Vite applications need to
read the non-sensitive snapshot before their authenticated preference request
finishes, preventing avoidable theme and font flashes.

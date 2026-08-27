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

Authenticated bootstrap uses the database when a preference row exists. For a
new account with no row yet, the shared cookie is adopted first; otherwise the
request's supported browser language is used before a conservative country
fallback and English. The first successful browser hydration also resolves the
legacy `system` theme to a concrete light or dark value so login, logout, route
changes, and later operating-system theme changes cannot silently change it.
Browser updates are optimistic and then PATCH the Web API.

Anonymous bootstrap order is shared cookie, local storage, then first-visit
inference. Browser language wins over country for locale inference, and English
is the final fallback. Once that snapshot is mirrored into the shared cookie,
automatic inference no longer replaces it; a later explicit locale or theme
action becomes the new persisted value.

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

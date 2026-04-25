# Parkio API

Parkio's public JSON API. The iPhone app and the website both consume it.
**Never** call themeparks.wiki directly from a client — always go through
these routes so caching, normalization, and graceful fallback are consistent.

## Base URL

- Production: `https://parkio.info/api`
- Pages preview: `https://parkio.pages.dev/api`
- Local dev: `http://localhost:3000/api`

All routes return `application/json; charset=utf-8`. All responses include a
`Cache-Control: public, s-maxage=…, stale-while-revalidate=…` header so the
edge CDN caches them.

## Supported parks

Only U.S. Disney parks. Slugs are stable.

| Resort slug         | Park slug              | Park name                       |
| ------------------- | ---------------------- | ------------------------------- |
| `walt-disney-world` | `magic-kingdom`        | Magic Kingdom                   |
| `walt-disney-world` | `epcot`                | EPCOT                           |
| `walt-disney-world` | `hollywood-studios`    | Disney's Hollywood Studios      |
| `walt-disney-world` | `animal-kingdom`       | Disney's Animal Kingdom         |
| `disneyland-resort` | `disneyland`           | Disneyland Park                 |
| `disneyland-resort` | `california-adventure` | Disney California Adventure     |

## Routes

### `GET /api/parks`

List every supported park with today's status + hours.

**Response**

```json
{
  "parks": [ ApiPark, … ],
  "count": 6,
  "lastUpdated": "2026-04-26T14:21:08.012Z"
}
```

Cache: `s-maxage=1800` (30 min), `stale-while-revalidate=3600`.

### `GET /api/parks/{parkSlug}`

Single park metadata.

**Response: `ApiPark`**

```json
{
  "id": "75ea578a-adc8-4116-a54d-dccb60765ef9",
  "slug": "magic-kingdom",
  "name": "Magic Kingdom",
  "resortSlug": "walt-disney-world",
  "status": "OPEN",
  "timezone": "America/New_York",
  "todayHours": {
    "open": "2026-04-26T09:00:00-04:00",
    "close": "2026-04-26T23:00:00-04:00"
  },
  "lastUpdated": "2026-04-26T14:21:08.012Z"
}
```

`status` ∈ `"OPEN" | "CLOSED" | "UNKNOWN"`.

### `GET /api/parks/{parkSlug}/live`

Live wait times + statuses for every supported attraction in the park.

**Response: `ApiParkLive`**

```json
{
  "parkSlug": "magic-kingdom",
  "lastUpdated": "2026-04-26T14:21:08.012Z",
  "live": true,
  "attractions": [
    {
      "id": "b2260923-9315-40fd-9c6b-44dd811dbe64",
      "slug": "mk-space-mountain",
      "parkSlug": "magic-kingdom",
      "name": "Space Mountain",
      "status": "OPERATING",
      "waitMinutes": 65,
      "coordinates": { "lat": 28.4188341691, "lng": -81.5781962872 },
      "lastUpdated": "2026-04-26T14:20:43.000Z"
    }
  ]
}
```

Cache: `s-maxage=300` (5 min), `stale-while-revalidate=1200`.

`status` ∈ `"OPERATING" | "DOWN" | "CLOSED" | "REFURBISHMENT" | "UNKNOWN"`.
`waitMinutes` is `null` when standby is not reported (e.g. virtual queue
only or status ≠ OPERATING).

When `live` is `false`, the upstream was unreachable and every attraction
will show `status: "UNKNOWN"` with `waitMinutes: null`. The shape stays
the same — clients can render an "Estimates unavailable" state.

### `GET /api/parks/{parkSlug}/hours`

Operating hours for today + the next ~14 days.

**Response: `ApiParkHours`**

```json
{
  "parkSlug": "magic-kingdom",
  "timezone": "America/New_York",
  "today": {
    "open": "2026-04-26T09:00:00-04:00",
    "close": "2026-04-26T23:00:00-04:00"
  },
  "schedule": [
    {
      "date": "2026-04-26",
      "type": "OPERATING",
      "open": "2026-04-26T09:00:00-04:00",
      "close": "2026-04-26T23:00:00-04:00"
    }
  ],
  "lastUpdated": "2026-04-26T14:21:08.012Z"
}
```

Cache: `s-maxage=1800` (30 min).

### `GET /api/resorts/{resortSlug}`

Resort metadata + the parks within it.

Supported slugs: `walt-disney-world`, `disneyland-resort`.

**Response: `ApiResort`**

```json
{
  "slug": "walt-disney-world",
  "name": "Walt Disney World",
  "timezone": "America/New_York",
  "parks": [ ApiPark, … ],
  "lastUpdated": "2026-04-26T14:21:08.012Z"
}
```

Cache: `s-maxage=1800` (30 min).

### `GET /api/attractions/{attractionSlug}`

Single attraction with live status + wait. Internally this hits the same
park-level cache as `/api/parks/{parkSlug}/live` so a request flood
across many attractions doesn't multiply upstream calls.

**Response: `ApiAttraction`**

```json
{
  "id": "b2260923-9315-40fd-9c6b-44dd811dbe64",
  "slug": "mk-space-mountain",
  "parkSlug": "magic-kingdom",
  "name": "Space Mountain",
  "status": "OPERATING",
  "waitMinutes": 65,
  "coordinates": { "lat": 28.4188341691, "lng": -81.5781962872 },
  "lastUpdated": "2026-04-26T14:20:43.000Z"
}
```

Cache: `s-maxage=300` (5 min).

## Error shape

All non-2xx responses use the same body:

```json
{
  "error": "not_found",
  "message": "Unknown park slug: foo",
  "status": 404
}
```

Possible `error` values: `not_found`, `bad_request`.

## Caching strategy

| Layer                | TTL                                |
| -------------------- | ---------------------------------- |
| In-memory (isolate)  | 5 min live · 30 min hours          |
| CDN (`s-maxage`)     | matches the in-memory TTL          |
| Stale-while-revalid. | 2× to 4× the TTL                   |

The in-memory cache is per-instance — fine for warm instances and
acceptable for the load this app needs. Swap `lib/cache.ts` for
Cloudflare KV if multi-region durability becomes important.

## Fallback behavior

If themeparks.wiki returns an error or times out:

- `parks/*/live` → returns the static attraction list with
  `live: false` and `status: "UNKNOWN"`.
- `parks/*/hours` → `today: null`, empty `schedule`.
- `parks/*` → park metadata still returns; `status: "UNKNOWN"`,
  `todayHours: null`.

Clients should treat `live: false` and `status: "UNKNOWN"` as cues to
render the UI's "estimates unavailable" state — never as an error.

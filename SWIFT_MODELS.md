# Parkio iOS Codable models

Drop-in `Codable` types matching the Parkio API shape. See `API.md` for
endpoint details.

## Configuration

```swift
enum Parkio {
    static let baseURL = URL(string: "https://parkio.info/api")!

    static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()
}
```

## Park

```swift
struct ApiPark: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let name: String
    let resortSlug: String
    let status: ParkStatus
    let timezone: String
    let todayHours: HoursWindow?
    let lastUpdated: Date
}

enum ParkStatus: String, Codable {
    case open    = "OPEN"
    case closed  = "CLOSED"
    case unknown = "UNKNOWN"
}

struct HoursWindow: Codable, Hashable {
    /// ISO-8601 with timezone offset, e.g. "2026-04-26T09:00:00-04:00"
    let open: Date
    let close: Date
}
```

## Attraction

```swift
struct ApiAttraction: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let parkSlug: String
    let name: String
    let status: AttractionStatus
    let waitMinutes: Int?
    let coordinates: Coordinates?
    let lastUpdated: Date
}

enum AttractionStatus: String, Codable {
    case operating     = "OPERATING"
    case down          = "DOWN"
    case closed        = "CLOSED"
    case refurbishment = "REFURBISHMENT"
    case unknown       = "UNKNOWN"
}

struct Coordinates: Codable, Hashable {
    let lat: Double
    let lng: Double
}
```

## Resort

```swift
struct ApiResort: Codable, Identifiable, Hashable {
    var id: String { slug }
    let slug: String
    let name: String
    let timezone: String
    let parks: [ApiPark]
    let lastUpdated: Date
}
```

## Live + hours wrappers

```swift
struct ApiParkLive: Codable, Hashable {
    let parkSlug: String
    let lastUpdated: Date
    let live: Bool
    let attractions: [ApiAttraction]
}

struct ApiParkHours: Codable, Hashable {
    let parkSlug: String
    let timezone: String
    let today: HoursWindow?
    let schedule: [ScheduleDay]
    let lastUpdated: Date

    struct ScheduleDay: Codable, Hashable {
        let date: String           // "YYYY-MM-DD"
        let type: ScheduleType
        let open: Date?
        let close: Date?
    }

    enum ScheduleType: String, Codable {
        case operating  = "OPERATING"
        case info       = "INFO"
        case extraHours = "EXTRA_HOURS"
        case closed     = "CLOSED"
    }
}

struct ApiParkList: Codable {
    let parks: [ApiPark]
    let count: Int
    let lastUpdated: Date
}

struct ApiError: Codable, Error {
    let error: String
    let message: String
    let status: Int
}
```

## Example fetch

```swift
func fetchLive(parkSlug: String) async throws -> ApiParkLive {
    let url = Parkio.baseURL.appendingPathComponent("parks/\(parkSlug)/live")
    let (data, _) = try await URLSession.shared.data(from: url)
    return try Parkio.decoder.decode(ApiParkLive.self, from: data)
}
```

## Notes for iOS

- **Slugs are stable.** Persist by `slug`, not by `id`. The themeparks.wiki
  UUID in `id` could change if upstream re-keys an entity; slugs won't.
- **Always handle `status: .unknown`.** It's the API's signal that live
  data is unavailable right now.
- **Coordinates** are real lat/lng on the actual park footprint —
  use them directly with MapKit annotations.
- **`live: false`** in `ApiParkLive` means the upstream was down. Show
  the cached/last-known state and consider polling sooner.

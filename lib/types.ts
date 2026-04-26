export type ParkId =
  | "magic-kingdom"
  | "epcot"
  | "hollywood-studios"
  | "animal-kingdom"
  | "disneyland"
  | "california-adventure";

export type Resort = "Walt Disney World" | "Disneyland Resort";

export type CrowdLevel = "Low" | "Moderate" | "High";

export type ParkStatus = "Open" | "Closed";

export interface Park {
  id: ParkId;
  name: string;
  shortName: string;
  resort: Resort;
  tagline: string;
  status: ParkStatus;
  crowd: CrowdLevel;
  hours: string;
  themeHex: string;
  themeAccentHex: string;
  /** Real-world center coordinates for the Leaflet map. */
  lat: number;
  lng: number;
  /** Default zoom level (16 ≈ park-wide; 17 for tighter parks). */
  zoom: number;
  /** themeparks.wiki entity UUID — used to fetch live wait times. */
  externalId: string;
}

export type RideTrend = "up" | "down" | "flat";

export type RideCategory =
  | "thrill"
  | "family"
  | "kids"
  | "show"
  | "water";

export interface Ride {
  id: string;
  parkId: ParkId;
  name: string;
  land: string;
  category: RideCategory;
  description: string;
  /** Real-world coordinates for the Leaflet map. */
  lat: number;
  lng: number;
  /** Fallback wait time used until live data loads. */
  baseWait: number;
  trend: RideTrend;
  lightningLane: boolean;
  height?: string;
  /** themeparks.wiki entity UUID — used to look up live wait time. */
  externalId: string;
}

/* ──────────────── Parkio public API response shapes ─────────────────
   These are what the iOS app and the website consume from /api/*.
   Stable on purpose — keep field names backwards-compatible.
   ─────────────────────────────────────────────────────────────────── */

export type ApiParkStatus = "OPEN" | "CLOSED" | "UNKNOWN";

export type ApiAttractionStatus =
  | "OPERATING"
  | "DOWN"
  | "CLOSED"
  | "REFURBISHMENT"
  | "UNKNOWN";

export interface ApiHoursWindow {
  /** ISO-8601 timestamp with timezone offset, e.g. "2026-04-26T09:00:00-04:00" */
  open: string;
  close: string;
}

export interface ApiCoordinates {
  lat: number;
  lng: number;
}

export interface ApiPark {
  /** themeparks.wiki entity UUID */
  id: string;
  /** Parkio slug (stable for iOS) */
  slug: string;
  name: string;
  resortSlug: string;
  status: ApiParkStatus;
  /** IANA timezone, e.g. "America/New_York" */
  timezone: string;
  todayHours: ApiHoursWindow | null;
  /** ISO-8601 timestamp when this snapshot was generated server-side */
  lastUpdated: string;
}

export interface ApiAttraction {
  /** themeparks.wiki entity UUID */
  id: string;
  /** Parkio slug (stable for iOS) */
  slug: string;
  parkSlug: string;
  name: string;
  status: ApiAttractionStatus;
  /** Standby wait in minutes, or null when not reported. */
  waitMinutes: number | null;
  coordinates: ApiCoordinates | null;
  lastUpdated: string;
}

export interface ApiResort {
  slug: string;
  name: string;
  timezone: string;
  parks: ApiPark[];
  lastUpdated: string;
}

/**
 * A scheduled time-based experience that's NOT a queue ride — shows,
 * parades, fireworks, and character meet & greets. Distinct from
 * ApiAttraction because the user-facing question is "when does it
 * start" rather than "how long is the wait".
 */
export type ApiEventType = "show" | "meet";

export interface ApiEvent {
  /** themeparks.wiki entity UUID */
  id: string;
  parkSlug: string;
  name: string;
  /** Categorized for the icon: 🎭 (show) vs 👑 (character meet). */
  type: ApiEventType;
  /**
   * Upcoming start times as ISO-8601 strings with the park's UTC
   * offset, sorted ascending. Past entries are filtered out by the
   * normalizer at request time.
   */
  showtimes: string[];
  lastUpdated: string;
}

export interface ApiParkLive {
  parkSlug: string;
  lastUpdated: string;
  /** True when data came from themeparks.wiki; false when fallback was used. */
  live: boolean;
  attractions: ApiAttraction[];
  /**
   * Time-based experiences (shows, parades, character meets) with
   * upcoming start times. Empty when the upstream has no schedule
   * for the day or no entities reported showtimes.
   */
  events: ApiEvent[];
}

export interface ApiParkHours {
  parkSlug: string;
  timezone: string;
  today: ApiHoursWindow | null;
  /** Up to 14 days of upcoming schedule. */
  schedule: Array<{
    /** ISO date "YYYY-MM-DD" */
    date: string;
    type: "OPERATING" | "INFO" | "EXTRA_HOURS" | "CLOSED";
    open: string | null;
    close: string | null;
  }>;
  lastUpdated: string;
}

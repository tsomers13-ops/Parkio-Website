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

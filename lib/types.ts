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
  /** Coordinates in 0-100 scale used for the SVG map. */
  x: number;
  y: number;
  baseWait: number;
  trend: RideTrend;
  lightningLane: boolean;
  height?: string;
}

import { createSeoParkPage } from "@/lib/seoParkPage";

const { generateMetadata, Page } = createSeoParkPage({
  parkId: "epcot",
  label: "EPCOT",
  variant: "best-rides",
  description: (todayLong) =>
    `What to ride at EPCOT today, ${todayLong}. Parkio's smart picks based on live wait times — Guardians of the Galaxy: Cosmic Rewind, Test Track, Frozen Ever After, Remy's Ratatouille Adventure, Soarin' Around the World, and every operating attraction — refreshed every minute.`,
});

export { generateMetadata };
export default Page;

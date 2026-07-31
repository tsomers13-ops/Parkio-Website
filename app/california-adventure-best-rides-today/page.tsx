import { createSeoParkPage } from "@/lib/seoParkPage";

const { generateMetadata, Page } = createSeoParkPage({
  parkId: "california-adventure",
  label: "California Adventure",
  variant: "best-rides",
  description: (todayLong) =>
    `What to ride at Disney California Adventure today, ${todayLong}. Parkio's smart picks based on live wait times — Radiator Springs Racers, Guardians of the Galaxy: Mission Breakout, Incredicoaster, WEB Slingers, Soarin' Around the World, and every operating attraction — refreshed every minute.`,
});

export { generateMetadata };
export default Page;

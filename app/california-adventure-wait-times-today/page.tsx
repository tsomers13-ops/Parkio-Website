import { createSeoParkPage } from "@/lib/seoParkPage";

const { generateMetadata, Page } = createSeoParkPage({
  parkId: "california-adventure",
  label: "California Adventure",
  variant: "wait-times",
  description: (todayLong) =>
    `Live Disney California Adventure wait times for ${todayLong}. Real-time queues for Radiator Springs Racers, Guardians of the Galaxy: Mission Breakout, Incredicoaster, WEB Slingers, Soarin' Around the World, and every operating attraction — refreshed every minute on Parkio.`,
});

export { generateMetadata };
export default Page;

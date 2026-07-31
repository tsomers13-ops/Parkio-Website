import { createSeoParkPage } from "@/lib/seoParkPage";

const { generateMetadata, Page } = createSeoParkPage({
  parkId: "epcot",
  label: "EPCOT",
  variant: "wait-times",
  description: (todayLong) =>
    `Live EPCOT wait times for ${todayLong}. Real-time queues for Test Track, Soarin', Guardians of the Galaxy: Cosmic Rewind and every operating attraction at EPCOT, refreshed every minute on Parkio.`,
});

export { generateMetadata };
export default Page;

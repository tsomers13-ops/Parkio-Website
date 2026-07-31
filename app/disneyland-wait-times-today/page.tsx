import { createSeoParkPage } from "@/lib/seoParkPage";

const { generateMetadata, Page } = createSeoParkPage({
  parkId: "disneyland",
  label: "Disneyland",
  variant: "wait-times",
  description: (todayLong) =>
    `Live Disneyland Park wait times for ${todayLong}. Real-time queues for Rise of the Resistance, Space Mountain, and every operating attraction at the original Disneyland in Anaheim, refreshed every minute on Parkio.`,
});

export { generateMetadata };
export default Page;

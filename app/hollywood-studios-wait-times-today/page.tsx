import { createSeoParkPage } from "@/lib/seoParkPage";

const { generateMetadata, Page } = createSeoParkPage({
  parkId: "hollywood-studios",
  label: "Hollywood Studios",
  variant: "wait-times",
  description: (todayLong) =>
    `Live Disney's Hollywood Studios wait times for ${todayLong}. Real-time queues for Star Wars: Rise of the Resistance, Tower of Terror, Slinky Dog Dash, Mickey & Minnie's Runaway Railway, and every operating attraction — refreshed every minute on Parkio.`,
});

export { generateMetadata };
export default Page;

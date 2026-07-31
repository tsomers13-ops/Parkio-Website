import { createSeoParkPage } from "@/lib/seoParkPage";

const { generateMetadata, Page } = createSeoParkPage({
  parkId: "magic-kingdom",
  label: "Magic Kingdom",
  variant: "wait-times",
  description: (todayLong) =>
    `Live Magic Kingdom wait times for ${todayLong}. Real-time queues for every operating attraction at Walt Disney World's flagship park, refreshed every minute on Parkio.`,
});

export { generateMetadata };
export default Page;

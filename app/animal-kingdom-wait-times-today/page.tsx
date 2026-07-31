import { createSeoParkPage } from "@/lib/seoParkPage";

const { generateMetadata, Page } = createSeoParkPage({
  parkId: "animal-kingdom",
  label: "Animal Kingdom",
  variant: "wait-times",
  description: (todayLong) =>
    `Live Disney's Animal Kingdom wait times for ${todayLong}. Real-time queues for Avatar Flight of Passage, Expedition Everest, Kilimanjaro Safaris, Na'vi River Journey, and every operating attraction — refreshed every minute on Parkio.`,
});

export { generateMetadata };
export default Page;

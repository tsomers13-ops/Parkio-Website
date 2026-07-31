import { createSeoParkPage } from "@/lib/seoParkPage";

const { generateMetadata, Page } = createSeoParkPage({
  parkId: "animal-kingdom",
  label: "Animal Kingdom",
  variant: "best-rides",
  description: (todayLong) =>
    `What to ride at Disney's Animal Kingdom today, ${todayLong}. Parkio's smart picks based on live wait times — Avatar Flight of Passage, Expedition Everest, Na'vi River Journey, Kilimanjaro Safaris, DINOSAUR, Kali River Rapids, and every operating attraction — refreshed every minute.`,
});

export { generateMetadata };
export default Page;

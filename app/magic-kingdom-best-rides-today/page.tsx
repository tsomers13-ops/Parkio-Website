import { createSeoParkPage } from "@/lib/seoParkPage";

const { generateMetadata, Page } = createSeoParkPage({
  parkId: "magic-kingdom",
  label: "Magic Kingdom",
  variant: "best-rides",
  description: (todayLong) =>
    `What to ride at Magic Kingdom today, ${todayLong}. Parkio's smart picks based on live wait times — Seven Dwarfs Mine Train, Space Mountain, Big Thunder Mountain, TRON Lightcycle / Run, Peter Pan's Flight, Pirates of the Caribbean, and every operating attraction — refreshed every minute.`,
});

export { generateMetadata };
export default Page;

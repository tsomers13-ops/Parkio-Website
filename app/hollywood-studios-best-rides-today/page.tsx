import { createSeoParkPage } from "@/lib/seoParkPage";

const { generateMetadata, Page } = createSeoParkPage({
  parkId: "hollywood-studios",
  label: "Hollywood Studios",
  variant: "best-rides",
  description: (todayLong) =>
    `What to ride at Disney's Hollywood Studios today, ${todayLong}. Parkio's smart picks based on live wait times — Rise of the Resistance, Slinky Dog Dash, Mickey & Minnie's Runaway Railway, Tower of Terror, Rock 'n' Roller Coaster, Millennium Falcon: Smugglers Run, and every operating attraction — refreshed every minute.`,
});

export { generateMetadata };
export default Page;

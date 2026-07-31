import { createSeoParkPage } from "@/lib/seoParkPage";

const { generateMetadata, Page } = createSeoParkPage({
  parkId: "disneyland",
  label: "Disneyland",
  variant: "best-rides",
  description: (todayLong) =>
    `What to ride at Disneyland today, ${todayLong}. Parkio's smart picks based on live wait times — Star Wars: Rise of the Resistance, Space Mountain, Indiana Jones Adventure, Matterhorn Bobsleds, Pirates of the Caribbean, Haunted Mansion, Millennium Falcon: Smugglers Run, and every operating attraction — refreshed every minute.`,
});

export { generateMetadata };
export default Page;

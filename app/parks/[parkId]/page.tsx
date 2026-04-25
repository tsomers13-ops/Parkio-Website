import { notFound } from "next/navigation";
import { ParkMap } from "@/components/ParkMap";
import { PARKS, getPark, getRidesForPark } from "@/lib/data";
import type { ParkId } from "@/lib/types";

interface ParkPageProps {
  params: { parkId: string };
}

export const dynamicParams = false;

export function generateStaticParams() {
  return PARKS.map((p) => ({ parkId: p.id }));
}

export function generateMetadata({ params }: ParkPageProps) {
  const park = getPark(params.parkId);
  if (!park) return { title: "Park · Parkio" };
  return {
    title: `${park.name} · Parkio`,
    description: `Live wait times and a clean map for ${park.name}.`,
  };
}

export default function ParkPage({ params }: ParkPageProps) {
  const park = getPark(params.parkId);
  if (!park) notFound();

  const rides = getRidesForPark(park.id as ParkId);

  return (
    <main className="relative">
      <ParkMap park={park} rides={rides} />
    </main>
  );
}

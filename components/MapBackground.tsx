import type { ParkId } from "@/lib/types";

interface MapBackgroundProps {
  parkId: ParkId;
  theme: string;
  accent: string;
}

/**
 * Per-park SVG backdrops with iconic landmarks.
 * Stylized + geometric — not photoreal — so they sit comfortably under
 * the ride pins without competing for attention.
 */
export function MapBackground({ parkId, theme, accent }: MapBackgroundProps) {
  const idSafe = parkId;
  return (
    <div className="absolute inset-0">
      {/* Base soft themed gradient */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(60% 50% at 30% 30%, ${accent}33 0%, transparent 60%), radial-gradient(60% 60% at 80% 70%, ${theme}26 0%, transparent 60%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)`,
        }}
      />
      <div className="bg-dots absolute inset-0 opacity-40" />

      <svg
        viewBox="0 0 1000 700"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <linearGradient id={`walkway-${idSafe}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#e2e8f0" stopOpacity="0.45" />
          </linearGradient>
          <linearGradient id={`water-${idSafe}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.55" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.18" />
          </linearGradient>
          <linearGradient id={`landmark-${idSafe}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={theme} stopOpacity="0.32" />
            <stop offset="100%" stopColor={theme} stopOpacity="0.12" />
          </linearGradient>
        </defs>

        {parkId === "magic-kingdom" && <MagicKingdomArt parkId={parkId} theme={theme} />}
        {parkId === "epcot" && <EpcotArt parkId={parkId} theme={theme} />}
        {parkId === "hollywood-studios" && <HollywoodArt parkId={parkId} theme={theme} />}
        {parkId === "animal-kingdom" && <AnimalKingdomArt parkId={parkId} theme={theme} />}
        {parkId === "disneyland" && <DisneylandArt parkId={parkId} theme={theme} />}
        {parkId === "california-adventure" && (
          <CaliforniaAdventureArt parkId={parkId} theme={theme} accent={accent} />
        )}
      </svg>
    </div>
  );
}

interface ArtProps {
  parkId: ParkId;
  theme: string;
  accent?: string;
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  MAGIC KINGDOM — Hub-and-spoke with Cinderella Castle                    */
/* ──────────────────────────────────────────────────────────────────────── */
function MagicKingdomArt({ parkId, theme }: ArtProps) {
  const walk = `url(#walkway-${parkId})`;
  const water = `url(#water-${parkId})`;
  const land = `url(#landmark-${parkId})`;
  return (
    <>
      {/* Train loop (dashed perimeter) */}
      <path
        d="M 100 220 Q 100 100, 250 100 L 750 100 Q 900 100, 900 220 L 900 480 Q 900 600, 750 600 L 250 600 Q 100 600, 100 480 Z"
        stroke={walk}
        strokeWidth="10"
        strokeDasharray="3 8"
        fill="none"
      />
      {/* Hub circle */}
      <circle cx="500" cy="380" r="64" fill={water} opacity="0.55" />
      {/* Spokes from hub */}
      <path d="M 500 380 L 220 200" stroke={walk} strokeWidth="14" strokeLinecap="round" />
      <path d="M 500 380 L 780 200" stroke={walk} strokeWidth="14" strokeLinecap="round" />
      <path d="M 500 380 L 220 560" stroke={walk} strokeWidth="14" strokeLinecap="round" />
      <path d="M 500 380 L 780 560" stroke={walk} strokeWidth="14" strokeLinecap="round" />
      <path d="M 500 380 L 500 620" stroke={walk} strokeWidth="14" strokeLinecap="round" />
      <path d="M 500 380 L 500 240" stroke={walk} strokeWidth="14" strokeLinecap="round" />
      {/* Cinderella Castle silhouette (top-center) */}
      <g transform="translate(420 130)">
        {/* base */}
        <rect x="20" y="60" width="120" height="60" fill={land} />
        <rect x="60" y="40" width="40" height="80" fill={land} />
        {/* center spire */}
        <polygon points="60,40 80,0 100,40" fill={land} />
        <rect x="78" y="-12" width="4" height="14" fill={theme} opacity="0.5" />
        {/* side towers */}
        <polygon points="20,60 32,30 44,60" fill={land} />
        <polygon points="116,60 128,30 140,60" fill={land} />
        {/* outer towers */}
        <rect x="0" y="80" width="20" height="40" fill={land} opacity="0.85" />
        <polygon points="0,80 10,55 20,80" fill={land} />
        <rect x="140" y="80" width="20" height="40" fill={land} opacity="0.85" />
        <polygon points="140,80 150,55 160,80" fill={land} />
      </g>
      {/* Big Thunder mountain silhouette (left) */}
      <polygon
        points="120,420 200,330 260,400 320,360 380,440"
        fill={land}
        opacity="0.6"
      />
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  EPCOT — Spaceship Earth + World Showcase Lagoon                         */
/* ──────────────────────────────────────────────────────────────────────── */
function EpcotArt({ parkId, theme }: ArtProps) {
  const walk = `url(#walkway-${parkId})`;
  const water = `url(#water-${parkId})`;
  const land = `url(#landmark-${parkId})`;
  // tiny diamond pattern for the geodesic sphere
  const sphereR = 70;
  return (
    <>
      {/* World Showcase lagoon (large oval) */}
      <ellipse
        cx="500"
        cy="500"
        rx="260"
        ry="120"
        fill={water}
      />
      {/* Promenade ring around the lagoon */}
      <ellipse
        cx="500"
        cy="500"
        rx="290"
        ry="148"
        stroke={walk}
        strokeWidth="14"
        fill="none"
      />
      {/* Pavilions around the promenade (11 small markers) */}
      {Array.from({ length: 11 }).map((_, i) => {
        const angle = Math.PI + (i / 10) * Math.PI; // bottom half
        const cx = 500 + Math.cos(angle) * 290;
        const cy = 500 + Math.sin(angle) * 148;
        return (
          <rect
            key={i}
            x={cx - 8}
            y={cy - 8}
            width="16"
            height="16"
            fill={land}
            transform={`rotate(${(angle * 180) / Math.PI + 90} ${cx} ${cy})`}
          />
        );
      })}

      {/* Walkway from Spaceship Earth area to lagoon */}
      <path
        d="M 500 220 L 500 380"
        stroke={walk}
        strokeWidth="16"
        strokeLinecap="round"
      />

      {/* Spaceship Earth — big geodesic sphere */}
      <g transform="translate(500 180)">
        <circle r={sphereR} fill={land} />
        <circle r={sphereR} fill="none" stroke={theme} strokeOpacity="0.25" strokeWidth="1" />
        {/* Geodesic diamond pattern */}
        {Array.from({ length: 6 }).map((_, ring) => (
          <ellipse
            key={`r-${ring}`}
            rx={sphereR}
            ry={sphereR - ring * 12}
            fill="none"
            stroke={theme}
            strokeOpacity="0.14"
            strokeWidth="1"
          />
        ))}
        {Array.from({ length: 8 }).map((_, i) => {
          const a = (i / 8) * Math.PI;
          const x = Math.cos(a) * sphereR;
          return (
            <line
              key={`m-${i}`}
              x1={-x}
              y1="0"
              x2={x}
              y2="0"
              stroke={theme}
              strokeOpacity="0.12"
              strokeWidth="1"
            />
          );
        })}
        {/* Tripod legs */}
        <path
          d={`M ${-sphereR + 10} 30 L ${-sphereR - 10} 90 M 0 ${sphereR - 5} L 0 100 M ${sphereR - 10} 30 L ${sphereR + 10} 90`}
          stroke={theme}
          strokeOpacity="0.4"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>

      {/* Future World walkways forming a wide arc above */}
      <path
        d="M 200 240 Q 500 100, 800 240"
        stroke={walk}
        strokeWidth="12"
        fill="none"
      />
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  HOLLYWOOD STUDIOS — Tower of Terror, Chinese Theater                    */
/* ──────────────────────────────────────────────────────────────────────── */
function HollywoodArt({ parkId, theme }: ArtProps) {
  const walk = `url(#walkway-${parkId})`;
  const land = `url(#landmark-${parkId})`;
  return (
    <>
      {/* Hollywood Boulevard - vertical entry */}
      <rect x="475" y="500" width="50" height="180" fill={walk} opacity="0.7" />
      {/* Streets */}
      <path
        d="M 500 500 L 500 320 L 200 320"
        stroke={walk}
        strokeWidth="14"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M 500 320 L 800 320"
        stroke={walk}
        strokeWidth="14"
        fill="none"
        strokeLinecap="round"
      />
      {/* Sunset Blvd loop to tower */}
      <path
        d="M 800 320 Q 880 380, 800 460 L 600 480"
        stroke={walk}
        strokeWidth="14"
        fill="none"
        strokeLinecap="round"
      />

      {/* Chinese Theater — center pagoda */}
      <g transform="translate(440 240)">
        <rect x="20" y="50" width="120" height="60" fill={land} />
        <polygon points="0,50 80,5 160,50" fill={land} />
        <polygon points="20,50 80,20 140,50" fill={land} opacity="0.85" />
      </g>

      {/* Tower of Terror — tall rectangle on the right */}
      <g transform="translate(760 360)">
        <rect x="0" y="0" width="80" height="160" fill={land} />
        <rect x="0" y="0" width="80" height="20" fill={theme} opacity="0.4" />
        <rect x="20" y="40" width="40" height="100" fill={land} opacity="0.85" />
        {/* Vertical window stripes */}
        {Array.from({ length: 6 }).map((_, i) => (
          <line
            key={i}
            x1={20}
            y1={50 + i * 18}
            x2={60}
            y2={50 + i * 18}
            stroke={theme}
            strokeOpacity="0.3"
            strokeWidth="2"
          />
        ))}
      </g>

      {/* Galaxy's Edge geometric forms (top-left) */}
      <g transform="translate(100 200)">
        <polygon points="0,80 60,0 120,80" fill={land} />
        <polygon points="80,80 130,30 180,80" fill={land} opacity="0.85" />
        <rect x="40" y="80" width="120" height="40" fill={land} opacity="0.75" />
      </g>
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  ANIMAL KINGDOM — Tree of Life + Pandora floating mountains              */
/* ──────────────────────────────────────────────────────────────────────── */
function AnimalKingdomArt({ parkId, theme }: ArtProps) {
  const walk = `url(#walkway-${parkId})`;
  const water = `url(#water-${parkId})`;
  const land = `url(#landmark-${parkId})`;
  return (
    <>
      {/* River winding through */}
      <path
        d="M 60 160 Q 220 200, 320 320 Q 420 460, 600 480 Q 780 500, 940 380"
        stroke={water}
        strokeWidth="22"
        fill="none"
        strokeLinecap="round"
      />
      {/* Walkway loop */}
      <path
        d="M 160 280 Q 250 180, 400 200 L 600 200 Q 760 200, 820 320 Q 880 460, 760 540 L 400 560 Q 220 560, 160 440 Z"
        stroke={walk}
        strokeWidth="12"
        fill="none"
      />

      {/* Pandora floating mountains (top-left) */}
      <g transform="translate(120 130)">
        <polygon points="0,80 30,30 70,90 40,100" fill={land} />
        <polygon points="60,60 100,10 150,80 100,90" fill={land} opacity="0.85" />
      </g>

      {/* Tree of Life — center landmark */}
      <g transform="translate(500 380)">
        {/* Canopy: irregular cluster of leaf circles */}
        <circle cx="0" cy="-30" r="60" fill={land} />
        <circle cx="-40" cy="-10" r="44" fill={land} opacity="0.85" />
        <circle cx="40" cy="-10" r="44" fill={land} opacity="0.85" />
        <circle cx="-20" cy="-50" r="34" fill={land} opacity="0.85" />
        <circle cx="20" cy="-50" r="34" fill={land} opacity="0.85" />
        {/* Trunk */}
        <rect x="-10" y="20" width="20" height="50" fill={theme} opacity="0.4" />
      </g>

      {/* African savanna — extra grass dots top-right */}
      {Array.from({ length: 16 }).map((_, i) => {
        const x = 620 + ((i * 41) % 280);
        const y = 130 + ((i * 27) % 110);
        return (
          <circle
            key={`s-${i}`}
            cx={x}
            cy={y}
            r="8"
            fill="#10b981"
            opacity="0.18"
          />
        );
      })}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  DISNEYLAND — Sleeping Beauty Castle + Main Street                       */
/* ──────────────────────────────────────────────────────────────────────── */
function DisneylandArt({ parkId, theme }: ArtProps) {
  const walk = `url(#walkway-${parkId})`;
  const water = `url(#water-${parkId})`;
  const land = `url(#landmark-${parkId})`;
  return (
    <>
      {/* Train loop */}
      <path
        d="M 100 220 Q 100 100, 250 100 L 750 100 Q 900 100, 900 220 L 900 480 Q 900 600, 750 600 L 250 600 Q 100 600, 100 480 Z"
        stroke={walk}
        strokeWidth="10"
        strokeDasharray="3 8"
        fill="none"
      />
      {/* Town Square circle (bottom of Main Street) */}
      <circle cx="500" cy="600" r="40" fill={water} opacity="0.6" />
      {/* Main Street USA — vertical strip */}
      <rect x="475" y="440" width="50" height="160" fill={walk} opacity="0.7" />
      {/* Hub circle */}
      <circle cx="500" cy="380" r="56" fill={water} opacity="0.55" />
      {/* Spokes */}
      <path d="M 500 380 L 230 220" stroke={walk} strokeWidth="14" strokeLinecap="round" />
      <path d="M 500 380 L 770 220" stroke={walk} strokeWidth="14" strokeLinecap="round" />
      <path d="M 500 380 L 230 540" stroke={walk} strokeWidth="14" strokeLinecap="round" />
      <path d="M 500 380 L 770 540" stroke={walk} strokeWidth="14" strokeLinecap="round" />
      <path d="M 500 380 L 500 440" stroke={walk} strokeWidth="14" strokeLinecap="round" />

      {/* Sleeping Beauty Castle — smaller, more delicate than Cinderella's */}
      <g transform="translate(440 200)">
        {/* base */}
        <rect x="35" y="70" width="90" height="50" fill={land} />
        {/* center keep */}
        <rect x="65" y="40" width="30" height="50" fill={land} />
        <polygon points="65,40 80,10 95,40" fill={land} />
        <rect x="78" y="-2" width="4" height="14" fill={theme} opacity="0.5" />
        {/* side towers */}
        <rect x="20" y="55" width="20" height="65" fill={land} />
        <polygon points="20,55 30,30 40,55" fill={land} />
        <rect x="120" y="55" width="20" height="65" fill={land} />
        <polygon points="120,55 130,30 140,55" fill={land} />
      </g>

      {/* Matterhorn silhouette (top-center area) */}
      <polygon
        points="440,180 500,80 560,180"
        fill={land}
        opacity="0.55"
      />
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  CALIFORNIA ADVENTURE — Pixar Pal-A-Round wheel + Cars Land + Pier       */
/* ──────────────────────────────────────────────────────────────────────── */
function CaliforniaAdventureArt({ parkId, theme, accent }: ArtProps) {
  const walk = `url(#walkway-${parkId})`;
  const water = `url(#water-${parkId})`;
  const land = `url(#landmark-${parkId})`;
  return (
    <>
      {/* Paradise Bay (water on the right) */}
      <ellipse cx="780" cy="500" rx="180" ry="100" fill={water} />

      {/* Buena Vista Street strip (entrance, bottom-center) */}
      <rect x="475" y="540" width="50" height="140" fill={walk} opacity="0.7" />

      {/* Main looping path */}
      <path
        d="M 200 280 Q 280 200, 420 220 L 600 220 Q 720 220, 760 320 Q 800 420, 700 460 L 420 480 Q 240 480, 200 380 Z"
        stroke={walk}
        strokeWidth="14"
        fill="none"
      />

      {/* Pixar Pier curved path along the water */}
      <path
        d="M 620 540 Q 760 500, 880 460"
        stroke={walk}
        strokeWidth="10"
        fill="none"
        strokeLinecap="round"
      />

      {/* Grizzly Peak mountain (left) */}
      <polygon
        points="120,440 200,260 280,420"
        fill={land}
        opacity="0.7"
      />
      <polygon
        points="160,440 220,320 280,420"
        fill={land}
        opacity="0.5"
      />

      {/* Cars Land mountains (back-right) — Cadillac Range */}
      <g transform="translate(600 140)">
        <polygon points="0,120 50,30 100,110 150,40 200,120" fill={land} opacity="0.6" />
        <polygon points="40,120 80,60 120,120" fill={land} opacity="0.85" />
      </g>

      {/* Pixar Pal-A-Round Ferris wheel (right side) */}
      <g transform="translate(820 360)">
        <circle r="78" fill="none" stroke={theme} strokeOpacity="0.5" strokeWidth="3" />
        <circle r="78" fill={land} opacity="0.45" />
        <circle r="6" fill={theme} opacity="0.5" />
        {/* Spokes */}
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <line
              key={i}
              x1="0"
              y1="0"
              x2={Math.cos(a) * 78}
              y2={Math.sin(a) * 78}
              stroke={theme}
              strokeOpacity="0.32"
              strokeWidth="1.5"
            />
          );
        })}
        {/* Gondolas */}
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2;
          const x = Math.cos(a) * 78;
          const y = Math.sin(a) * 78;
          return <circle key={`g-${i}`} cx={x} cy={y} r="6" fill={theme} opacity="0.5" />;
        })}
        {/* Support legs */}
        <path
          d="M -55 50 L -75 130 M 55 50 L 75 130"
          stroke={theme}
          strokeOpacity="0.45"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
    </>
  );
}

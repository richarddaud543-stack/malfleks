/**
 * The map's coordinate maths, kept free of React so both the outline and the
 * city markers go through exactly one projection and can never drift apart.
 *
 * There is deliberately no map service here: the country outline is a stored
 * list of lat/lng vertices, so the page renders identically offline and needs
 * no tile server, script or API key.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

interface Point {
  x: number;
  y: number;
}

/** Square on purpose — at Tanzania's latitudes a degree of lng and of lat are
 *  within a few percent of each other, so an equirectangular fit into a square
 *  box keeps the shape recognisable without a real projection. */
export const MAP_SIZE = 440;
const PADDING = 22;

/** Mainland Tanzania's bounding box, loosened slightly so the coast and the
 *  southern border never sit flush against the viewBox edge. */
const BOUNDS = {
  minLng: 29.2,
  maxLng: 40.6,
  minLat: -11.9,
  maxLat: -0.8,
};

function project({ lat, lng }: LatLng): Point {
  const inner = MAP_SIZE - PADDING * 2;
  return {
    x:
      PADDING +
      ((lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * inner,
    // SVG y grows downwards, latitude grows northwards, hence the flip.
    y:
      PADDING +
      ((BOUNDS.maxLat - lat) / (BOUNDS.maxLat - BOUNDS.minLat)) * inner,
  };
}

/**
 * Marker position as a percentage of the map box. Markers are real HTML
 * buttons layered over the SVG rather than `<g>` elements inside it, so they
 * get native focus, activation and screen-reader semantics for free — and
 * percentages are what survives the SVG scaling responsively underneath them.
 */
export function projectPercent(coords: LatLng): { left: number; top: number } {
  const { x, y } = project(coords);
  return { left: (x / MAP_SIZE) * 100, top: (y / MAP_SIZE) * 100 };
}

/**
 * A deliberately coarse tracing of Tanzania's border, clockwise from the
 * Uganda/Rwanda corner: the northern straight-line border, the Kenya diagonal
 * past Kilimanjaro, the Indian Ocean coast, the Ruvuma in the south, then Lake
 * Nyasa, Zambia and Lake Tanganyika back up the west. Stylised, not survey
 * data — good enough to recognise the country, and no more.
 */
const TANZANIA_OUTLINE: LatLng[] = [
  { lng: 30.8, lat: -1.02 },
  { lng: 33.9, lat: -1.0 },
  { lng: 34.05, lat: -1.05 },
  { lng: 35.9, lat: -1.7 },
  { lng: 37.6, lat: -3.05 },
  { lng: 37.8, lat: -3.35 },
  { lng: 39.2, lat: -4.68 },
  { lng: 39.15, lat: -5.1 },
  { lng: 39.5, lat: -6.5 },
  { lng: 39.3, lat: -7.1 },
  { lng: 39.55, lat: -8.0 },
  { lng: 39.45, lat: -9.2 },
  { lng: 39.8, lat: -10.05 },
  { lng: 40.45, lat: -10.45 },
  { lng: 39.2, lat: -11.05 },
  { lng: 37.9, lat: -11.3 },
  { lng: 36.5, lat: -11.6 },
  { lng: 35.3, lat: -11.42 },
  { lng: 34.6, lat: -11.72 },
  { lng: 34.35, lat: -10.3 },
  { lng: 33.95, lat: -9.5 },
  { lng: 33.2, lat: -9.6 },
  { lng: 32.75, lat: -9.35 },
  { lng: 31.95, lat: -9.05 },
  { lng: 31.0, lat: -8.6 },
  { lng: 30.75, lat: -8.35 },
  { lng: 30.2, lat: -7.0 },
  { lng: 29.6, lat: -6.3 },
  { lng: 29.4, lat: -5.0 },
  { lng: 29.4, lat: -4.45 },
  { lng: 30.45, lat: -4.3 },
  { lng: 30.6, lat: -3.4 },
  { lng: 30.85, lat: -2.85 },
];

/** The Tanzanian lobe of Lake Victoria — the one landmark worth drawing, since
 *  it is what makes the northern edge read as Tanzania at a glance. */
const LAKE_VICTORIA: LatLng[] = [
  { lng: 31.8, lat: -1.02 },
  { lng: 33.6, lat: -1.02 },
  { lng: 33.9, lat: -1.95 },
  { lng: 33.2, lat: -2.75 },
  { lng: 32.3, lat: -2.6 },
  { lng: 31.75, lat: -1.9 },
];

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Rounds a closed polygon into a soft blob by curving through each vertex's
 * neighbouring midpoints. Cheaper and more on-brand than storing a
 * higher-resolution coastline, and it matches the site's rounded surfaces.
 */
function smoothClosedPath(coords: LatLng[]): string {
  const points = coords.map(project);
  const start = midpoint(points[points.length - 1], points[0]);
  const round = (n: number) => Math.round(n * 10) / 10;

  let d = `M${round(start.x)} ${round(start.y)}`;
  for (let i = 0; i < points.length; i++) {
    const vertex = points[i];
    const end = midpoint(vertex, points[(i + 1) % points.length]);
    d += `Q${round(vertex.x)} ${round(vertex.y)} ${round(end.x)} ${round(end.y)}`;
  }
  return `${d}Z`;
}

export const tanzaniaPath = smoothClosedPath(TANZANIA_OUTLINE);
export const lakeVictoriaPath = smoothClosedPath(LAKE_VICTORIA);

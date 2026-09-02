import BrandMarquee from "@/components/home/BrandMarquee";
import SceneOverture from "@/components/home/scene/SceneOverture";
import SceneRule from "@/components/home/scene/SceneRule";
import SceneRail from "@/components/home/scene/SceneRail";
import SceneCities from "@/components/home/scene/SceneCities";
import SceneClose from "@/components/home/scene/SceneClose";
import SceneOpening from "@/components/home/scene/SceneOpening";
import { getFeatured } from "@/components/home/featured";
import {
  getAllBranches,
  getAllBrands,
  getAllDeliveryAgents,
  getAllProducts,
} from "@/server/repositories";

/**
 * The home page, composed as a sequence of scenes rather than a stack of
 * sections.
 *
 * `docs/research/engineering-standards.md` records the finding this is built
 * on: what separates a premium build from an expensive-looking one is art
 * direction, choreography and restraint — "scene logic, not page logic" —
 * explicitly *not* effect count. So the page argues one idea, in order:
 *
 *   01 Overture  — what MalFleks is, in the founder's own words
 *   02 The rule  — `deliveryOffered`, the boolean the whole product turns on
 *   03 Catalogue — a scroll-linked rail; the only pinned effect on the page
 *   04 Where     — four cities, every number derived from the real data
 *   05 Close     — the quiet moment, and one ask
 *
 * `data-scene="night"` scopes the inverted palette to this page alone (see
 * globals.css). Every other route keeps the light system whose contrast was
 * computed and fixed under debt #10 — a marketplace's information surfaces
 * should stay calm, and only the page whose job is to impress goes dark.
 *
 * All four queries run in parallel; they are independent, and the scenes are
 * server-rendered with real data so the page's first paint is the content,
 * not a skeleton waiting on a client fetch.
 */
export default async function Home() {
  const [brands, branches, products, agents] = await Promise.all([
    getAllBrands(),
    getAllBranches(),
    getAllProducts(),
    getAllDeliveryAgents(),
  ]);

  // Every scene below counts, marches or pins catalogue rows. With none, they
  // render as blank bands and the home page reads as a failed load — so the
  // empty marketplace gets its own page rather than a hollowed-out version of
  // this one. See `SceneOpening`.
  if (brands.length === 0) {
    return (
      <div data-scene="night">
        <SceneOpening />
      </div>
    );
  }

  // Picked server-side so the browser receives the chosen items rather than
  // the whole catalogue it chose them from.
  const featured = getFeatured(brands, products);

  return (
    <div data-scene="night">
      <SceneOverture brands={brands} branches={branches} />

      {/* The existing marquee, unchanged and still covered by its own tests —
          it reads correctly on the dark ground because it renders the real
          logo files rather than tinting them. */}
      <div className="py-6">
        <BrandMarquee brands={brands} />
      </div>

      <SceneRule branches={branches} />
      <SceneRail items={featured} />
      <SceneCities branches={branches} agents={agents} />
      <SceneClose />
    </div>
  );
}

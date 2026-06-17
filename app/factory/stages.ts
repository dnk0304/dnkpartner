/**
 * Locked source of truth for the /factory pipeline.
 *
 * Lives in its own module (not page.tsx) because Next.js 16 page files
 * may only export `default` + a small fixed set of route-segment exports
 * — any other named export fails type-gen with "Property X is not
 * assignable to type 'never'". Mirrors the pattern used by
 * app/dashboard/projects.ts.
 *
 * Order = pipeline order (n: 1 -> 8). Each stage carries exactly three
 * "lenses" — the 3-expert quality gate that must pass before the product
 * advances to the next stage.
 */

export interface FactoryLens {
  /** The check the expert performs. */
  name: string;
  /** The expert persona that owns the check. */
  role: string;
  /** One-line pass-bar — what "pass" means for this lens. */
  bar: string;
}

export interface FactoryStage {
  /** 1-based stage number (display + ordering). */
  n: number;
  /** Stable id for React keys + anchors. */
  id: string;
  /** Stage name. */
  name: string;
  /** What this stage outputs, one line. */
  produces: string;
  /** Exactly three lenses — the 3-expert gate. */
  lenses: [FactoryLens, FactoryLens, FactoryLens];
}

export const FACTORY_STAGES: readonly FactoryStage[] = [
  {
    n: 1,
    id: 'niche',
    name: 'Niche Discovery & Validation',
    produces: 'A validated niche brief — scored angles, built from your real input.',
    lenses: [
      { name: 'Input Fidelity', role: 'Niche Analyst', bar: 'Provably built from your seed — hard fail on canned/generic drift.' },
      { name: 'Demand Reality', role: 'Market Validator', bar: 'Every score backed by a real, citeable demand signal.' },
      { name: 'Differentiation', role: 'Competitive Strategist', bar: 'A defensible wedge vs what already exists.' },
    ],
  },
  {
    n: 2,
    id: 'blueprint',
    name: 'Product Blueprint',
    produces: 'A locked Offer / Market / Production plan before any file is built.',
    lenses: [
      { name: 'Offer Coherence', role: 'Offer Architect', bar: 'Format, transformation and price are consistent and honest.' },
      { name: 'Market Fit', role: 'SEO/Market Specialist', bar: 'Fits the format + buyer; price sits in the viable band.' },
      { name: 'Buildability', role: 'Production Planner', bar: 'Spec is complete enough to build with no open questions.' },
    ],
  },
  {
    n: 3,
    id: 'build',
    name: 'Build',
    produces: 'The real finished product files a buyer would actually receive.',
    lenses: [
      { name: 'Spec Conformance', role: 'Build QA', bar: 'Every file exists, complete, no placeholders or TODOs.' },
      { name: 'Craft & Correctness', role: 'Content/Domain Expert', bar: 'Accurate, coherent, finished — not first-draft.' },
      { name: 'Usability', role: 'End-User Proxy', bar: 'A real buyer gets the promised result with no missing pieces.' },
    ],
  },
  {
    n: 4,
    id: 'audit',
    name: 'Quality / Competitor Audit',
    produces: 'A benchmark report vs live competitors — ship / improve / kill.',
    lenses: [
      { name: 'Benchmark Honesty', role: 'Competitor Analyst', bar: 'Competitors are real, live, fairly represented.' },
      { name: 'Value Verdict', role: 'Quality Judge', bar: 'We meet or beat the field on the decisive axes.' },
      { name: 'Buyer-Trust', role: 'Trust/Compliance Checker', bar: 'No unbacked claims, no IP/licensing risk.' },
    ],
  },
  {
    n: 5,
    id: 'brand',
    name: 'Branding & Naming',
    produces: 'A brand + store name + visual identity direction for the product.',
    lenses: [
      { name: 'Brand Strategy', role: 'Brand Strategist', bar: 'Positioning + name fit the buyer and the niche, memorable.' },
      { name: 'Name & Trademark', role: 'Naming/Linguistics Specialist', bar: 'Name is available-feeling, clean, no obvious trademark clash.' },
      { name: 'Visual Identity', role: 'Identity Director', bar: 'Logo/palette/type direction is cohesive and on-trend.' },
    ],
  },
  {
    n: 6,
    id: 'channel',
    name: 'Channel / Marketplace Selection',
    produces: 'A recommendation of WHERE to sell — best platform(s) for this product.',
    lenses: [
      { name: 'Marketplace Fit', role: 'Marketplace Analyst', bar: 'Platform matches the format, buyer and discoverability.' },
      { name: 'Economics', role: 'Fees/Margin Specialist', bar: 'Fees, payout and pricing leave a healthy margin.' },
      { name: 'Audience & Traffic', role: 'Traffic Specialist', bar: 'The channel actually has reachable demand for this.' },
    ],
  },
  {
    n: 7,
    id: 'storefront',
    name: 'Storefront Setup',
    produces: 'The actual store/storefront stood up on the chosen channel.',
    lenses: [
      { name: 'Setup & Conversion', role: 'Storefront Specialist', bar: 'Store is correctly configured and conversion-ready.' },
      { name: 'Policy & Compliance', role: 'Policy/Compliance Specialist', bar: 'Meets channel rules, returns, tax and legal basics.' },
      { name: 'Merchandising', role: 'Merchandising Specialist', bar: 'Listings, sections and pricing presented to sell.' },
    ],
  },
  {
    n: 8,
    id: 'launch',
    name: 'Launch & Connectors',
    produces: 'A launch-ready draft listing + the app connectors that help — for one-click go-live.',
    lenses: [
      { name: 'Listing & SEO', role: 'Marketing/SEO Specialist', bar: 'Title/tags/copy match real buyer queries + sell the transformation.' },
      { name: 'Integrations', role: 'Automation Engineer', bar: 'Useful connectors (payments/email/automation) wired, optional.' },
      { name: 'Launch Readiness', role: 'Launch/Growth Specialist', bar: 'Saved as DRAFT, never auto-published; go-live checklist clears.' },
    ],
  },
] as const;

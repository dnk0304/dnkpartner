/**
 * financials — the financial breakdown the detail page renders as a table.
 *
 * Schema audit (against prisma/schema.prisma, wave-B 2026-06-07):
 *   - valorSubasta         → STORED  (Float?, Ghost's 2026-06-04 split column).
 *   - appraisalValue       → STORED  (Float?, "Tasación").
 *   - depositAmount        → STORED  (Float?).  When NULL we DERIVE 5% of
 *                            valorSubasta and mark `derived: true` + a note
 *                            so Pixel can label "estimado 5%". We do NOT
 *                            derive when depositAmount IS stored — honest.
 *   - claimedAmount        → STORED  (Float?, "Cantidad reclamada").
 *   - minimumBid           → STORED  (Float?).
 *   - bidIncrement         → STORED  (Float?, "Tramo / incremento").
 *   - finalBid             → STORED  (Float?, "Valor de adjudicación" post-close).
 *
 * Honest-NULL contract:
 *   - Every entry always appears in the array — the order is the UX order.
 *   - `value: null` means "we don't know". Pixel renders "—" or omits the
 *     row per its UX rule; the contract here is NEVER fabricate a 0 to mean
 *     "absent". A real 0 (post-failed-auction adjudication) is honest.
 *   - When a value is DERIVED from another stored value, `derived: true`
 *     and `note` carries the Spanish disclosure label.
 */

type AuctionLike = {
  valorSubasta?: number | null;
  appraisalValue?: number | null;
  depositAmount?: number | null;
  claimedAmount?: number | null;
  minimumBid?: number | null;
  bidIncrement?: number | null;
  finalBid?: number | null;
};

export type FinancialEntry = {
  /** Stable key Pixel switches on for icons / ordering / i18n keys. */
  key:
    | "valorSubasta"
    | "tasacion"
    | "deposit"
    | "claimed"
    | "minBid"
    | "bidIncrement"
    | "finalBid";
  /** Spanish label. */
  label: string;
  /** Euros, NOT cents. null = unknown (honest). */
  value: number | null;
  /** Always "EUR" here — Auction is Spain-only. */
  currency: "EUR";
  /** True when `value` was computed from another column (deposito 5%). */
  derived: boolean;
  /** Optional Spanish disclosure (e.g. "Estimado: 5% del valor de subasta"). */
  note?: string;
};

function toFiniteNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "bigint" ? Number(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build the ordered financial breakdown for an auction row.
 *
 * Order (recommended UX):
 *   1. Valor de subasta
 *   2. Tasación
 *   3. Depósito (5%)         — derived label when computed
 *   4. Importe reclamado
 *   5. Puja mínima
 *   6. Tramo / incremento
 *   7. Valor de adjudicación  — only meaningful post-close (else null)
 */
export function buildFinancials(auction: AuctionLike): FinancialEntry[] {
  const valorSubasta = toFiniteNumber(auction.valorSubasta);
  const tasacion = toFiniteNumber(auction.appraisalValue);
  const depositStored = toFiniteNumber(auction.depositAmount);
  const claimed = toFiniteNumber(auction.claimedAmount);
  const minBid = toFiniteNumber(auction.minimumBid);
  const tramo = toFiniteNumber(auction.bidIncrement);
  const finalBid = toFiniteNumber(auction.finalBid);

  // Depósito — STORED wins; DERIVE 5% of valorSubasta when stored is null
  // AND valorSubasta is a positive number. Round to 2 decimals (cents).
  let depositValue: number | null = depositStored;
  let depositDerived = false;
  let depositNote: string | undefined;
  if (depositValue == null && valorSubasta != null && valorSubasta > 0) {
    depositValue = Math.round(valorSubasta * 5) / 100; // 5% with 2dp rounding.
    depositDerived = true;
    depositNote = "Estimado: 5% del valor de subasta";
  }

  return [
    {
      key: "valorSubasta",
      label: "Valor de subasta",
      value: valorSubasta,
      currency: "EUR",
      derived: false,
    },
    {
      key: "tasacion",
      label: "Tasación",
      value: tasacion,
      currency: "EUR",
      derived: false,
    },
    {
      key: "deposit",
      label: "Depósito (5%)",
      value: depositValue,
      currency: "EUR",
      derived: depositDerived,
      note: depositNote,
    },
    {
      key: "claimed",
      label: "Importe reclamado",
      value: claimed,
      currency: "EUR",
      derived: false,
    },
    {
      key: "minBid",
      label: "Puja mínima",
      value: minBid,
      currency: "EUR",
      derived: false,
    },
    {
      key: "bidIncrement",
      label: "Tramo / incremento",
      value: tramo,
      currency: "EUR",
      derived: false,
    },
    {
      key: "finalBid",
      label: "Valor de adjudicación",
      value: finalBid,
      currency: "EUR",
      derived: false,
    },
  ];
}

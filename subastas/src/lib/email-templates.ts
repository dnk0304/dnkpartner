import {
  emailFallbackImageUrl,
  BRANDED_PLACEHOLDER_PATH,
} from './auction-image-url';
import {
  statusDateLabel,
  statusHumanLabel,
} from './auction-status';

export interface EmailTemplateProps {
  url: string;
  host: string;
  email: string;
}

export function createMagicLinkEmail({ url, host, email }: EmailTemplateProps): {
  subject: string;
  html: string;
  text: string;
} {
  const brandColor = "#000000";
  const brandName = "SubastasActivas";

  const escapedEmail = email.replace(/[&<>"']/g, (char) => {
    const escapeChars: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return escapeChars[char];
  });
  const escapedHost = host.replace(/[&<>"']/g, (char) => {
    const escapeChars: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return escapeChars[char];
  });

  const subject = `Sign in to ${brandName}`;
  
  const text = `Sign in to ${brandName}\n\n` +
    `Click the link below to sign in to your account:\n\n` +
    `${url}\n\n` +
    `If you didn't request this email, you can safely ignore it.\n\n` +
    `This link will expire in 24 hours.\n\n` +
    `${brandName} - The intelligence platform for premium auctions`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
      background-color: #f9fafb;
      color: #111827;
      line-height: 1.5;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, ${brandColor} 0%, #374151 100%);
      padding: 40px 20px;
      text-align: center;
    }
    .logo {
      width: 60px;
      height: 60px;
      background: white;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      font-weight: bold;
      color: ${brandColor};
      margin-bottom: 16px;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }
    .header h1 {
      margin: 0;
      color: white;
      font-size: 28px;
      font-weight: 700;
    }
    .header p {
      margin: 8px 0 0;
      color: rgba(255, 255, 255, 0.9);
      font-size: 14px;
    }
    .content {
      padding: 40px 32px;
    }
    .greeting {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
      margin: 0 0 16px;
    }
    .message {
      font-size: 15px;
      color: #4b5563;
      margin: 0 0 32px;
    }
    .button-container {
      text-align: center;
      margin: 32px 0;
    }
    .button {
      display: inline-block;
      background: ${brandColor};
      color: white;
      text-decoration: none;
      padding: 16px 40px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      transition: all 0.2s;
    }
    .button:hover {
      background: #374151;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }
    .info-box {
      background: #f3f4f6;
      border-left: 4px solid ${brandColor};
      padding: 16px;
      margin: 24px 0;
      border-radius: 4px;
    }
    .info-box p {
      margin: 0;
      font-size: 14px;
      color: #4b5563;
    }
    .footer {
      padding: 32px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
    }
    .footer p {
      margin: 0 0 8px;
      font-size: 13px;
      color: #6b7280;
    }
    .footer a {
      color: ${brandColor};
      text-decoration: none;
    }
    .security-note {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
      font-size: 13px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">S</div>
        <h1>${brandName}</h1>
        <p>The intelligence platform for premium auctions</p>
      </div>
      
      <div class="content">
        <p class="greeting">Welcome back! ðŸ‘‹</p>
        
        <p class="message">
          We received a request to sign in to your ${brandName} account associated with <strong>${escapedEmail}</strong>.
        </p>
        
        <div class="button-container">
          <a href="${url}" class="button">
            Sign in to ${brandName}
          </a>
        </div>
        
        <div class="info-box">
          <p>
            <strong>ðŸ”’ Secure sign-in:</strong> This link will expire in 24 hours and can only be used once.
          </p>
        </div>
        
        <p class="message">
          If you didn't request this email, you can safely ignore it. No action is required.
        </p>
        
        <div class="security-note">
          <p>
            <strong>Security tip:</strong> Never share this email or link with anyone. 
            ${brandName} will never ask you for your login credentials via email.
          </p>
        </div>
      </div>
      
      <div class="footer">
        <p>
          This email was intended for <strong>${escapedEmail}</strong>
        </p>
        <p>
          Sent by ${brandName} from ${escapedHost}
        </p>
        <p style="margin-top: 16px;">
          <a href="${url.replace(/\/api\/auth\/.*$/, '')}">Visit ${brandName}</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  return { subject, html, text };
}
export function createVerificationEmail({ url, host, email }: EmailTemplateProps): {
  subject: string;
  html: string;
  text: string;
} {
  const brandColor = "#000000";
  const brandName = "SubastasActivas";

  const escapedEmail = email.replace(/[&<>"']/g, (char) => {
    const escapeChars: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return escapeChars[char];
  });
  const escapedHost = host.replace(/[&<>"']/g, (char) => {
    const escapeChars: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return escapeChars[char];
  });

  const subject = `Verify your email for ${brandName}`;
  
  const text = `Welcome to ${brandName}!\n\n` +
    `Click the link below to verify your email address and activate your account:\n\n` +
    `${url}\n\n` +
    `If you didn't create an account with ${brandName}, you can safely ignore this email.\n\n` +
    `This link will expire in 24 hours.\n\n` +
    `${brandName} - The intelligence platform for premium auctions`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;
      background-color: #f9fafb;
      color: #111827;
      line-height: 1.5;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, ${brandColor} 0%, #374151 100%);
      padding: 40px 20px;
      text-align: center;
    }
    .logo {
      width: 60px;
      height: 60px;
      background: white;
      border-radius: 12px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      font-weight: bold;
      color: ${brandColor};
      margin-bottom: 16px;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }
    .header h1 {
      margin: 0;
      color: white;
      font-size: 28px;
      font-weight: 700;
    }
    .header p {
      margin: 8px 0 0;
      color: rgba(255, 255, 255, 0.9);
      font-size: 14px;
    }
    .content {
      padding: 40px 32px;
    }
    .greeting {
      font-size: 18px;
      font-weight: 600;
      color: #111827;
      margin: 0 0 16px;
    }
    .message {
      font-size: 15px;
      color: #4b5563;
      margin: 0 0 32px;
    }
    .button-container {
      text-align: center;
      margin: 32px 0;
    }
    .button {
      display: inline-block;
      background: ${brandColor};
      color: white;
      text-decoration: none;
      padding: 16px 40px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 16px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      transition: all 0.2s;
    }
    .button:hover {
      background: #374151;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }
    .features {
      background: #f9fafb;
      padding: 24px;
      margin: 24px 0;
      border-radius: 8px;
    }
    .features h3 {
      margin: 0 0 16px;
      font-size: 16px;
      color: #111827;
    }
    .features ul {
      margin: 0;
      padding: 0 0 0 20px;
      list-style: none;
    }
    .features li {
      margin-bottom: 8px;
      font-size: 14px;
      color: #4b5563;
      position: relative;
    }
    .features li:before {
      content: "âœ“";
      color: ${brandColor};
      font-weight: bold;
      position: absolute;
      left: -20px;
    }
    .info-box {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 16px;
      margin: 24px 0;
      border-radius: 4px;
    }
    .info-box p {
      margin: 0;
      font-size: 14px;
      color: #92400e;
    }
    .footer {
      padding: 32px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
    }
    .footer p {
      margin: 0 0 8px;
      font-size: 13px;
      color: #6b7280;
    }
    .footer a {
      color: ${brandColor};
      text-decoration: none;
    }
    .security-note {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
      font-size: 13px;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header">
        <div class="logo">S</div>
        <h1>${brandName}</h1>
        <p>The intelligence platform for premium auctions</p>
      </div>
      
      <div class="content">
        <p class="greeting">Welcome to ${brandName}! ðŸŽ‰</p>
        
        <p class="message">
          Thank you for creating an account with <strong>${escapedEmail}</strong>. 
          To get started, please verify your email address by clicking the button below.
        </p>
        
        <div class="button-container">
          <a href="${url}" class="button">
            Verify Email Address
          </a>
        </div>
        
        <div class="features">
          <h3>What's next?</h3>
          <ul>
            <li>Access real-time auction listings across Spain</li>
            <li>Set up custom alerts for properties in your target areas</li>
            <li>View detailed property information and documents</li>
            <li>Track bids and auction deadlines on an interactive map</li>
            <li>Upgrade to Gold or Diamond for advanced features</li>
          </ul>
        </div>
        
        <div class="info-box">
          <p>
            <strong>â° Important:</strong> This verification link will expire in 24 hours.
          </p>
        </div>
        
        <p class="message">
          If you didn't create this account, you can safely ignore this email.
        </p>
        
        <div class="security-note">
          <p>
            <strong>Security tip:</strong> Never share this email or link with anyone. 
            ${brandName} will never ask you for your login credentials via email.
          </p>
        </div>
      </div>
      
      <div class="footer">
        <p>
          This email was intended for <strong>${escapedEmail}</strong>
        </p>
        <p>
          Sent by ${brandName} from ${escapedHost}
        </p>
        <p style="margin-top: 16px;">
          <a href="${url.replace(/\/api\/auth\/.*$/, '')}">Visit ${brandName}</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>
  `;

  return { subject, html, text };
}

/**
 * Auction-alert email block — what each matched auction renders to.
 *
 * Every field except title/url is optional/nullable because the alert query
 * (`SELECT * FROM Auction`) returns whatever the row carries — some rows are
 * pre-auctions with no `endsAt`, some have no coords, some have no photo.
 * The template degrades gracefully when fields are absent.
 */
export interface AuctionAlertEmailProps {
  alertName?: string;
  auctions: Array<{
    title: string;
    url: string;
    province?: string | null;
    municipality?: string | null;
    appraisalValue?: number | null;
    /**
     * Valor subasta — DISTINCT from `appraisalValue` (Tasación). After Ghost's
     * 2026-06-04 split (commit `443a864`), the BOE "Valor subasta" reference
     * figure ships separately so the email can render Tasación + Valor subasta
     * + Cantidad reclamada as three distinct lines. Honest-NULL — Pixel's
     * renderer must omit the line when absent (never coerce to 0).
     */
    valorSubasta?: number | null;
    /**
     * Cantidad reclamada — the amount being claimed. Distinct from the other
     * two price columns; Pixel renders as a third secondary line when present.
     * Honest-NULL.
     */
    claimedAmount?: number | null;
    /** Primary "ends" timestamp — when the subasta is officially over. */
    endsAt?: string | Date | null;
    /** Legacy/secondary end timestamp some scrapers populate instead of endsAt. */
    endDateTime?: string | Date | null;
    /** Opening timestamp — used for PROXIMA_APERTURA "Próxima apertura" date. */
    opensAt?: string | Date | null;
    /** Suspended-auction resume target — used for SUSPENDIDA "Fecha prevista de reanudación". */
    resumeAt?: string | Date | null;
    /** Status enum — drives the badge (En curso / Próxima apertura / …) AND the date-line label. */
    status?: string | null;
    /** Category enum — Viviendas / Turismos / Terrenos / Garajes / etc. */
    category?: string | null;
    /** Raw imageUrl from the projection (may be a /api/auction-image/… resolver URL or a placeholder). */
    imageUrl?: string | null;
    /** Coords for the rung-2 Google Static Maps fallback. */
    latitude?: number | null;
    longitude?: number | null;
  }>;
  manageUrl: string;
}

/**
 * Email-safe absolute-URL image picker (server-side mirror of the
 * resolve-card-image ladder, via the SHARED helper in `auction-image-url.ts`).
 *
 * Wave52 (2026-06-04) — replaces the broken `tile.openstreetmap.org`
 * hot-link rungs 2/3 with the Google Static Maps → branded PNG placeholder
 * ladder. Zero OSM URLs ever leave this function.
 *
 * Ladder:
 *   Rung 1 — real photo: `imageUrl` that starts with `/api/auction-image/` or
 *            `/streetview/` → `${appUrl}${imageUrl}` (resolver-served JPEG).
 *            Also: any absolute https http(s) imageUrl (external CDN) that
 *            isn't an SVG → used directly.
 *   Rung 2 — Google Static Maps pin at the auction's coords (lat+lng present
 *            AND Maps Static API usable). Absolute https URL, key in querystring,
 *            email-safe (renders in Gmail/Outlook).
 *   Rung 3 — branded raster PNG placeholder hosted at our domain
 *            (`${appUrl}/images/email-placeholder.png`). PNG so Gmail/Outlook
 *            render it. SVG would be blocked.
 *
 * Degrade-to-placeholder behaviour:
 *   When the Static Maps API isn't usable (no key, or
 *   STATIC_MAPS_API_DISABLED=1 — the expected state until Dennis enables the
 *   "Maps Static API" toggle in GCP), rung-2 collapses STRAIGHT into rung 3.
 *   NEVER an OSM hot-link.
 *
 * The result is always an absolute https:// URL.
 */
function emailAuctionImageUrl(
  auction: AuctionAlertEmailProps['auctions'][number],
  appUrl: string,
): { src: string; alt: string; rung: 'photo' | 'map' | 'placeholder' } {
  const { imageUrl, latitude, longitude, title, category } = auction;

  // Rung 1 — real photo resolver paths.
  if (imageUrl && (imageUrl.startsWith('/api/auction-image/') || imageUrl.startsWith('/streetview/'))) {
    return {
      src: `${appUrl}${imageUrl}`,
      alt: title ? `Foto de ${title}` : 'Foto del bien',
      rung: 'photo',
    };
  }

  // Rung 1b — absolute http(s) imageUrl from an external CDN. Skip SVGs
  // (Gmail/Outlook block inline SVG in <img src>).
  if (imageUrl && /^https?:\/\//.test(imageUrl) && !imageUrl.endsWith('.svg')) {
    return {
      src: imageUrl,
      alt: title ? `Foto de ${title}` : 'Foto del bien',
      rung: 'photo',
    };
  }

  // Rungs 2 + 3 — delegate to the shared helper.
  //
  // The shared helper returns either:
  //   - a Google Static Maps URL (rung 2) when coords present AND API usable, or
  //   - `${appUrl}/images/email-placeholder.png` (rung 3) otherwise.
  //
  // It NEVER returns an OSM URL. So whether we're rung 2 or rung 3 is decided
  // by inspecting the returned URL (the only branded-placeholder URL contains
  // BRANDED_PLACEHOLDER_PATH; everything else is Google Static Maps).
  void category; // category not used for the image source (we deliberately do not ship SVG cartoons in email).
  const src = emailFallbackImageUrl(latitude ?? null, longitude ?? null, appUrl, category);
  const isPlaceholder = src.endsWith(BRANDED_PLACEHOLDER_PATH);
  if (isPlaceholder) {
    return {
      src,
      alt: title ? `Categoría: ${title}` : 'Subasta sin imagen disponible',
      rung: 'placeholder',
    };
  }
  return {
    src,
    alt: title ? `Mapa con ubicación de ${title}` : 'Mapa con la ubicación del bien',
    rung: 'map',
  };
}

/**
 * Format an end-date into a clean Spanish short date — "14 jun 2026".
 * Returns null when the input is missing/unparseable.
 */
function formatEndDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Resolve the date line for an auction block — STATUS-BRANCHED (locked by
 * Ken/Dennis 2026-06-04 wave52 status-DATES brief).
 *
 *   CELEBRANDOSE / ACTIVE       → "Termina: <endsAt>"           (fallback endDateTime)
 *   PROXIMA_APERTURA / PRE_AUCTION → "Próxima apertura: <opensAt>"
 *                                  OR "Próxima apertura: Fecha por confirmar"
 *                                  (NEVER a faked endsAt/endDateTime date —
 *                                  the scraper leaves placeholders in those
 *                                  columns for pre-auctions and we must not
 *                                  surface them.)
 *   SUSPENDIDA / SUSPENDED      → "Fecha prevista de reanudación: <resumeAt>"
 *                                  OR "Fecha prevista de reanudación: Fecha por confirmar"
 *   CANCELADA / CONCLUIDA_PORTAL / FINISHED / FINALIZADA_AUTORIDAD
 *                               → null (no date line — defensively, even
 *                                  though the ALERTABLE filter in
 *                                  /api/alerts/check should already exclude
 *                                  these from the email entirely)
 *
 * Uses `statusDateLabel()` from auction-status.ts as the single source of
 * truth for the label string (shared with the site card render).
 *
 * Returns { label, dateStr } where dateStr may be "Fecha por confirmar" when
 * the underlying date column is missing/null. Returns null only for terminal
 * statuses (defensive) or when status itself is null.
 */
function resolveAuctionDateLine(
  auction: AuctionAlertEmailProps['auctions'][number],
): { label: string; dateStr: string } | null {
  const label = statusDateLabel(auction.status);
  if (!label) return null;

  // Pick the date column to render based on the label (= status branch).
  const TBC = 'Fecha por confirmar';
  switch (label) {
    case 'Termina': {
      const end =
        formatEndDate(auction.endsAt) ?? formatEndDate(auction.endDateTime);
      // CELEBRANDOSE without any end timestamp → no date line at all (the
      // brief says "If neither parses → no date line").
      if (!end) return null;
      return { label, dateStr: end };
    }
    case 'Próxima apertura': {
      const open = formatEndDate(auction.opensAt);
      // BOE usually leaves opensAt null in the pre-auction phase. We surface
      // the label with "Fecha por confirmar" rather than NO line — so a buyer
      // still sees "Próxima apertura · pending date" instead of a silent gap.
      // Crucially we do NOT fall through to endsAt/endDateTime here (that
      // was the old bug — placeholder end dates leaked as "Termina").
      return { label, dateStr: open ?? TBC };
    }
    case 'Fecha prevista de reanudación': {
      const resume = formatEndDate(auction.resumeAt);
      return { label, dateStr: resume ?? TBC };
    }
    default:
      return null;
  }
}

/**
 * Status enum → human-readable Spanish label + email-safe inline-styled colors.
 *
 * The LABEL is always taken from the shared `statusHumanLabel()` (single
 * source of truth across email + site card) so a never-before-seen value
 * still gets a clean title-cased label — NEVER a raw `CONCLUIDA_PORTAL`-style
 * code (wave52 BUG-4 fix).
 *
 * The COLORS stay local because the email needs inline styles (CSS classes
 * don't survive Gmail's CSS pruning). One color per canonical status; legacy
 * aliases share the canonical color.
 */
function statusBadge(status: string | null | undefined): { label: string; bg: string; fg: string } | null {
  if (!status) return null;
  const label = statusHumanLabel(status);
  switch (status) {
    case 'CELEBRANDOSE':
    case 'ACTIVE':
      return { label, bg: '#dcfce7', fg: '#166534' };
    case 'PROXIMA_APERTURA':
    case 'PRE_AUCTION':
      return { label, bg: '#fef3c7', fg: '#92400e' };
    case 'SUSPENDIDA':
    case 'SUSPENDED':
      return { label, bg: '#fef3c7', fg: '#92400e' };
    case 'CANCELADA':
    case 'CANCELLED':
    case 'CONCLUIDA_PORTAL':
    case 'FINISHED':
    case 'FINALIZADA_AUTORIDAD':
    case 'CELEBRADA':
      return { label, bg: '#f3f4f6', fg: '#4b5563' };
    default:
      // Unknown / future status → neutral pill, but ALWAYS the human label
      // (never the raw code — statusHumanLabel cleans it).
      return { label, bg: '#f3f4f6', fg: '#4b5563' };
  }
}

export function createAuctionAlertEmail({ alertName, auctions, manageUrl }: AuctionAlertEmailProps): {
  subject: string;
  html: string;
  text: string;
} {
  const brandName = "SubastasActivas";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || 'https://subastasactivas.com';
  const subject = alertName
    ? `Nuevas subastas para tu alerta: ${alertName}`
    : "Nuevas subastas que coinciden con tus alertas";

  const escapeHtml = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

  const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

  /**
   * Build the three-labelled-value block for a single auction (Dennis-locked
   * 2026-06-04, brief `three-values-card-display`). Renders up to three
   * lines: Tasación (`appraisalValue`), Valor subasta (`valorSubasta`,
   * NEW after Ghost's 2026-06-04 split), Cantidad reclamada
   * (`claimedAmount`). Honest-NULL: a missing value is OMITTED — never
   * coerced to "0 €" or "Sin tasación". Returns "" when ALL three are
   * absent so the email block stays clean.
   */
  const valuesHtml = (auction: AuctionAlertEmailProps['auctions'][number]): string => {
    const lines: Array<{ label: string; amount: number }> = [];
    if (auction.appraisalValue != null && auction.appraisalValue > 0) {
      lines.push({ label: 'Tasación', amount: auction.appraisalValue });
    }
    if (auction.valorSubasta != null && auction.valorSubasta > 0) {
      lines.push({ label: 'Valor subasta', amount: auction.valorSubasta });
    }
    if (auction.claimedAmount != null && auction.claimedAmount > 0) {
      lines.push({ label: 'Cantidad reclamada', amount: auction.claimedAmount });
    }
    if (lines.length === 0) return '';
    return lines
      .map(
        (l, i) =>
          `<div style="font-size:13px;color:#111827;margin-top:${i === 0 ? 4 : 2}px;">
            <span style="color:#6b7280;font-weight:500;">${escapeHtml(l.label)}:</span>
            <span style="color:#111827;font-weight:600;margin-left:4px;">${EUR.format(l.amount)}</span>
          </div>`,
      )
      .join('');
  };

  const valuesText = (auction: AuctionAlertEmailProps['auctions'][number]): string => {
    const parts: string[] = [];
    if (auction.appraisalValue != null && auction.appraisalValue > 0) {
      parts.push(`Tasación ${EUR.format(auction.appraisalValue)}`);
    }
    if (auction.valorSubasta != null && auction.valorSubasta > 0) {
      parts.push(`Valor subasta ${EUR.format(auction.valorSubasta)}`);
    }
    if (auction.claimedAmount != null && auction.claimedAmount > 0) {
      parts.push(`Cantidad reclamada ${EUR.format(auction.claimedAmount)}`);
    }
    return parts.join(' · ');
  };

  const listHtml = auctions
    .map((auction) => {
      const location = [auction.municipality, auction.province].filter(Boolean).join(', ') || 'Sin ubicación';
      const image = emailAuctionImageUrl(auction, appUrl);
      const dateLine = resolveAuctionDateLine(auction);
      const badge = statusBadge(auction.status);
      const category = auction.category ? escapeHtml(auction.category) : null;

      const badgeHtml = badge
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;background:${badge.bg};color:${badge.fg};line-height:1.4;">${escapeHtml(badge.label)}</span>`
        : '';
      const categoryHtml = category
        ? `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:500;background:#eef2ff;color:#3730a3;line-height:1.4;margin-left:6px;">${category}</span>`
        : '';
      const dateHtml = dateLine
        ? `<div style="font-size:13px;color:#374151;margin-top:6px;"><strong>${dateLine.label}:</strong> ${escapeHtml(dateLine.dateStr)}</div>`
        : '';

      return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 16px;border-bottom:1px solid #e5e7eb;padding-bottom:16px;">
          <tr>
            <td valign="top" width="130" style="width:130px;padding-right:12px;">
              <img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" width="120" height="90" style="display:block;width:120px;height:90px;border-radius:6px;object-fit:cover;border:0;outline:none;text-decoration:none;background:#e5e7eb;" />
            </td>
            <td valign="top" style="vertical-align:top;">
              <div style="font-weight:600;color:#111827;font-size:15px;line-height:1.35;margin-bottom:6px;">${escapeHtml(auction.title)}</div>
              <div style="margin-bottom:6px;">${badgeHtml}${categoryHtml}</div>
              <div style="font-size:13px;color:#6b7280;">${escapeHtml(location)}</div>
              ${valuesHtml(auction)}
              ${dateHtml}
              <div style="margin-top:8px;">
                <a href="${escapeHtml(auction.url)}" style="color:#2563eb;text-decoration:none;font-size:13px;font-weight:600;">Ver subasta &rarr;</a>
              </div>
            </td>
          </tr>
        </table>
      `;
    })
    .join('');

  const textList = auctions
    .map((auction) => {
      const location = [auction.municipality, auction.province].filter(Boolean).join(', ') || 'Sin ubicación';
      const dateLine = resolveAuctionDateLine(auction);
      const badge = statusBadge(auction.status);
      const tags = [badge?.label, auction.category].filter(Boolean).join(' · ');
      const tagPart = tags ? ` [${tags}]` : '';
      const datePart = dateLine ? ` — ${dateLine.label} ${dateLine.dateStr}` : '';
      const values = valuesText(auction);
      const valuesPart = values ? ` — ${values}` : '';
      return `- ${auction.title}${tagPart} (${location})${valuesPart}${datePart}\n  ${auction.url}`;
    })
    .join('\n');

  const html = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;font-family:Arial, sans-serif;background:#f9fafb;color:#111827;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="padding:24px;background:#111827;color:#ffffff;">
        <h1 style="margin:0;font-size:20px;">${brandName}</h1>
        <p style="margin:8px 0 0;font-size:14px;color:#e5e7eb;">Alertas personalizadas</p>
      </div>
      <div style="padding:24px;">
        <h2 style="margin:0 0 12px;font-size:18px;">${subject}</h2>
        <p style="margin:0 0 20px;font-size:14px;color:#4b5563;">Encontramos nuevas subastas que coinciden con tus criterios.</p>
        <div>${listHtml}</div>
        <div style="margin-top:24px;text-align:center;">
          <a href="${manageUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;">Gestionar alertas</a>
        </div>
      </div>
    </div>
    <p style="text-align:center;font-size:12px;color:#6b7280;margin-top:16px;">
      Recibes este correo porque tienes alertas activas en ${brandName}.
    </p>
  </div>
</body>
</html>`;

  const text = `${subject}\n\n${textList}\n\nGestionar alertas: ${manageUrl}`;

  return { subject, html, text };
}

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
    /** Primary "ends" timestamp — when the subasta is officially over. */
    endsAt?: string | Date | null;
    /** Legacy/secondary end timestamp some scrapers populate instead of endsAt. */
    endDateTime?: string | Date | null;
    /** Opening timestamp — used when status is PROXIMA_APERTURA / row has no endsAt. */
    opensAt?: string | Date | null;
    /** Status enum — drives the badge (En curso / Próxima apertura / …). */
    status?: string | null;
    /** Category enum — Viviendas / Turismos / Terrenos / Garajes / etc. */
    category?: string | null;
    /** Raw imageUrl from the projection (may be a /api/auction-image/… resolver URL or a placeholder). */
    imageUrl?: string | null;
    /** Coords for the rung-2 OSM static-map fallback. */
    latitude?: number | null;
    longitude?: number | null;
  }>;
  manageUrl: string;
}

/**
 * Email-safe absolute-URL image picker (server-side mirror of the resolve-card-image ladder).
 *
 * Email clients can't run client JS, can't resolve relative paths, and Gmail/Outlook
 * frequently refuse to render inline SVG. We collapse the 3-rung ladder into an absolute
 * URL that an email client will actually fetch:
 *
 *   Rung 1 — real photo: `imageUrl` that starts with `/api/auction-image/` or `/streetview/`
 *            → `${APP_URL}${imageUrl}`. The resolver returns a PNG/JPEG, email-safe.
 *   Rung 2 — static map: lat+lng present → an absolute `https://tile.openstreetmap.org/...`
 *            URL. OSM tiles are PNG, hosted on HTTPS, and render reliably in every mail client.
 *   Rung 3 — placeholder: NO real photo AND NO coords. We deliberately do NOT use the SVG
 *            category cartoons here — Gmail/Outlook block inline SVG `<img>` and would render
 *            a broken image. We fall back to a centered-on-Spain OSM tile (Madrid, low zoom)
 *            so something always renders. The alt text labels it accordingly.
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

  // If imageUrl is already an absolute http(s) URL (e.g. an external CDN), use it directly
  // — only when it's clearly not a placeholder SVG (those wouldn't render in email anyway).
  if (imageUrl && /^https?:\/\//.test(imageUrl) && !imageUrl.endsWith('.svg')) {
    return {
      src: imageUrl,
      alt: title ? `Foto de ${title}` : 'Foto del bien',
      rung: 'photo',
    };
  }

  // Rung 2 — static map tile (PNG, https, email-safe).
  const hasCoords =
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude);
  if (hasCoords) {
    // Slippy-map tile, zoom 16 (close enough to read the street) — keeps this
    // helper self-contained instead of importing the server map-image module.
    const zoom = 16;
    const n = Math.pow(2, zoom);
    const xFloat = ((longitude! + 180) / 360) * n;
    const latRad = (latitude! * Math.PI) / 180;
    const yFloat =
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
    const x = Math.floor(xFloat);
    const y = Math.floor(yFloat);
    return {
      src: `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`,
      alt: title ? `Mapa con ubicación de ${title}` : 'Mapa con la ubicación del bien',
      rung: 'map',
    };
  }

  // Rung 3 — no photo, no coords. Use a low-zoom OSM tile centered on Spain (Madrid area)
  // so SOMETHING renders. Avoids the broken-image icon in Gmail/Outlook that an SVG would cause.
  // Tile coords for Madrid (40.4168, -3.7038) @ zoom 6: x=31, y=24.
  void category; // category unused at rung 3 (we don't ship SVG cartoons in email)
  return {
    src: `https://tile.openstreetmap.org/6/31/24.png`,
    alt: title ? `Categoría: ${title}` : 'Subasta sin imagen disponible',
    rung: 'placeholder',
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
 * Resolve the end-date line for an auction block:
 *   - prefer endsAt → fallback to endDateTime
 *   - for PROXIMA_APERTURA (or when only opensAt is set), use opensAt labelled "Apertura"
 * Returns { label, dateStr } so the caller can render "Termina: 14 jun 2026"
 * or "Apertura: 20 jul 2026", or null if no date can be resolved.
 */
function resolveAuctionDateLine(
  auction: AuctionAlertEmailProps['auctions'][number],
): { label: 'Termina' | 'Apertura'; dateStr: string } | null {
  // Primary: explicit end timestamp(s).
  const end = formatEndDate(auction.endsAt) ?? formatEndDate(auction.endDateTime);
  if (end) return { label: 'Termina', dateStr: end };
  // Pre-auction fallback: show the opening date instead.
  const open = formatEndDate(auction.opensAt);
  if (open) return { label: 'Apertura', dateStr: open };
  return null;
}

/**
 * Status enum → human-readable Spanish label + email-safe inline-styled colors.
 * Greys-out unknown / other statuses (SUSPENDIDA etc.) into a neutral pill so we
 * never render an unstyled raw enum string.
 */
function statusBadge(status: string | null | undefined): { label: string; bg: string; fg: string } | null {
  if (!status) return null;
  switch (status) {
    case 'CELEBRANDOSE':
      return { label: 'En curso', bg: '#dcfce7', fg: '#166534' };
    case 'PROXIMA_APERTURA':
      return { label: 'Próxima apertura', bg: '#fef3c7', fg: '#92400e' };
    case 'SUSPENDIDA':
      return { label: 'Suspendida', bg: '#f3f4f6', fg: '#4b5563' };
    case 'CANCELADA':
      return { label: 'Cancelada', bg: '#f3f4f6', fg: '#4b5563' };
    case 'CELEBRADA':
      return { label: 'Celebrada', bg: '#f3f4f6', fg: '#4b5563' };
    default:
      return { label: String(status), bg: '#f3f4f6', fg: '#4b5563' };
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

  const listHtml = auctions
    .map((auction) => {
      const location = [auction.municipality, auction.province].filter(Boolean).join(', ') || 'Sin ubicación';
      const price = auction.appraisalValue
        ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(auction.appraisalValue)
        : 'Sin tasación';
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
              <div style="font-size:13px;color:#111827;font-weight:600;margin-top:4px;">${price}</div>
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
      const price = auction.appraisalValue
        ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(auction.appraisalValue)
        : 'Sin tasación';
      const dateLine = resolveAuctionDateLine(auction);
      const badge = statusBadge(auction.status);
      const tags = [badge?.label, auction.category].filter(Boolean).join(' · ');
      const tagPart = tags ? ` [${tags}]` : '';
      const datePart = dateLine ? ` — ${dateLine.label} ${dateLine.dateStr}` : '';
      return `- ${auction.title}${tagPart} (${location}) — ${price}${datePart}\n  ${auction.url}`;
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

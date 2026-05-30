/**
 * Trades starter templates — full-page compositions assembled from
 * the trades blocks. Loaded via editor.setComponents() so traits +
 * owner-locks stay intact.
 */

export interface TradesTemplate {
  label: string;
  description: string;
  html: string;
  css?: string;
}

const PLUMBER_HTML = `
<nav data-locked-on-owner="true" style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;background:#fff;border-bottom:1px solid #e5e7eb;font-family:var(--brand-font,Inter,sans-serif);">
  <div style="font-size:1.2rem;font-weight:800;color:#111827;">Acme Plumbing</div>
  <ul style="display:flex;gap:24px;list-style:none;padding:0;margin:0;">
    <li><a href="#services" style="color:#374151;text-decoration:none;font-weight:600;">Services</a></li>
    <li><a href="#reviews" style="color:#374151;text-decoration:none;font-weight:600;">Reviews</a></li>
    <li><a href="#contact" style="color:#374151;text-decoration:none;font-weight:600;">Contact</a></li>
  </ul>
  <a href="tel:+15551234567" style="padding:10px 20px;background:var(--brand-primary,#2563eb);color:#fff;text-decoration:none;border-radius:var(--brand-radius,8px);font-weight:700;"><i class="fa-solid fa-phone" style="margin-right:6px;"></i>Call Now</a>
</nav>

<section data-locked-on-owner="true" style="position:relative;min-height:70vh;display:flex;align-items:center;justify-content:center;padding:80px 24px;background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);color:#fff;text-align:center;font-family:var(--brand-font,Inter,sans-serif);">
  <div style="max-width:760px;">
    <h1 style="font-size:3rem;font-weight:800;margin:0 0 16px;line-height:1.1;">Same-Day Plumbing You Can Trust</h1>
    <p style="font-size:1.2rem;margin:0 0 32px;opacity:0.9;">Upfront pricing. Licensed & insured. 24/7 emergency service.</p>
    <a href="tel:+15551234567" style="display:inline-block;padding:16px 36px;background:#fff;color:#2563eb;text-decoration:none;border-radius:var(--brand-radius,8px);font-weight:800;font-size:1.05rem;"><i class="fa-solid fa-phone" style="margin-right:8px;"></i>(555) 123-4567</a>
  </div>
</section>

<section id="services" data-locked-on-owner="true" style="padding:80px 24px;background:#f9fafb;font-family:var(--brand-font,Inter,sans-serif);">
  <div style="max-width:1100px;margin:0 auto;text-align:center;">
    <h2 style="font-size:2.25rem;font-weight:800;color:#111827;margin:0 0 12px;">Our Services</h2>
    <p style="color:#4b5563;margin:0 0 48px;font-size:1.05rem;">From a leaky faucet to a full repipe — we handle it all.</p>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;text-align:left;">
      <div style="background:#fff;padding:32px 24px;border-radius:var(--brand-radius,8px);box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <i class="fa-solid fa-faucet" style="font-size:2rem;color:var(--brand-primary,#2563eb);margin-bottom:16px;"></i>
        <h3 style="font-size:1.25rem;font-weight:700;margin:0 0 8px;color:#111827;">Leak Repair</h3>
        <p style="color:#4b5563;margin:0;line-height:1.6;">Stop drips and prevent water damage with our same-day leak repair service.</p>
      </div>
      <div style="background:#fff;padding:32px 24px;border-radius:var(--brand-radius,8px);box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <i class="fa-solid fa-toilet" style="font-size:2rem;color:var(--brand-primary,#2563eb);margin-bottom:16px;"></i>
        <h3 style="font-size:1.25rem;font-weight:700;margin:0 0 8px;color:#111827;">Drain Cleaning</h3>
        <p style="color:#4b5563;margin:0;line-height:1.6;">Clogged drains cleared fast with professional hydro-jetting equipment.</p>
      </div>
      <div style="background:#fff;padding:32px 24px;border-radius:var(--brand-radius,8px);box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <i class="fa-solid fa-temperature-high" style="font-size:2rem;color:var(--brand-primary,#2563eb);margin-bottom:16px;"></i>
        <h3 style="font-size:1.25rem;font-weight:700;margin:0 0 8px;color:#111827;">Water Heaters</h3>
        <p style="color:#4b5563;margin:0;line-height:1.6;">Repair, replacement, and tankless conversions — all major brands.</p>
      </div>
    </div>
  </div>
</section>

<section id="reviews" data-locked-on-owner="true" style="padding:64px 24px;background:#fff;font-family:var(--brand-font,Inter,sans-serif);">
  <div style="max-width:900px;margin:0 auto;text-align:center;">
    <h2 style="font-size:2rem;font-weight:800;color:#111827;margin:0 0 32px;">What Customers Say</h2>
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:24px;text-align:left;">
      <div style="background:#f9fafb;padding:28px;border-radius:var(--brand-radius,8px);">
        <div style="color:#f59e0b;margin-bottom:10px;">★★★★★</div>
        <p style="font-style:italic;color:#1f2937;margin:0 0 12px;line-height:1.6;">"Showed up on time, fixed our burst pipe in under an hour, and the price was exactly what they quoted. Highly recommend."</p>
        <p style="color:#6b7280;margin:0;font-weight:600;">— Sarah K.</p>
      </div>
      <div style="background:#f9fafb;padding:28px;border-radius:var(--brand-radius,8px);">
        <div style="color:#f59e0b;margin-bottom:10px;">★★★★★</div>
        <p style="font-style:italic;color:#1f2937;margin:0 0 12px;line-height:1.6;">"Best plumber in town. Honest, fast, and reasonably priced. They've been my go-to for 5 years."</p>
        <p style="color:#6b7280;margin:0;font-weight:600;">— Michael R.</p>
      </div>
    </div>
  </div>
</section>

<section id="contact" data-locked-on-owner="true" style="padding:80px 24px;background:#f9fafb;font-family:var(--brand-font,Inter,sans-serif);">
  <div style="max-width:560px;margin:0 auto;">
    <h2 style="text-align:center;font-size:2rem;font-weight:800;color:#111827;margin:0 0 12px;">Request a Quote</h2>
    <p style="text-align:center;color:#6b7280;margin:0 0 32px;">We typically respond within 30 minutes.</p>
    <form style="display:flex;flex-direction:column;gap:14px;">
      <input type="text" name="name" placeholder="Your name" style="padding:14px 16px;border:1px solid #d1d5db;border-radius:var(--brand-radius,8px);font-size:1rem;" />
      <input type="tel" name="phone" placeholder="Phone number" style="padding:14px 16px;border:1px solid #d1d5db;border-radius:var(--brand-radius,8px);font-size:1rem;" />
      <textarea name="message" placeholder="Describe the job..." rows="5" style="padding:14px 16px;border:1px solid #d1d5db;border-radius:var(--brand-radius,8px);font-size:1rem;font-family:inherit;resize:vertical;"></textarea>
      <button type="submit" style="padding:14px 28px;background:var(--brand-primary,#2563eb);color:#fff;border:none;border-radius:var(--brand-radius,8px);font-size:1rem;font-weight:700;cursor:pointer;">Send Request</button>
    </form>
  </div>
</section>

<footer data-locked-on-owner="true" style="padding:48px 24px 24px;background:#111827;color:#fff;font-family:var(--brand-font,Inter,sans-serif);">
  <div style="max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:32px;">
    <div>
      <h4 style="font-size:1.1rem;font-weight:800;margin:0 0 12px;">Acme Plumbing</h4>
      <p style="color:#9ca3af;margin:0;line-height:1.6;font-size:0.9rem;">Licensed & insured. Serving the community since 2010.</p>
      <p style="color:#9ca3af;margin:12px 0 0;font-size:0.85rem;">License #ABC123456</p>
    </div>
    <div>
      <h4 style="font-size:0.95rem;font-weight:700;color:#fff;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.05em;">Contact</h4>
      <p style="color:#9ca3af;margin:0 0 6px;font-size:0.9rem;"><i class="fa-solid fa-phone" style="margin-right:8px;"></i>(555) 123-4567</p>
      <p style="color:#9ca3af;margin:0;font-size:0.9rem;"><i class="fa-solid fa-envelope" style="margin-right:8px;"></i>info@acmeplumbing.com</p>
    </div>
    <div>
      <h4 style="font-size:0.95rem;font-weight:700;color:#fff;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.05em;">Hours</h4>
      <p style="color:#9ca3af;margin:0 0 6px;font-size:0.9rem;">Mon – Fri: 7am – 7pm</p>
      <p style="color:#9ca3af;margin:0 0 6px;font-size:0.9rem;">Sat: 8am – 4pm</p>
      <p style="color:#9ca3af;margin:0;font-size:0.9rem;">Sun: Emergency only</p>
    </div>
  </div>
  <div style="text-align:center;padding-top:24px;margin-top:32px;border-top:1px solid #1f2937;">
    <p style="font-size:0.8rem;color:#6b7280;margin:0;">© 2026 Acme Plumbing. All rights reserved.</p>
  </div>
</footer>
`;

const ELECTRICIAN_HTML = `
<nav data-locked-on-owner="true" style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;background:#fff;border-bottom:1px solid #e5e7eb;font-family:var(--brand-font,Inter,sans-serif);">
  <div style="font-size:1.2rem;font-weight:800;color:#111827;">Sparkline Electric</div>
  <ul style="display:flex;gap:24px;list-style:none;padding:0;margin:0;">
    <li><a href="#services" style="color:#374151;text-decoration:none;font-weight:600;">Services</a></li>
    <li><a href="#about" style="color:#374151;text-decoration:none;font-weight:600;">About</a></li>
    <li><a href="#contact" style="color:#374151;text-decoration:none;font-weight:600;">Contact</a></li>
  </ul>
  <a href="tel:+15551234567" style="padding:10px 20px;background:var(--brand-primary,#f59e0b);color:#fff;text-decoration:none;border-radius:var(--brand-radius,8px);font-weight:700;"><i class="fa-solid fa-bolt" style="margin-right:6px;"></i>Call (555) 123-4567</a>
</nav>

<section data-locked-on-owner="true" style="position:relative;min-height:65vh;display:flex;align-items:center;justify-content:center;padding:80px 24px;background:linear-gradient(135deg,#78350f 0%,#f59e0b 100%);color:#fff;text-align:center;font-family:var(--brand-font,Inter,sans-serif);">
  <div style="max-width:760px;">
    <h1 style="font-size:3rem;font-weight:800;margin:0 0 16px;line-height:1.1;">Master Electricians. On Time. On Budget.</h1>
    <p style="font-size:1.2rem;margin:0 0 32px;opacity:0.95;">Residential & commercial. Panel upgrades, EV chargers, lighting, and more.</p>
    <a href="#contact" style="display:inline-block;padding:16px 36px;background:#fff;color:#b45309;text-decoration:none;border-radius:var(--brand-radius,8px);font-weight:800;font-size:1.05rem;">Get a Free Estimate</a>
  </div>
</section>

<section id="services" data-locked-on-owner="true" style="padding:80px 24px;background:#f9fafb;font-family:var(--brand-font,Inter,sans-serif);">
  <div style="max-width:1100px;margin:0 auto;text-align:center;">
    <h2 style="font-size:2.25rem;font-weight:800;color:#111827;margin:0 0 48px;">Services We Offer</h2>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:24px;text-align:left;">
      <div style="background:#fff;padding:32px 24px;border-radius:var(--brand-radius,8px);box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <i class="fa-solid fa-plug" style="font-size:2rem;color:var(--brand-primary,#f59e0b);margin-bottom:16px;"></i>
        <h3 style="font-size:1.25rem;font-weight:700;margin:0 0 8px;color:#111827;">Panel Upgrades</h3>
        <p style="color:#4b5563;margin:0;line-height:1.6;">Modernize your home with a 200A panel upgrade. Code-compliant, permitted, and inspected.</p>
      </div>
      <div style="background:#fff;padding:32px 24px;border-radius:var(--brand-radius,8px);box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <i class="fa-solid fa-charging-station" style="font-size:2rem;color:var(--brand-primary,#f59e0b);margin-bottom:16px;"></i>
        <h3 style="font-size:1.25rem;font-weight:700;margin:0 0 8px;color:#111827;">EV Charger Install</h3>
        <p style="color:#4b5563;margin:0;line-height:1.6;">Level 2 home chargers installed for Tesla, Ford, Rivian, and all major brands.</p>
      </div>
      <div style="background:#fff;padding:32px 24px;border-radius:var(--brand-radius,8px);box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <i class="fa-solid fa-lightbulb" style="font-size:2rem;color:var(--brand-primary,#f59e0b);margin-bottom:16px;"></i>
        <h3 style="font-size:1.25rem;font-weight:700;margin:0 0 8px;color:#111827;">Lighting Design</h3>
        <p style="color:#4b5563;margin:0;line-height:1.6;">Indoor and outdoor lighting design that improves both aesthetics and safety.</p>
      </div>
    </div>
  </div>
</section>

<section id="contact" data-locked-on-owner="true" style="padding:80px 24px;background:#fff;font-family:var(--brand-font,Inter,sans-serif);">
  <div style="max-width:560px;margin:0 auto;">
    <h2 style="text-align:center;font-size:2rem;font-weight:800;color:#111827;margin:0 0 12px;">Get a Free Estimate</h2>
    <p style="text-align:center;color:#6b7280;margin:0 0 32px;">No-obligation quote within 24 hours.</p>
    <form style="display:flex;flex-direction:column;gap:14px;">
      <input type="text" name="name" placeholder="Your name" style="padding:14px 16px;border:1px solid #d1d5db;border-radius:var(--brand-radius,8px);font-size:1rem;" />
      <input type="tel" name="phone" placeholder="Phone number" style="padding:14px 16px;border:1px solid #d1d5db;border-radius:var(--brand-radius,8px);font-size:1rem;" />
      <textarea name="message" placeholder="What can we help with?" rows="5" style="padding:14px 16px;border:1px solid #d1d5db;border-radius:var(--brand-radius,8px);font-size:1rem;font-family:inherit;resize:vertical;"></textarea>
      <button type="submit" style="padding:14px 28px;background:var(--brand-primary,#f59e0b);color:#fff;border:none;border-radius:var(--brand-radius,8px);font-size:1rem;font-weight:700;cursor:pointer;">Request Estimate</button>
    </form>
  </div>
</section>

<footer data-locked-on-owner="true" style="padding:32px 24px;background:#111827;color:#9ca3af;text-align:center;font-family:var(--brand-font,Inter,sans-serif);font-size:0.85rem;">
  © 2026 Sparkline Electric · License #ELEC78910 · (555) 123-4567
</footer>
`;

export const TRADES_TEMPLATES = {
  plumber: {
    label: 'Plumber Landing',
    description: 'Hero, services, reviews, contact form, footer',
    html: PLUMBER_HTML,
  },
  electrician: {
    label: 'Electrician Landing',
    description: 'Hero, services, contact form, simple footer',
    html: ELECTRICIAN_HTML,
  },
} satisfies Record<string, TradesTemplate>;

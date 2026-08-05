/**
 * Render the welcome email to a standalone HTML file for visual review.
 *
 * Sends nothing and touches no database — it calls the same
 * `createWelcomeEmail` the live trigger calls, so what you screenshot is what
 * ships.
 *
 * Usage: npx tsx scripts/preview-welcome-email.ts [out.html]
 */
import { writeFileSync } from 'node:fs';
import { createWelcomeEmail } from '@/lib/email-templates';

const out = process.argv[2] ?? 'welcome-email-preview.html';

const { subject, html, text } = createWelcomeEmail({
  email: 'dennis.kotlenko@gmail.com',
  appUrl: 'https://subastasactivas.com',
  name: 'Dennis',
});

writeFileSync(out, html, 'utf8');

console.log(`subject: ${subject}`);
console.log(`html:    ${html.length} bytes -> ${out}`);
console.log(`text:    ${text.length} bytes`);

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
  const brandName = "SubastaPro";
  
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
  const brandName = "SubastaPro";
  
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

export interface AuctionAlertEmailProps {
  alertName?: string;
  auctions: Array<{
    title: string;
    url: string;
    province?: string | null;
    municipality?: string | null;
    appraisalValue?: number | null;
  }>;
  manageUrl: string;
}

export function createAuctionAlertEmail({ alertName, auctions, manageUrl }: AuctionAlertEmailProps): {
  subject: string;
  html: string;
  text: string;
} {
  const brandName = "SubastaPro";
  const subject = alertName
    ? `Nuevas subastas para tu alerta: ${alertName}`
    : "Nuevas subastas que coinciden con tus alertas";

  const listHtml = auctions
    .map((auction) => {
      const location = [auction.municipality, auction.province].filter(Boolean).join(', ');
      const price = auction.appraisalValue
        ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(auction.appraisalValue)
        : 'Sin tasación';
      return `
        <div style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
          <div style="font-weight: 600; color: #111827;">${auction.title}</div>
          <div style="font-size: 13px; color: #6b7280; margin-top: 4px;">${location || 'Sin ubicación'} • ${price}</div>
          <div style="margin-top: 8px;">
            <a href="${auction.url}" style="color: #2563eb; text-decoration: none; font-size: 13px;">Ver subasta</a>
          </div>
        </div>
      `;
    })
    .join('');

  const textList = auctions
    .map((auction) => {
      const location = [auction.municipality, auction.province].filter(Boolean).join(', ') || 'Sin ubicación';
      const price = auction.appraisalValue
        ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(auction.appraisalValue)
        : 'Sin tasación';
      return `- ${auction.title} (${location}) ${price}\n  ${auction.url}`;
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

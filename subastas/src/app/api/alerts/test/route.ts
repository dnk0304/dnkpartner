import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createAuctionAlertEmail } from '@/lib/email-templates';

/**
 * Test API endpoint to verify email notifications are working
 * 
 * Usage:
 * POST /api/alerts/test
 * Body: { "email": "test@example.com" } (optional, defaults to RESEND_FROM_EMAIL)
 */
export async function POST(request: NextRequest) {
  try {
    // Check for Resend API key
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'RESEND_API_KEY is not configured in environment variables' 
        },
        { status: 500 }
      );
    }

    // Get test email address from request body or use default
    const body = await request.json().catch(() => ({}));
    const testEmail = body.email || 'dennis.kotlenko@gmail.com';

    // Create Resend client
    const resend = new Resend(resendKey);
    const from = process.env.RESEND_FROM_EMAIL || 'SubastaPro <notifications@subastapro.com>';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || 'http://localhost:3005';

    // Create sample auction data for testing
    const sampleAuctions = [
      {
        title: 'Piso de 3 dormitorios en Madrid Centro',
        url: `${appUrl}/auction/test-1`,
        province: 'Madrid',
        municipality: 'Madrid',
        appraisalValue: 250000,
      },
      {
        title: 'Local comercial en Barcelona',
        url: `${appUrl}/auction/test-2`,
        province: 'Barcelona',
        municipality: 'Barcelona',
        appraisalValue: 180000,
      },
      {
        title: 'Garaje en Valencia',
        url: `${appUrl}/auction/test-3`,
        province: 'Valencia',
        municipality: 'Valencia',
        appraisalValue: 25000,
      },
    ];

    // Generate email content
    const { subject, html, text } = createAuctionAlertEmail({
      alertName: 'Test Alert - Email Verification',
      auctions: sampleAuctions,
      manageUrl: `${appUrl}/alerts`,
    });

    // Send test email
    const result = await resend.emails.send({
      from,
      to: [testEmail],
      subject: `[TEST] ${subject}`,
      html,
      text,
    });

    return NextResponse.json({
      success: true,
      message: `Test email sent successfully to ${testEmail}`,
      emailId: result.data?.id,
      from,
      to: testEmail,
      sampleAuctions: sampleAuctions.length,
    });
  } catch (error) {
    console.error('Error sending test email:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to send test email',
        details: error
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint to check configuration
 */
export async function GET() {
  const hasResendKey = Boolean(process.env.RESEND_API_KEY);
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'SubastaPro <notifications@subastapro.com>';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || 'http://localhost:3005';

  return NextResponse.json({
    configured: hasResendKey,
    fromEmail: hasResendKey ? fromEmail : 'Not configured',
    appUrl,
    instructions: {
      method: 'POST',
      endpoint: '/api/alerts/test',
      body: {
        email: 'your-email@example.com (optional)',
      },
    },
  });
}

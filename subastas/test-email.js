#!/usr/bin/env node

/**
 * Email API Test Script
 * 
 * Tests the email notification endpoint and checks configuration
 * Usage: node test-email.js
 */

const testEmailAPI = async () => {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  EMAIL NOTIFICATION TEST');
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Test GET endpoint first (check configuration)
    console.log('📋 Step 1: Checking configuration...\n');
    const getResponse = await fetch('http://localhost:3005/api/alerts/test');
    const getConfig = await getResponse.json();
    
    console.log('Configuration Status:');
    console.log('├─ RESEND_API_KEY:', getConfig.configured ? '✅ Configured' : '❌ Not configured');
    console.log('├─ From Email:', getConfig.fromEmail);
    console.log('└─ App URL:', getConfig.appUrl);
    
    if (!getConfig.configured) {
      console.log('\n' + '═'.repeat(55));
      console.log('❌ RESEND_API_KEY is NOT configured!');
      console.log('═'.repeat(55));
      console.log('\n📝 What you need to do:\n');
      console.log('1. Get a free Resend API key from https://resend.com');
      console.log('2. Add to your .env file:');
      console.log('   RESEND_API_KEY=re_your_key_here');
      console.log('   RESEND_FROM_EMAIL=SubastaPro <notifications@subastapro.com>');
      console.log('3. Restart your dev server');
      console.log('4. Run this script again\n');
      console.log('📖 See EMAIL_SETUP_INSTRUCTIONS.md for detailed steps\n');
      return;
    }
    
    // Test POST endpoint (send email)
    console.log('\n📧 Step 2: Sending test email...\n');
    const postResponse = await fetch('http://localhost:3005/api/alerts/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'dennis.kotlenko@gmail.com'
      }),
    });
    
    const result = await postResponse.json();
    
    console.log('═══════════════════════════════════════════════════════');
    if (result.success) {
      console.log('✅ SUCCESS! Test email sent successfully!');
      console.log('═══════════════════════════════════════════════════════\n');
      console.log('Email Details:');
      console.log('├─ Email ID:', result.emailId || 'N/A');
      console.log('├─ From:', result.from);
      console.log('├─ To:', result.to);
      console.log('└─ Sample Auctions:', result.sampleAuctions);
      console.log('\n📬 Check your inbox at dennis.kotlenko@gmail.com');
      console.log('   Subject: [TEST] Nuevas subastas para tu alerta...\n');
    } else {
      console.log('❌ FAILED! Could not send email');
      console.log('═══════════════════════════════════════════════════════\n');
      console.log('Error Details:');
      console.log(JSON.stringify(result, null, 2));
      console.log('\n💡 Troubleshooting:');
      console.log('   - Check RESEND_API_KEY is correct');
      console.log('   - Verify domain is set up in Resend dashboard');
      console.log('   - Check Resend logs: https://resend.com/logs\n');
    }
  } catch (error) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('❌ ERROR: Cannot connect to server');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('Error:', error.message);
    console.log('\n💡 Make sure:');
    console.log('   - Dev server is running (npm run dev)');
    console.log('   - Server is accessible at http://localhost:3005\n');
  }
};

// Run the test
testEmailAPI();

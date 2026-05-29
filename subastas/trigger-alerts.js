#!/usr/bin/env node

/**
 * Alert Notification Trigger Script
 * 
 * This script triggers the alert checking system to send email notifications
 * for any matching auctions in your watchlist.
 */

const triggerAlertCheck = async () => {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  ALERT NOTIFICATION TRIGGER');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log('📋 Triggering alert check system...\n');
    
    // Call the alert check endpoint
    const response = await fetch('http://localhost:3005/api/alerts/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    
    console.log('═══════════════════════════════════════════════════════');
    if (result.success) {
      console.log('✅ Alert check completed successfully!');
      console.log('═══════════════════════════════════════════════════════\n');
      console.log('Results:');
      console.log('├─ Alerts Checked:', result.data.alertsChecked);
      console.log('├─ Auctions Scanned:', result.data.auctionsScanned);
      console.log('├─ Matches Found:', result.data.matchesFound);
      console.log('└─ Notifications Sent:', result.data.notificationsSent);
      
      if (result.data.notificationsSent > 0) {
        console.log('\n📧 Email notifications have been sent!');
        console.log('   Check your inbox at dennis.kotlenko@gmail.com\n');
      } else if (result.data.matchesFound > 0) {
        console.log('\n⚠️  Matches found but no notifications sent.');
        console.log('   This could mean:');
        console.log('   - Email is not enabled for the alert');
        console.log('   - RESEND_API_KEY is not configured');
        console.log('   - Alert has no email associated\n');
      } else {
        console.log('\n📭 No new auctions matching your alerts in the last 24 hours.');
        console.log('   This is normal if:');
        console.log('   - No new auctions were added recently');
        console.log('   - Your alert criteria are very specific');
        console.log('   - The auctions were already sent before\n');
      }
    } else {
      console.log('❌ Alert check failed');
      console.log('═══════════════════════════════════════════════════════\n');
      console.log('Error:', result.error || 'Unknown error');
    }
  } catch (error) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('❌ ERROR: Cannot trigger alert check');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('Error:', error.message);
    console.log('\n💡 Make sure:');
    console.log('   - Dev server is running (npm run dev)');
    console.log('   - Server is accessible at http://localhost:3005');
    console.log('   - You have alerts configured in the database\n');
  }
};

// Run the trigger
triggerAlertCheck();

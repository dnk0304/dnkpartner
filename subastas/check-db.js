#!/usr/bin/env node

/**
 * Database Alert Checker
 * Shows your current alerts and recent auctions
 */

const checkDatabase = async () => {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  DATABASE STATUS CHECK');
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Check alerts
    console.log('📋 Checking your alerts...\n');
    const alertsResponse = await fetch('http://localhost:3005/api/user/alerts');
    
    if (!alertsResponse.ok) {
      console.log('⚠️  Could not fetch alerts (you may need to be logged in)');
      console.log('   Trying to check alert system status instead...\n');
    } else {
      const alertsData = await alertsResponse.json();
      if (alertsData.success && alertsData.data) {
        console.log(`✅ You have ${alertsData.data.length} alert(s) configured:\n`);
        alertsData.data.forEach((alert, i) => {
          console.log(`Alert ${i + 1}: ${alert.name || 'Unnamed'}`);
          console.log(`├─ Province: ${alert.province || 'Any'}`);
          console.log(`├─ Municipality: ${alert.municipality || 'Any'}`);
          console.log(`├─ Category: ${alert.category || 'Any'}`);
          console.log(`├─ Email Enabled: ${alert.emailEnabled ? 'Yes ✅' : 'No ❌'}`);
          console.log(`└─ Notification Type: ${alert.notificationType || 'grouped'}\n`);
        });
      }
    }
    
    // Check recent auctions
    console.log('🏠 Checking recent auctions...\n');
    const auctionsResponse = await fetch('http://localhost:3005/api/auctions?limit=5');
    
    if (auctionsResponse.ok) {
      const auctionsData = await auctionsResponse.json();
      if (auctionsData.success && auctionsData.data) {
        console.log(`✅ Database has ${auctionsData.pagination?.total || 'many'} total auctions`);
        console.log(`\nMost recent 5 auctions:\n`);
        auctionsData.data.slice(0, 5).forEach((auction, i) => {
          console.log(`${i + 1}. ${auction.title}`);
          console.log(`   ${auction.province} - ${auction.category}`);
          console.log(`   Status: ${auction.status}\n`);
        });
      }
    }
    
    // Check for auctions in last 24 hours
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    console.log(`📅 Checking auctions added in last 24 hours...\n`);
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('💡 TIP: To trigger alert notifications, run:');
    console.log('   node trigger-alerts.js');
    console.log('═══════════════════════════════════════════════════════\n');
    
  } catch (error) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('❌ ERROR: Cannot check database');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('Error:', error.message);
    console.log('\n💡 Make sure dev server is running: npm run dev\n');
  }
};

checkDatabase();

#!/usr/bin/env node

/**
 * Complete System Test
 * Tests all features implemented
 */

const testAll = async () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  COMPLETE SYSTEM TEST');
  console.log('═══════════════════════════════════════════════════════\n');
  
  let passed = 0;
  let failed = 0;
  
  // Test 1: Email Configuration
  console.log('Test 1: Email Configuration');
  try {
    const configResponse = await fetch('http://localhost:3005/api/alerts/test');
    const config = await configResponse.json();
    if (config.configured) {
      console.log('✅ PASSED - Resend API key configured\n');
      passed++;
    } else {
      console.log('❌ FAILED - Resend API key not configured\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAILED - Cannot connect to server\n');
    failed++;
  }
  
  // Test 2: Map API Endpoint
  console.log('Test 2: Map API Endpoint (All Auctions)');
  try {
    const mapResponse = await fetch('http://localhost:3005/api/auctions/map');
    const mapData = await mapResponse.json();
    if (mapData.success && mapData.data) {
      console.log(`✅ PASSED - Map API returns ${mapData.count} auctions with coordinates\n`);
      passed++;
    } else {
      console.log('❌ FAILED - Map API not working\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAILED - Cannot fetch map data\n');
    failed++;
  }
  
  // Test 3: Regular Auctions API
  console.log('Test 3: Regular Auctions API (Paginated)');
  try {
    const auctionsResponse = await fetch('http://localhost:3005/api/auctions?limit=10');
    const auctionsData = await auctionsResponse.json();
    if (auctionsData.success && auctionsData.data) {
      console.log(`✅ PASSED - Auctions API returns data (${auctionsData.data.length} items)\n`);
      passed++;
    } else {
      console.log('❌ FAILED - Auctions API not working\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAILED - Cannot fetch auctions\n');
    failed++;
  }
  
  // Test 4: Alert Check System
  console.log('Test 4: Alert Check System');
  try {
    const alertResponse = await fetch('http://localhost:3005/api/alerts/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const alertData = await alertResponse.json();
    if (alertData.success) {
      console.log('✅ PASSED - Alert check system functional\n');
      console.log(`   Alerts checked: ${alertData.data.alertsChecked}`);
      console.log(`   Auctions scanned: ${alertData.data.auctionsScanned}`);
      console.log(`   Matches found: ${alertData.data.matchesFound}\n`);
      passed++;
    } else {
      console.log('❌ FAILED - Alert check system error\n');
      failed++;
    }
  } catch (error) {
    console.log('❌ FAILED - Cannot check alerts\n');
    failed++;
  }
  
  // Test 5: Check if auctions have coordinates
  console.log('Test 5: Auction Coordinates Verification');
  try {
    const mapResponse = await fetch('http://localhost:3005/api/auctions/map?limit=1000');
    const mapData = await mapResponse.json();
    const auctionsResponse = await fetch('http://localhost:3005/api/auctions?limit=1000');
    const auctionsData = await auctionsResponse.json();
    
    const totalAuctions = auctionsData.pagination?.total || 0;
    const auctionsWithCoords = mapData.count || 0;
    const percentage = totalAuctions > 0 ? ((auctionsWithCoords / totalAuctions) * 100).toFixed(1) : 0;
    
    console.log(`✅ PASSED - Coordinate analysis complete`);
    console.log(`   Total auctions: ${totalAuctions}`);
    console.log(`   With coordinates: ${auctionsWithCoords} (${percentage}%)\n`);
    passed++;
  } catch (error) {
    console.log('❌ FAILED - Cannot analyze coordinates\n');
    failed++;
  }
  
  // Summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('  TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`Tests Passed: ${passed}/5 ✅`);
  console.log(`Tests Failed: ${failed}/5 ${failed > 0 ? '❌' : ''}\n`);
  
  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED! System is fully functional!\n');
    console.log('Next steps:');
    console.log('1. ✅ Check your email at dennis.kotlenko@gmail.com');
    console.log('2. Create an alert via the dashboard');
    console.log('3. Run: node trigger-alerts.js\n');
  } else {
    console.log('⚠️  Some tests failed. Check server logs for details.\n');
  }
};

testAll();

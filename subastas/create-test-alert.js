#!/usr/bin/env node

/**
 * Create Test Alert
 * Creates a test alert for dennis.kotlenko@gmail.com
 */

const createTestAlert = async () => {
  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  CREATE TEST ALERT');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log('📋 Creating test alert for Alicante properties...\n');
    
    // Create an alert for Alicante (where we have auctions)
    const response = await fetch('http://localhost:3005/api/alerts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Test Alert - Alicante Properties',
        email: 'dennis.kotlenko@gmail.com',
        emailEnabled: true,
        notificationType: 'grouped',
        province: 'Alicante',
        // Leave other filters empty to catch more auctions
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.log('❌ Could not create alert');
      console.log('Error:', error);
      console.log('\n💡 You may need to be logged in to create alerts via API');
      console.log('   Alternative: Create alert manually in the dashboard\n');
      return;
    }
    
    const result = await response.json();
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ Test alert created successfully!');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('Alert Details:');
    console.log('├─ Name: Test Alert - Alicante Properties');
    console.log('├─ Email: dennis.kotlenko@gmail.com');
    console.log('├─ Province: Alicante');
    console.log('└─ Email Enabled: Yes\n');
    
    console.log('📧 Now trigger the alert check to test notifications:\n');
    console.log('   node trigger-alerts.js\n');
    
  } catch (error) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('❌ ERROR');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('Error:', error.message);
    console.log('\n💡 Alternative ways to create an alert:\n');
    console.log('1. Log in to the dashboard at http://localhost:3005');
    console.log('2. Click "Alertas y Seguimiento" button');
    console.log('3. Create a new alert with:');
    console.log('   - Province: Alicante (or any province with auctions)');
    console.log('   - Enable email notifications');
    console.log('   - Save the alert\n');
    console.log('4. Then run: node trigger-alerts.js\n');
  }
};

createTestAlert();

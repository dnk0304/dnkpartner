const { PrismaClient } = require('@prisma/client');
const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'prisma', 'dev.db');
const adapter = new PrismaBetterSqlite3({ url: dbPath });

const prisma = new PrismaClient({ adapter });

async function upgradeUser() {
  try {
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: 'dennis.kotlenko@gmail.com' }
    });

    if (!user) {
      console.log('❌ User not found. Creating user with Diamond tier...');
      
      const newUser = await prisma.user.create({
        data: {
          email: 'dennis.kotlenko@gmail.com',
          tier: 'DIAMOND',
          emailVerified: new Date(),
        }
      });
      
      console.log('✅ User created successfully!');
      console.log(`   Email: ${newUser.email}`);
      console.log(`   Tier: ${newUser.tier}`);
      console.log(`   ID: ${newUser.id}`);
    } else {
      console.log('✅ User found. Updating tier to DIAMOND...');
      
      const updatedUser = await prisma.user.update({
        where: { email: 'dennis.kotlenko@gmail.com' },
        data: { tier: 'DIAMOND' }
      });
      
      console.log('✅ User upgraded successfully!');
      console.log(`   Email: ${updatedUser.email}`);
      console.log(`   Tier: ${updatedUser.tier} (was: ${user.tier})`);
      console.log(`   ID: ${updatedUser.id}`);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

upgradeUser();

#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function exec(command, description) {
  log(`\n${colors.cyan}▶ ${description}...${colors.reset}`);
  try {
    execSync(command, { stdio: 'inherit' });
    log(`${colors.green}✓ ${description} - Done!${colors.reset}`);
    return true;
  } catch (error) {
    log(`${colors.red}✗ ${description} - Failed!${colors.reset}`, colors.red);
    return false;
  }
}

function checkDockerRunning() {
  try {
    execSync('docker ps', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function checkContainersRunning() {
  try {
    const output = execSync('docker compose ps --format json', { encoding: 'utf-8' });
    const containers = output.trim().split('\n').filter(line => line).map(line => JSON.parse(line));
    const running = containers.filter(c => c.State === 'running');
    return running.length >= 2; // Postgres + Redis
  } catch {
    return false;
  }
}

function databaseExists() {
  const migrationsDir = path.join(__dirname, '..', 'prisma', 'migrations');
  return fs.existsSync(migrationsDir) && fs.readdirSync(migrationsDir).length > 0;
}

async function main() {
  log('\n' + '='.repeat(60), colors.bright);
  log('  🚀 SubastaPro - Master Startup Script', colors.bright + colors.cyan);
  log('='.repeat(60) + '\n', colors.bright);

  // Check for SQLite mode (no Docker needed!)
  const usingSQLite = !process.env.DATABASE_URL || process.env.USE_SQLITE === 'true';
  
  if (usingSQLite) {
    log('📁 Using SQLite (local file database) - No Docker needed!', colors.green);
    log('   Database file: prisma/dev.db\n', colors.yellow);
  } else {
    // Step 1: Check Docker
    log('Step 1: Checking Docker...', colors.blue + colors.bright);
    if (!checkDockerRunning()) {
      log('❌ Docker is not running!', colors.red);
      log('Tip: Set USE_SQLITE=true in .env to use local file database instead', colors.yellow);
      log('Or start Docker Desktop and try again.', colors.yellow);
      process.exit(1);
    }
    log('✓ Docker is running', colors.green);

    // Step 2: Start Docker Compose services
    log('\nStep 2: Starting database services...', colors.blue + colors.bright);
    if (!checkContainersRunning()) {
      if (!exec('docker compose up -d', 'Starting Postgres & Redis')) {
        process.exit(1);
      }
      // Wait for containers to be ready
      log('Waiting for services to be ready...', colors.yellow);
      await new Promise(resolve => setTimeout(resolve, 5000));
    } else {
      log('✓ Containers already running', colors.green);
    }
  }

  // Step 3: Run migrations if needed
  const stepNum = usingSQLite ? 1 : 3;
  log(`\nStep ${stepNum}: Setting up database...`, colors.blue + colors.bright);
  if (!databaseExists()) {
    if (!exec('npx prisma migrate dev --name init', 'Creating database schema')) {
      process.exit(1);
    }
    
    // Seed data
    if (!exec('npm run seed', 'Seeding database with Las Palmas data')) {
      log('Warning: Seed failed, but continuing...', colors.yellow);
    }
  } else {
    log('✓ Database already configured', colors.green);
    log('(Run "npx prisma migrate reset" to reset database)', colors.yellow);
  }

  // Step 4: Generate Prisma Client
  const nextStep = usingSQLite ? 2 : 4;
  log(`\nStep ${nextStep}: Generating Prisma Client...`, colors.blue + colors.bright);
  exec('npx prisma generate', 'Generating Prisma Client');

  // Step 5: Build if production, or skip for dev
  const buildStep = usingSQLite ? 3 : 5;
  const isDev = process.argv.includes('--dev');
  
  if (!isDev) {
    log(`\nStep ${buildStep}: Building application...`, colors.blue + colors.bright);
    if (!exec('npm run build', 'Building production bundle')) {
      log('Build failed. Try running with --dev flag for development mode.', colors.yellow);
      process.exit(1);
    }
  }

  // Step 6: Start the application
  log('\n' + '='.repeat(60), colors.bright);
  log('✅ Setup Complete! Starting application...', colors.green + colors.bright);
  log('='.repeat(60) + '\n', colors.bright);
  
  log('🌐 Opening: http://localhost:3000', colors.cyan);
  if (usingSQLite) {
    log('📁 Database: prisma/dev.db (local file)', colors.cyan);
  } else {
    log('📊 Database: http://localhost:5555 (run "npx prisma studio")', colors.cyan);
  }
  log('📝 API Docs: See README.md\n', colors.cyan);
  
  if (isDev) {
    log('Starting in DEVELOPMENT mode...\n', colors.yellow);
    execSync('npm run dev', { stdio: 'inherit' });
  } else {
    log('Starting in PRODUCTION mode...\n', colors.yellow);
    execSync('npm start', { stdio: 'inherit' });
  }
}

main().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, colors.red);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Setup Script for SubastaPro Local Development
 * 
 * This script ensures:
 * - Local database directory exists
 * - Environment variables are set
 * - Database is properly initialized
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ROOT = process.cwd();
const ENV_FILE = path.join(PROJECT_ROOT, '.env');
const PRISMA_DIR = path.join(PROJECT_ROOT, 'prisma');
const DB_FILE = path.join(PRISMA_DIR, 'dev.db');
const DATA_DIR = path.join(PROJECT_ROOT, 'data');

console.log('🚀 Setting up SubastaPro local environment...\n');

// 1. Ensure data directory exists for future cloud backups
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('✓ Created data/ directory for local storage');
  
  // Create a README in data directory
  fs.writeFileSync(
    path.join(DATA_DIR, 'README.md'),
    `# Data Directory

This directory is used for local data storage and backups.

## Contents
- Database backups
- Uploaded files (future)
- Export files (future)

## Cloud Migration
When migrating to cloud:
1. Export database: \`npm run db:backup\`
2. Upload backups to cloud storage
3. Update DATABASE_URL in production .env
4. Run migrations on cloud database
`
  );
  console.log('✓ Created data/README.md');
}

// 2. Ensure prisma directory exists
if (!fs.existsSync(PRISMA_DIR)) {
  fs.mkdirSync(PRISMA_DIR, { recursive: true });
  console.log('✓ Created prisma/ directory');
}

// 3. Check and update .env file
let envContent = '';
let envUpdated = false;

if (fs.existsSync(ENV_FILE)) {
  envContent = fs.readFileSync(ENV_FILE, 'utf-8');
  console.log('✓ Found existing .env file');
} else {
  console.log('✓ Creating new .env file');
  envUpdated = true;
}

// Check for required environment variables
const requiredVars = {
  'NEXTAUTH_SECRET': crypto.randomBytes(32).toString('base64'),
  'NEXTAUTH_URL': 'http://localhost:3000',
  'DATABASE_URL': 'file:./prisma/dev.db',
};

const lines = envContent.split('\n');
const existingVars = new Set();

lines.forEach(line => {
  const match = line.match(/^([A-Z_]+)=/);
  if (match) {
    existingVars.add(match[1]);
  }
});

Object.keys(requiredVars).forEach(varName => {
  if (!existingVars.has(varName)) {
    envContent += `\n${varName}=${requiredVars[varName]}`;
    envUpdated = true;
    console.log(`✓ Added ${varName} to .env`);
  } else {
    console.log(`✓ ${varName} already exists in .env`);
  }
});

if (envUpdated) {
  fs.writeFileSync(ENV_FILE, envContent.trim() + '\n');
  console.log('✓ Updated .env file');
}

// 4. Create backup script
const backupScript = `#!/usr/bin/env node

/**
 * Database Backup Script
 * Creates a timestamped backup of the SQLite database
 */

const fs = require('fs');
const path = require('path');

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const sourceDb = path.join(__dirname, '..', 'prisma', 'dev.db');
const backupDir = path.join(__dirname, '..', 'data', 'backups');
const backupFile = path.join(backupDir, \`backup-\${timestamp}.db\`);

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

if (fs.existsSync(sourceDb)) {
  fs.copyFileSync(sourceDb, backupFile);
  console.log(\`✓ Database backed up to: \${backupFile}\`);
  
  // Keep only last 10 backups
  const backups = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('backup-') && f.endsWith('.db'))
    .sort()
    .reverse();
  
  if (backups.length > 10) {
    backups.slice(10).forEach(oldBackup => {
      fs.unlinkSync(path.join(backupDir, oldBackup));
      console.log(\`✓ Removed old backup: \${oldBackup}\`);
    });
  }
} else {
  console.log('⚠ No database file found to backup');
}
`;

const scriptsDir = path.join(PROJECT_ROOT, 'scripts');
if (!fs.existsSync(scriptsDir)) {
  fs.mkdirSync(scriptsDir, { recursive: true });
}

fs.writeFileSync(path.join(scriptsDir, 'backup-db.js'), backupScript);
console.log('✓ Created backup script at scripts/backup-db.js');

// 5. Update package.json with backup script
const packageJsonPath = path.join(PROJECT_ROOT, 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  
  if (!packageJson.scripts['db:backup']) {
    packageJson.scripts['db:backup'] = 'node scripts/backup-db.js';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log('✓ Added db:backup script to package.json');
  }
}

// 6. Create .gitignore entries for data directory
const gitignorePath = path.join(PROJECT_ROOT, '.gitignore');
let gitignoreContent = '';

if (fs.existsSync(gitignorePath)) {
  gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
}

const gitignoreEntries = [
  'data/backups/',
  'data/*.db',
  'data/*.sql',
];

let gitignoreUpdated = false;
gitignoreEntries.forEach(entry => {
  if (!gitignoreContent.includes(entry)) {
    gitignoreContent += `\n${entry}`;
    gitignoreUpdated = true;
  }
});

if (gitignoreUpdated) {
  fs.writeFileSync(gitignorePath, gitignoreContent.trim() + '\n');
  console.log('✓ Updated .gitignore for data directory');
}

console.log('\n✅ Setup complete!\n');
console.log('Next steps:');
console.log('  1. Run: npm run db:push');
console.log('  2. Run: npm run dev');
console.log('  3. Create backups: npm run db:backup');
console.log('\nLocal database location: prisma/dev.db');
console.log('Backups will be stored in: data/backups/\n');

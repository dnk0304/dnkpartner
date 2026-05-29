/**
 * Master Start Script
 * Unified startup command for all backend services
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting SubastaPro services...\n');

const processes = [];

function startProcess(name, command, args, options = {}) {
  console.log(`[${name}] Starting...`);
  
  const proc = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    ...options
  });
  
  proc.on('error', (error) => {
    console.error(`[${name}] Error:`, error);
  });
  
  proc.on('exit', (code) => {
    console.log(`[${name}] Exited with code ${code}`);
    
    // If one process dies, kill all
    if (code !== 0) {
      console.error(`[${name}] Process failed. Shutting down all services...`);
      processes.forEach(p => p.kill());
      process.exit(code);
    }
  });
  
  processes.push(proc);
  return proc;
}

async function main() {
  // 1. Check if Next.js build exists
  console.log('📦 Checking Next.js build...');
  const fs = require('fs');
  const nextBuildPath = path.join(__dirname, '..', '.next');
  
  if (!fs.existsSync(nextBuildPath)) {
    console.log('⚠️  No Next.js build found. Building...');
    await new Promise((resolve) => {
      const buildProc = spawn('npm', ['run', 'build'], { stdio: 'inherit', shell: true });
      buildProc.on('exit', resolve);
    });
  }
  
  // 2. Start Next.js server
  console.log('\n🌐 Starting Next.js server...');
  startProcess('Next.js', 'npm', ['run', 'start:web']);
  
  // 3. Start Python scheduler
  console.log('\n🐍 Starting Python scheduler...');
  startProcess('Scraper', 'python', ['scraper/scheduler.py'], {
    cwd: path.join(__dirname, '..')
  });
  
  console.log('\n✅ All services started!');
  console.log('📊 Dashboard: http://localhost:3005');
  console.log('\n💡 Press Ctrl+C to stop all services\n');
}

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down all services...');
  processes.forEach(p => p.kill('SIGINT'));
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Shutting down all services...');
  processes.forEach(p => p.kill('SIGTERM'));
  process.exit(0);
});

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

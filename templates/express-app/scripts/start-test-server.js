#!/usr/bin/env node

import { exec, spawn } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function killProcessOnPort(port) {
  try {
    // Try to find process using the port
    const { stdout } = await execAsync(`lsof -ti:${port}`);
    const pids = stdout.trim().split('\n').filter(Boolean);
    
    for (const pid of pids) {
      console.log(`Killing process ${pid} on port ${port}...`);
      try {
        await execAsync(`kill -9 ${pid}`);
      } catch (e) {
        // Process might have already exited
      }
    }
    
    // Wait a bit for port to be released
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    // No process found on port, which is fine
  }
}

async function startServer() {
  // Kill any existing process on port 3000
  await killProcessOnPort(3000);
  
  // Start the server
  console.log('Starting server...');
  const serverProcess = spawn('npm', ['start'], {
    stdio: 'inherit',
    shell: true
  });
  
  // Handle process termination
  process.on('SIGINT', () => {
    console.log('\nStopping server...');
    serverProcess.kill();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    serverProcess.kill();
    process.exit(0);
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
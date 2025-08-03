import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Install npm dependencies in a project
 * @param {string} projectPath - Path to the project
 * @param {Object} options - Options for npm install
 * @param {number} options.timeout - Timeout in milliseconds (default: 120000)
 * @param {boolean} options.silent - Whether to suppress console output (default: false)
 * @returns {Promise<{success: boolean}>}
 */
export async function npmInstall(projectPath, options = {}) {
  const { 
    timeout = 120000, 
    silent = false 
  } = options;
  
  if (!silent) console.log('📦 Installing dependencies...');
  
  try {
    await execAsync('npm install', { 
      cwd: projectPath,
      timeout 
    });
    if (!silent) console.log('  ✓ Dependencies installed');
    return { success: true };
  } catch (error) {
    const message = `Failed to install dependencies: ${error.message}`;
    if (!silent) console.error(`  ❌ ${message}`);
    throw new Error(message);
  }
}

/**
 * Run npm test in a project
 * @param {string} projectPath - Path to the project
 * @param {Object} options - Options for npm test
 * @param {number} options.timeout - Timeout in milliseconds (default: 120000)
 * @param {Object} options.env - Environment variables (default: includes CI=true)
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
export async function npmTest(projectPath, options = {}) {
  const { 
    timeout = 120000,
    env = { ...process.env, CI: 'true' }
  } = options;
  
  return await execAsync('npm test', {
    cwd: projectPath,
    env,
    timeout
  });
}

/**
 * Kill process running on a specific port
 * @param {number} port - Port number
 * @param {string} projectPath - Optional project path for cwd
 * @returns {Promise<boolean>} - True if process was killed, false if no process found
 */
export async function killProcessOnPort(port, projectPath = null) {
  try {
    await execAsync(`lsof -ti:${port} | xargs kill -9`, 
      projectPath ? { cwd: projectPath } : {}
    );
    await new Promise(resolve => setTimeout(resolve, 1000));
    return true;
  } catch {
    // No process running on port
    return false;
  }
}

/**
 * Start npm project
 * @param {string} projectPath - Path to the project
 * @param {boolean} detached - Whether to run detached (default: false)
 * @returns {ChildProcess}
 */
export function npmStart(projectPath, detached = false) {
  return exec('npm start', {
    cwd: projectPath,
    detached
  });
}
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PLAYWRIGHT_VERSION, EXPRESS_VERSION, NPM_INSTALL_TIMEOUT, TEST_TIMEOUT, DEFAULT_PORT } from './config.js';
import { ensureDir } from './file-utils.js';
import { logSuccess, logError, logInfo } from './console-utils.js';

const execAsync = promisify(exec);

/**
 * Ensure package.json exists with required test scripts
 */
export function ensurePackageJson(projectPath) {
  const packagePath = join(projectPath, 'package.json');
  let packageContent;
  
  if (existsSync(packagePath)) {
    // Read existing package.json
    packageContent = JSON.parse(readFileSync(packagePath, 'utf8'));
    
    // Ensure required fields
    if (!packageContent.scripts) {
      packageContent.scripts = {};
    }
    if (!packageContent.scripts.test) {
      packageContent.scripts.test = "playwright test";
      packageContent.scripts["test:ui"] = "playwright test --ui";
    }
    
    // Ensure playwright is in devDependencies
    if (!packageContent.devDependencies) {
      packageContent.devDependencies = {};
    }
    if (!packageContent.devDependencies["@playwright/test"]) {
      packageContent.devDependencies["@playwright/test"] = PLAYWRIGHT_VERSION;
    }
    
    // Write back
    writeFileSync(packagePath, JSON.stringify(packageContent, null, 2));
    logInfo('Updated: package.json (added test scripts)');
  } else {
    // Create new package.json
    packageContent = {
      name: projectPath.split('/').pop(),
      version: "1.0.0",
      type: "module",
      scripts: {
        start: "node server.js",
        test: "playwright test",
        "test:ui": "playwright test --ui"
      },
      devDependencies: {
        "@playwright/test": PLAYWRIGHT_VERSION
      },
      dependencies: {
        "express": EXPRESS_VERSION
      }
    };
    writeFileSync(packagePath, JSON.stringify(packageContent, null, 2));
    logSuccess('Created: package.json');
  }
  
  return packageContent;
}

/**
 * Ensure Playwright config exists
 */
export function ensurePlaywrightConfig(projectPath) {
  const playwrightPath = join(projectPath, 'playwright.config.js');
  
  if (!existsSync(playwrightPath)) {
    const configContent = `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:${DEFAULT_PORT}/plan-build-test',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm start',
    port: ${DEFAULT_PORT},
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
    stderr: 'pipe',
    stdout: 'pipe',
  },
});`;
    
    writeFileSync(playwrightPath, configContent);
    logSuccess('Created: playwright.config.js');
    return true;
  }
  
  return false;
}

/**
 * Install npm dependencies
 */
export async function installDependencies(projectPath) {
  console.log('\n📦 Installing dependencies...');
  
  try {
    await execAsync('npm install', { 
      cwd: projectPath,
      timeout: NPM_INSTALL_TIMEOUT 
    });
    logSuccess('Dependencies installed');
    return true;
  } catch (error) {
    logError(`Failed to install dependencies: ${error.message}`);
    return false;
  }
}

/**
 * Kill process on port
 */
export async function killProcessOnPort(port = DEFAULT_PORT) {
  try {
    await execAsync(`lsof -ti:${port} | xargs kill -9`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    return true;
  } catch {
    // No process to kill or command not available
    return false;
  }
}

/**
 * Run tests with proper setup
 */
export async function runTests(projectPath) {
  console.log('\n🧪 Running tests...\n');
  
  // Kill any existing server first
  await killProcessOnPort();
  
  try {
    const { stdout, stderr } = await execAsync('npm test', {
      cwd: projectPath,
      env: { ...process.env, CI: 'true' },
      timeout: TEST_TIMEOUT
    });
    
    const output = stdout + '\n' + stderr;
    console.log(stdout);
    if (stderr) console.error(stderr);
    
    return {
      success: true,
      output,
      passed: output.includes(' passed (') && !output.includes(' failed (')
    };
  } catch (error) {
    const output = (error.stdout || '') + '\n' + (error.stderr || '');
    console.error('\n❌ Tests failed!');
    console.log(error.stdout || error.message);
    if (error.stderr) console.error(error.stderr);
    
    return {
      success: false,
      output,
      error: error.message
    };
  }
}

/**
 * Create test file
 */
export function createTestFile(projectPath, testContent) {
  const testDir = join(projectPath, 'test');
  const testFile = join(testDir, 'e2e.test.js');
  
  ensureDir(testFile);
  writeFileSync(testFile, testContent);
  logSuccess(`Created: test/e2e.test.js`);
}

/**
 * Ensure complete test setup
 */
export async function ensureTestSetup(projectPath) {
  // Ensure package.json and playwright config
  ensurePackageJson(projectPath);
  ensurePlaywrightConfig(projectPath);
  
  // Install dependencies if needed
  const nodeModulesPath = join(projectPath, 'node_modules');
  if (!existsSync(nodeModulesPath)) {
    await installDependencies(projectPath);
  }
}

/**
 * Extract test information from output
 */
export function parseTestOutput(testOutput) {
  const info = {
    passed: false,
    testCount: 0,
    failures: [],
    errors: []
  };
  
  // Check if tests passed
  info.passed = testOutput.includes(' passed (') && !testOutput.includes(' failed (');
  
  // Extract test count
  const testCountMatch = testOutput.match(/(\d+) passed/);
  if (testCountMatch) {
    info.testCount = parseInt(testCountMatch[1]);
  }
  
  // Extract failures
  const failurePattern = /✘.*?\((.*?)\)/g;
  const failures = [...testOutput.matchAll(failurePattern)];
  info.failures = failures.map(match => match[0]);
  
  // Common error patterns
  if (testOutput.includes('is already used')) {
    const portMatch = testOutput.match(/localhost:(\d+)/);
    info.errors.push({
      type: 'port_conflict',
      port: portMatch ? portMatch[1] : DEFAULT_PORT,
      message: 'Port already in use'
    });
  }
  
  if (testOutput.includes('Expected') && (testOutput.includes('Received') || testOutput.includes('to contain'))) {
    info.errors.push({
      type: 'assertion_mismatch',
      message: 'Test expectations do not match implementation'
    });
  }
  
  if (testOutput.includes('Timed out') && testOutput.includes('waiting for')) {
    info.errors.push({
      type: 'timeout',
      message: 'Test timed out waiting for element'
    });
  }
  
  return info;
}
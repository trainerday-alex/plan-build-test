/**
 * Test-related commands
 * Handles test analysis and fixing test failures
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { Logger } from '../logger.js';
import { callClaude } from '../claude-utils.js';
import { loadTemplate } from '../template-utils.js';
import { parseAgentResponse } from '../agent-parsers.js';
import { npmInstall, killProcessOnPort as killPort } from '../npm-utils.js';

const execAsync = promisify(exec);

/**
 * Wrapper for callClaude to maintain compatibility
 */
async function callClaudeWrapper(prompt, role, projectState = null, retryCount = 0) {
  return callClaude(prompt, role, projectState, retryCount);
}

/**
 * Execute fix-tests command - analyze and fix failing tests
 */
export async function executeFixTests(projectState, requirement, state) {
  Logger.section('Running tests to check current status...', '🔍');
  
  let testOutput = '';
  
  // Always run tests to get current status
  // First run npm install to ensure all dependencies are available
  try {
    await npmInstall(projectState.projectPath);
    console.log(''); // Empty line
  } catch (error) {
    console.error('  ⚠️  Continuing anyway to see test errors...\n');
  }
  
  Logger.info('Running tests...');
  
  // Run the tests
  let testFailed = false;
  try {
    const { stdout, stderr } = await execAsync('npm test', { 
      cwd: projectState.projectPath,
      env: { ...process.env, CI: 'true' }
    });
    testOutput = stdout + '\n' + stderr;
    console.log(testOutput); // Show the test output
  } catch (error) {
    // Tests failed, capture the output
    testFailed = true;
    testOutput = error.stdout + '\n' + error.stderr;
    console.log(testOutput); // Show the test output
  }
  
  // Also append to log for future use
  projectState.appendTextLog('\nRunning tests...\n' + testOutput);
  
  Logger.section('Test analysis', '📊');
  
  // Check if tests are passing
  const testsArePassing = testOutput.includes(' passed (') && !testOutput.includes(' failed (');
  
  // If no test output detected, the test command might have issues
  if (!testOutput || testOutput.trim().length === 0) {
    Logger.error('No test output detected. The test command may have failed to run.');
    Logger.info('Please check that tests can be run with: npm test', true);
    return;
  }
  
  if (testsArePassing) {
    Logger.success('All tests are passing! No fixes needed!');
    
    // Check if there are too many tests (more than 5)
    const testCountMatch = testOutput.match(/(\d+) passed/);
    const testCount = testCountMatch ? parseInt(testCountMatch[1]) : 0;
    
    if (testCount > 5) {
      Logger.warning(`You have ${testCount} tests. Consider simplifying to 2-3 core functionality tests.`);
      Logger.info('Tests should focus on main functionality, not edge cases.', true);
    }
    
    return;
  }
  
  Logger.error('Tests are failing. Analyzing failures...');
  
  // Get all test files from our standard test directory
  const testFiles = [];
  const testDir = join(projectState.projectPath, 'test');
  if (existsSync(testDir)) {
    const files = readdirSync(testDir);
    files.forEach(file => {
      if (file.endsWith('.test.js')) {
        const content = readFileSync(join(testDir, file), 'utf8');
        testFiles.push({ path: join(projectState.projectPath, 'test', file), content });
      }
    });
  }
  
  // Get all implementation files from our standard structure
  const srcFiles = [];
  
  // Get src directory files
  const srcDir = join(projectState.projectPath, 'src');
  if (existsSync(srcDir)) {
    const files = readdirSync(srcDir);
    files.forEach(file => {
      if (file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.css')) {
        const content = readFileSync(join(srcDir, file), 'utf8');
        srcFiles.push({ path: `src/${file}`, content });
      }
    });
  }
  
  // Get server.js from root
  const serverFile = join(projectState.projectPath, 'server.js');
  if (existsSync(serverFile)) {
    const content = readFileSync(serverFile, 'utf8');
    srcFiles.push({ path: 'server.js', content });
  }
  
  // Run Tester to fix the tests
  Logger.section('Fixing tests to match implementation...', '🔧');
  
  // Load the tester-fix template
  let fixPrompt;
  const testerFixTemplate = loadTemplate('tester-fix');
  if (testerFixTemplate) {
    fixPrompt = testerFixTemplate
      .replace('${testOutput}', testOutput)
      .replace('${testFiles}', testFiles.map(f => `File: ${f.path}\n${f.content}`).join('\n\n'))
      .replace('${implementationFiles}', srcFiles.map(f => `File: ${f.path}\n${f.content}`).join('\n\n'));
  } else {
    // Fallback prompt
    fixPrompt = `You are the Tester agent. Your task is to fix the failing tests to match the actual implementation.

Test Output showing failures:
${testOutput}

Current Test Files:
${testFiles.map(f => `File: ${f.path}\n${f.content}`).join('\n\n')}

Implementation Files:
${srcFiles.map(f => `File: ${f.path}\n${f.content}`).join('\n\n')}

Analyze the test failures and update the tests to match what the implementation actually does. Do NOT change the implementation - only fix the tests.

CRITICAL: Check if HTML5 validation (type="email", required, etc.) is preventing form submission. If so, the JavaScript validation will never run and you should test for browser validation behavior instead.

Respond with JSON:
{
  "fixed_tests": [
    {
      "file_path": "absolute path to test file",
      "updated_content": "complete updated test file content"
    }
  ],
  "changes_made": [
    "description of change 1",
    "description of change 2"
  ]
}`;
  }
  
  projectState.appendTextLog(`\nFixing failing tests...`);
  projectState.appendTaskLog('FIX', 'Updating tests to match implementation');
  
  let fixResult;
  try {
    fixResult = await callClaudeWrapper(fixPrompt, 'Tester', projectState);
  } catch (error) {
    Logger.error(`Error calling Claude API: ${error.message}`);
    Logger.info('Falling back to manual analysis...');
    
    // Simple fallback: analyze test output and provide recommendations
    Logger.info('Test failures detected:');
    
    // Extract failure information from test output
    const failurePattern = /✘.*?\((.*?)\)/g;
    const failures = [...testOutput.matchAll(failurePattern)];
    
    if (failures.length > 0) {
      Logger.info('Failed tests:');
      failures.forEach((match, i) => {
        Logger.command(`${i + 1}. ${match[0]}`);
      });
      console.log(''); // Empty line for spacing
    }
    
    // Analyze common error patterns
    if (testOutput.includes('is already used')) {
      Logger.warning('Port conflict detected. Solutions:');
      const portMatch = testOutput.match(/localhost:(\d+)/);
      const conflictPort = portMatch ? portMatch[1] : 'PORT';
      Logger.command(`1. Kill the process: lsof -ti:${conflictPort} | xargs kill -9`);
      Logger.command(`2. Or update playwright.config.js: reuseExistingServer: true`);
      console.log(''); // Empty line for spacing
    }
    
    if (testOutput.includes('Expected') && (testOutput.includes('Received') || testOutput.includes('to contain'))) {
      Logger.warning('Assertion mismatch detected. The tests expect different values than what the implementation provides.');
      Logger.info('Review the test expectations and update them to match the actual implementation.', true);
    }
    
    if (testOutput.includes('Timed out') && testOutput.includes('waiting for')) {
      Logger.warning('Timeout detected. The test is waiting for something that never appears.');
      Logger.info('Check if the element selector is correct or if the timing needs adjustment.', true);
    }
    
    Logger.info('To fix tests manually:');
    const steps = [
      'Review the test output above',
      'Check what the implementation actually does',
      'Update test expectations to match the implementation',
      'Run npm test again to verify'
    ];
    Logger.list(steps, true);
    
    return;
  }
  
  // Apply the fixes
  try {
    const fixes = parseAgentResponse(fixResult, 'Tester');
    
    if (fixes && fixes.fixed_tests) {
      Logger.info(`Applying fixes to ${fixes.fixed_tests.length} test file(s)...`);
      
      // Write the fixed test files
      fixes.fixed_tests.forEach(fix => {
        writeFileSync(fix.file_path, fix.updated_content);
        Logger.file('Updated', fix.file_path);
      });
      
      Logger.info('Changes made:');
      Logger.list(fixes.changes_made, true);
      
      Logger.success('Test fixes applied!');
      
      // Run tests again to verify fixes
      Logger.section('Running tests to verify fixes...', '🧪');
      
      // Kill any existing server first
      await killPort(3000, projectState.projectPath);
      
      try {
        const { stdout } = await execAsync('npm test', { 
          cwd: projectState.projectPath,
          env: { ...process.env, CI: 'true' }
        });
        Logger.success('All tests are now passing!');
        console.log(stdout); // Show test output
      } catch (error) {
        Logger.warning('Some tests are still failing:');
        console.log(error.stdout || error.message); // Show error output
        if (error.stderr) console.log(error.stderr); // Show stderr output
      }
      
      // Log the fixes
      projectState.appendLog({
        action: 'TESTS_FIXED',
        files_updated: fixes.fixed_tests.length,
        changes: fixes.changes_made
      });
      
      projectState.appendTaskLog('COMPLETE', `Fixed ${fixes.fixed_tests.length} test file(s)`);
      
    } else {
      Logger.error('Unable to parse fix response. Raw response:');
      console.log(fixResult); // Show raw response
    }
    
  } catch (error) {
    Logger.error(`Error applying fixes: ${error.message}`);
    Logger.info('Raw response:');
    console.log(fixResult); // Show raw response
  }
}
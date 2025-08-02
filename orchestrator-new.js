#!/usr/bin/env node

import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, appendFileSync, statSync, unlinkSync, rmSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);
const PROJECTS_DIR = process.env.PROJECTS_DIR || join(process.cwd(), 'projects');
const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(process.cwd(), 'templates');

// Import existing utility functions from orchestrator.js
import { 
  ProjectState, 
  loadTemplate, 
  PROMPTS, 
  callClaude, 
  parseAgentResponse,
  parseFileContent,
  parseTasks,
  ensureDir,
  getAllProjectFiles,
  cleanupTempFiles
} from './orchestrator.js';
import { cpSync } from 'fs';

/**
 * Main orchestrator function with command-based flow
 */
export async function runOrchestratorNew(projectName, requirement, commandType = 'create-project') {
  if (!projectName || !requirement) {
    console.error('❌ Error: Both project name and requirement are required');
    process.exit(1);
  }

  // Clean up temp files at the start of each run
  cleanupTempFiles();

  const projectPath = join(PROJECTS_DIR, projectName);
  const projectState = new ProjectState(projectPath);
  
  console.log(`\n🚀 Project: ${projectName}`);
  console.log(`📋 Requirement: ${requirement}`);
  console.log(`🎯 Command: ${commandType}`);
  console.log(`📁 Location: ${projectPath}`);
  
  // For create-project, delete existing folder if it exists
  if (commandType === 'create-project' && existsSync(projectPath)) {
    console.log('🗑️  Removing existing project folder...');
    rmSync(projectPath, { recursive: true, force: true });
    console.log('  ✓ Existing project removed\n');
  }
  
  // Initialize logging
  if (!existsSync(projectPath)) {
    mkdirSync(projectPath, { recursive: true });
  }
  
  projectState.appendTextLog(`\n${'='.repeat(80)}`);
  projectState.appendTextLog(`ORCHESTRATOR SESSION STARTED`);
  projectState.appendTextLog(`Project: ${projectName}`);
  projectState.appendTextLog(`Requirement: ${requirement}`);
  projectState.appendTextLog(`Command: ${commandType}`);
  projectState.appendTextLog(`Location: ${projectPath}`);
  projectState.appendTextLog(`${'='.repeat(80)}\n`);

  try {
    let state = {
      tasks: [],
      completedTasks: [],
      status: 'started'
    };

    // Execute based on command type
    switch (commandType) {
      case 'create-project':
        await executeCreateProject(projectState, requirement, state);
        break;
        
      case 'task':
        await executeAddTask(projectState, requirement, state);
        break;
        
      case 'fix':
        await executeFix(projectState, requirement, state);
        break;
        
      case 'refactor':
        await executeRefactor(projectState, requirement, state);
        break;
        
      default:
        console.error(`❌ Unknown command type: ${commandType}`);
        process.exit(1);
    }
    
    // Always finish with testing
    await runTests(projectState, projectPath, requirement, state);
    
  } catch (error) {
    console.error('❌ Orchestrator error:', error.message);
    projectState.appendTextLog(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Execute create-project command flow
 */
async function executeCreateProject(projectState, requirement, state) {
  console.log('\n📝 Starting new project...\n');
  
  // Copy template files
  await copyTemplateFiles(projectState);
  
  // Initialize git
  await initializeGit(projectState);
  
  // Run Architect
  await runArchitect(projectState, requirement, state);
  
  // Run Coder for each task
  await runCoderTasks(projectState, requirement, state);
}

/**
 * Copy files from express-app template
 */
async function copyTemplateFiles(projectState) {
  console.log('📁 Setting up project template...');
  
  const templatePath = join(TEMPLATES_DIR, 'express-app');
  const projectPath = projectState.projectPath;
  
  if (!existsSync(templatePath)) {
    console.log('  ⚠️  Template not found, skipping template copy');
    return;
  }
  
  try {
    // Copy all template files to project directory
    cpSync(templatePath, projectPath, { recursive: true });
    console.log('  ✓ Copied Express app template');
    
    // Update package.json with project name
    const packagePath = join(projectPath, 'package.json');
    if (existsSync(packagePath)) {
      const packageContent = JSON.parse(readFileSync(packagePath, 'utf8'));
      packageContent.name = projectPath.split('/').pop();
      writeFileSync(packagePath, JSON.stringify(packageContent, null, 2));
      console.log('  ✓ Updated package.json with project name');
    }
    
    projectState.appendLog({
      action: 'TEMPLATE_COPIED',
      details: 'Express app template files copied successfully'
    });
    
  } catch (error) {
    console.log(`  ⚠️  Template copy failed: ${error.message}`);
    projectState.appendTextLog(`WARNING: Template copy failed - ${error.message}`);
  }
}

/**
 * Execute task command flow
 */
async function executeAddTask(projectState, requirement, state) {
  console.log('\n📝 Adding new task to existing project...\n');
  
  // Run Architect for new task
  await runArchitect(projectState, requirement, state);
  
  // Run Coder for each task
  await runCoderTasks(projectState, requirement, state);
}

/**
 * Execute fix command flow
 */
async function executeFix(projectState, requirement, state) {
  console.log('\n🔧 Fixing issues in project...\n');
  
  // Run Project Reviewer
  const recommendation = await runProjectReviewer(projectState, requirement, state);
  
  if (recommendation.includes('test')) {
    // Just run tests if that's all we need
    return;
  }
  
  // Otherwise, run Coder to fix issues
  await runCoderFix(projectState, requirement, recommendation, state);
}

/**
 * Execute refactor command flow
 */
async function executeRefactor(projectState, requirement, state) {
  console.log('\n♻️  Refactoring project...\n');
  
  // Run Refactor Analyst
  await runRefactorAnalyst(projectState, requirement, state);
  
  // Run Coder for each refactor task
  await runCoderTasks(projectState, requirement, state);
}

/**
 * Initialize git repository
 */
async function initializeGit(projectState) {
  const projectPath = projectState.projectPath;
  
  try {
    console.log('🔧 Initializing git repository...');
    
    // Check if git already initialized
    try {
      await execAsync('git status', { cwd: projectPath });
      console.log('  ✓ Git already initialized');
      return;
    } catch {
      // Git not initialized, proceed
    }
    
    // Initialize git
    await execAsync('git init', { cwd: projectPath });
    console.log('  ✓ Initialized git repository');
    
    // Check if .gitignore exists from template, if not create it
    const gitignorePath = join(projectPath, '.gitignore');
    if (!existsSync(gitignorePath)) {
      const gitignoreContent = `node_modules/
dist/
*.log
.DS_Store
.env
plan-build-test/logs.json
plan-build-test/log.txt
plan-build-test/task-log.txt
`;
      writeFileSync(gitignorePath, gitignoreContent);
      console.log('  ✓ Created .gitignore');
    } else {
      console.log('  ✓ Using .gitignore from template');
    }
    
    // Initial commit
    await execAsync('git add -A', { cwd: projectPath });
    await execAsync('git commit -m "Initial commit"', { cwd: projectPath });
    console.log('  ✓ Created initial commit\n');
    
    projectState.appendLog({
      action: 'GIT_INITIALIZED',
      details: 'Created git repo and .gitignore with initial commit'
    });
    
  } catch (error) {
    console.log('  ⚠️  Git init failed (git may not be installed)\n');
    projectState.appendTextLog(`WARNING: Git init failed - ${error.message}`);
  }
}

/**
 * Run Architect to create tasks
 */
async function runArchitect(projectState, requirement, state) {
  console.log('🏗️  Architect designing solution...');
  projectState.appendTextLog(`\nArchitect designing solution...`);
  projectState.appendTaskLog('PLAN', `Creating tasks for: ${requirement}`);
  
  const architectResult = await callClaude(
    PROMPTS.architect(requirement), 
    'Architect', 
    projectState
  );
  
  // Parse tasks
  state.tasks = parseTasks(architectResult);
  console.log(`📋 Found ${state.tasks.length} tasks to implement\n`);
  
  if (state.tasks.length === 0) {
    throw new Error('Architect failed to create any tasks');
  }
  
  // Sync task counter with logs before assigning new task numbers
  projectState.syncTaskCounter();
  
  // Assign task numbers and log each task
  state.tasks.forEach((task, i) => {
    const taskNum = projectState.getNextTaskNumber();
    task.taskNumber = taskNum;
    
    console.log(`   ${i + 1}. ${task.description}`);
    console.log(`      Test: ${task.test}`);
    
    projectState.appendLog({
      action: 'CREATE_TASK',
      taskNumber: taskNum,
      taskIndex: i + 1,
      totalTasks: state.tasks.length,
      description: task.description,
      testCommand: task.test,
      requirement: requirement
    });
  });
  
  console.log('');
  
  projectState.appendLog({
    action: 'ARCHITECT_COMPLETE',
    details: `Created ${state.tasks.length} tasks`,
    tasks: state.tasks
  });
}

/**
 * Run Project Reviewer
 */
async function runProjectReviewer(projectState, requirement, state) {
  console.log('📊 Reviewing project state...');
  
  const logSummary = projectState.getLogSummary();
  let taskLogContent = '';
  
  try {
    if (existsSync(projectState.taskLogFile)) {
      taskLogContent = readFileSync(projectState.taskLogFile, 'utf8');
    }
  } catch {}
  
  projectState.appendTextLog(`\nReviewing project...`);
  projectState.appendTaskLog('PLAN/REVIEW', 'Analyzing current state');
  
  const reviewResult = await callClaude(
    PROMPTS.reviewProject(projectState.projectPath.split('/').pop(), logSummary, requirement, taskLogContent),
    'Project Reviewer',
    projectState
  );
  
  // Parse review JSON
  const reviewJson = parseAgentResponse(reviewResult, 'Project Reviewer');
  if (reviewJson && reviewJson.recommendation) {
    console.log('📊 Project Review:');
    console.log(`  Status: ${reviewJson.project_state.current_status}`);
    console.log(`  Recommendation: ${reviewJson.recommendation.next_action}`);
    console.log(`  Details: ${reviewJson.recommendation.description}\n`);
    
    return reviewJson.recommendation.description;
  }
  
  return reviewResult;
}

/**
 * Run Refactor Analyst
 */
async function runRefactorAnalyst(projectState, requirement, state) {
  console.log('♻️  Analyzing code for refactoring...');
  
  const allFiles = getAllProjectFiles(projectState.projectPath).join('\n');
  
  projectState.appendTextLog(`\nRefactor Analyst analyzing code...`);
  projectState.appendTaskLog('PLAN', `Refactor analysis: ${requirement}`);
  
  const refactorResult = await callClaude(
    PROMPTS.refactorAnalyst(requirement, allFiles), 
    'Refactor Analyst', 
    projectState
  );
  
  // Parse refactor tasks
  const refactorJson = parseAgentResponse(refactorResult, 'Refactor Analyst');
  if (refactorJson && refactorJson.refactor_tasks) {
    state.tasks = refactorJson.refactor_tasks.map(task => ({
      description: task.description,
      test: task.test_command || 'npm test',
      isRefactor: true
    }));
    
    console.log('📋 Refactor Analysis:');
    console.log(`  Strengths: ${refactorJson.assessment.strengths.length} identified`);
    console.log(`  Issues: ${refactorJson.assessment.weaknesses.length} found`);
    console.log(`  Tasks: ${state.tasks.length} refactoring tasks\n`);
  } else {
    // Fallback to text parsing
    state.tasks = parseTasks(refactorResult);
  }
  
  // Assign task numbers
  projectState.syncTaskCounter();
  state.tasks.forEach((task, i) => {
    const taskNum = projectState.getNextTaskNumber();
    task.taskNumber = taskNum;
    
    projectState.appendLog({
      action: 'CREATE_TASK',
      taskNumber: taskNum,
      taskIndex: i + 1,
      totalTasks: state.tasks.length,
      description: task.description,
      testCommand: task.test,
      taskType: 'refactor',
      requirement: requirement
    });
  });
}

/**
 * Run Coder for all tasks
 */
async function runCoderTasks(projectState, requirement, state) {
  console.log('💻 Implementing tasks...\n');
  
  for (let i = 0; i < state.tasks.length; i++) {
    const task = state.tasks[i];
    
    console.log(`\n📝 Task ${task.taskNumber} (${i + 1}/${state.tasks.length}): ${task.description}`);
    projectState.appendTextLog(`\nStarting Task ${task.taskNumber}: ${task.description}`);
    projectState.appendTaskLog('BUILD', `Task ${task.taskNumber}: ${task.description}`);
    
    // Get all existing files
    const allFiles = getAllProjectFiles(projectState.projectPath)
      .map(f => `File: ${f}\n${readFileSync(join(projectState.projectPath, f), 'utf8')}`)
      .join('\n\n---\n\n');
    
    // Call Coder
    const coderResult = await callClaude(
      PROMPTS.coder(requirement, task.description, allFiles), 
      'Coder',
      projectState
    );
    
    // Parse and create/update files
    const coderJson = parseAgentResponse(coderResult, 'Coder');
    let codeFiles = [];
    
    if (coderJson && coderJson.files) {
      codeFiles = coderJson.files.map(f => ({
        path: f.path,
        content: f.content
      }));
    } else {
      // Fallback to text parsing
      codeFiles = parseFileContent(coderResult);
    }
    
    for (const file of codeFiles) {
      const filePath = join(projectState.projectPath, file.path);
      ensureDir(filePath);
      writeFileSync(filePath, file.content);
      console.log(`  ✓ ${existsSync(filePath) ? 'Updated' : 'Created'}: ${file.path}`);
      projectState.appendTextLog(`  ${existsSync(filePath) ? 'Updated' : 'Created'}: ${file.path}`);
    }
    
    // Mark task complete
    state.completedTasks.push(task.description);
    
    projectState.appendLog({
      action: 'COMPLETE_TASK',
      taskNumber: task.taskNumber,
      taskIndex: i + 1,
      totalTasks: state.tasks.length,
      description: task.description,
      filesModified: codeFiles.map(f => f.path)
    });
    
    console.log(`  ✓ Task ${task.taskNumber} completed`);
    projectState.appendTaskLog('TEST', `Task ${task.taskNumber} ready for testing`);
  }
  
  console.log('\n✅ All tasks completed!\n');
}

/**
 * Run Coder to fix specific issues
 */
async function runCoderFix(projectState, requirement, recommendation, state) {
  console.log('🔧 Fixing issues...\n');
  
  const allFiles = getAllProjectFiles(projectState.projectPath)
    .map(f => `File: ${f}\n${readFileSync(join(projectState.projectPath, f), 'utf8')}`)
    .join('\n\n---\n\n');
  
  projectState.appendTextLog(`\nFixing issues based on: ${recommendation}`);
  projectState.appendTaskLog('BUILD', `Fixing: ${recommendation}`);
  
  const coderResult = await callClaude(
    PROMPTS.coder(requirement, `Fix this issue: ${recommendation}`, allFiles), 
    'Coder',
    projectState
  );
  
  // Parse and update files
  const coderJson = parseAgentResponse(coderResult, 'Coder');
  let codeFiles = [];
  
  if (coderJson && coderJson.files) {
    codeFiles = coderJson.files.map(f => ({
      path: f.path,
      content: f.content
    }));
  } else {
    codeFiles = parseFileContent(coderResult);
  }
  
  for (const file of codeFiles) {
    const filePath = join(projectState.projectPath, file.path);
    ensureDir(filePath);
    writeFileSync(filePath, file.content);
    console.log(`  ✓ Fixed: ${file.path}`);
    projectState.appendTextLog(`  Fixed: ${file.path}`);
  }
  
  console.log('\n✅ Fixes applied!\n');
}

/**
 * Create and run tests
 */
async function runTests(projectState, projectPath, requirement, state) {
  // Create tests if they don't exist
  const testFile = join(projectPath, 'plan-build-test/test/e2e.test.js');
  
  if (!existsSync(testFile) && state.tasks.length > 0) {
    console.log('🧪 Creating tests...');
    console.log('📋 Test will verify:');
    state.tasks.forEach((task, i) => {
      console.log(`   ${i + 1}. ${task.description}`);
    });
    console.log('');
    
    projectState.appendTextLog(`\nTester creating validation tests...`);
    const testResult = await callClaude(
      PROMPTS.finalTest(requirement, projectPath), 
      'Tester',
      projectState
    );
    
    // Parse test files
    const testJson = parseAgentResponse(testResult, 'Tester');
    let testFiles = [];
    
    if (testJson && testJson.test_file) {
      testFiles = [{
        path: testJson.test_file.path,
        content: testJson.test_file.content
      }];
      
      // Show test cases
      if (testJson.test_file.test_cases) {
        console.log('  Tests included:');
        testJson.test_file.test_cases.forEach(tc => {
          console.log(`    • ${tc.name}`);
        });
      }
    } else {
      testFiles = parseFileContent(testResult);
    }
    
    // Create test files
    for (const file of testFiles) {
      const filePath = join(projectPath, file.path);
      ensureDir(filePath);
      writeFileSync(filePath, file.content);
      console.log(`  ✓ Created: ${file.path}`);
    }
    
    // Ensure package.json and playwright.config.js exist
    await ensureTestSetup(projectPath, projectState);
  }
  
  // Install dependencies if needed
  if (!existsSync(join(projectPath, 'node_modules'))) {
    console.log('\n📦 Installing dependencies...');
    try {
      await execAsync('npm install', { 
        cwd: projectPath,
        timeout: 120000 
      });
      console.log('  ✓ Dependencies installed');
    } catch (error) {
      console.log('  ⚠️  Failed to install dependencies');
    }
  }
  
  // Run tests
  console.log('\n🧪 Running tests...\n');
  try {
    const { stdout, stderr } = await execAsync('npm test', {
      cwd: projectPath,
      timeout: 120000
    });
    
    console.log(stdout);
    if (stderr) console.error(stderr);
    
    projectState.appendLog({
      action: 'TESTS_PASSED',
      details: 'All tests passed successfully'
    });
    
    console.log('\n✅ All tests passed!');
    
    // Try to start server
    try {
      console.log('\n🌐 Starting server...');
      const serverProcess = exec('npm start', {
        cwd: projectPath,
        detached: false
      });
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('\n🎉 Project ready!');
      console.log(`  URL: http://localhost:3000`);
      console.log(`  Press Ctrl+C to stop the server\n`);
      
      // Keep process alive
      await new Promise(() => {});
    } catch {
      console.log('\n✅ Project completed successfully!');
    }
    
  } catch (error) {
    console.error('\n❌ Tests failed!');
    console.error(error.message);
    
    projectState.appendLog({
      action: 'TESTS_FAILED',
      error: error.message
    });
    
    process.exit(1);
  }
}

/**
 * Ensure test setup files exist
 */
async function ensureTestSetup(projectPath, projectState) {
  // Check for package.json and ensure test scripts
  const packagePath = join(projectPath, 'package.json');
  let packageContent;
  
  if (existsSync(packagePath)) {
    // Read existing package.json
    packageContent = JSON.parse(readFileSync(packagePath, 'utf8'));
    
    // Ensure test scripts exist
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
      packageContent.devDependencies["@playwright/test"] = "^1.40.0";
    }
    
    // Write back
    writeFileSync(packagePath, JSON.stringify(packageContent, null, 2));
    console.log('  ✓ Updated: package.json (added test scripts)');
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
        "@playwright/test": "^1.40.0"
      },
      dependencies: {
        "express": "^4.18.2"
      }
    };
    writeFileSync(packagePath, JSON.stringify(packageContent, null, 2));
    console.log('  ✓ Created: package.json');
  }
  
  // Check for playwright.config.js
  const playwrightPath = join(projectPath, 'playwright.config.js');
  if (!existsSync(playwrightPath)) {
    const configContent = `import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000/plan-build-test',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm start',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});`;
    writeFileSync(playwrightPath, configContent);
    console.log('  ✓ Created: playwright.config.js');
  }
}
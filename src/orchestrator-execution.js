import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'fs';

// Import shared utilities
import { 
  getProjectPath, getPlanBuildTestPath, ensureDir, ensureDirExists, 
  readJsonFile, writeJsonFile, getAllProjectFiles, getAllProjectFilesWithContent,
  copyDirectory, deleteDirectory, cleanupTempFiles, appendTextLog as appendTextLogUtil
} from './file-utils.js';
import { initializeGit as initGit, autoCommit } from './git-utils.js';
import { log, logSuccess, logError, logWarning, logInfo, logSection, EMOJI } from './console-utils.js';
import { exitWithError, handleClaudeError, ERROR_MESSAGES } from './error-handlers.js';
import { loadTemplate, processTemplate, copyProjectTemplate, createPrompts } from './template-utils.js';
import { 
  parseAgentResponse, parseTasks, parseFileContent, parseTestFixResponse, 
  parseBacklogs, parseProjectReview, parseRefactorAnalysis 
} from './agent-parsers.js';
import { callClaude } from './claude-utils.js';
import { 
  ensurePackageJson, ensurePlaywrightConfig, ensureTestSetup, 
  installDependencies, killProcessOnPort, runTests as runTestsUtil, 
  createTestFile, parseTestOutput 
} from './test-setup-utils.js';

// Import new utilities from Phase 1 refactoring
import { npmInstall, npmTest, killProcessOnPort as killPort, npmStart } from './npm-utils.js';
import { Logger } from './logger.js';
import { TaskManager } from './task-manager.js';

const execAsync = promisify(exec);

// Create PROMPTS object using template utilities
const PROMPTS = createPrompts();

/**
 * Wrapper for callClaude to maintain compatibility
 */
async function callClaudeWrapper(prompt, role, projectState = null, retryCount = 0) {
  return callClaude(prompt, role, projectState, retryCount);
}

/**
 * Execute create-project command flow
 */
export async function executeCreateProject(projectState, requirement, state) {
  console.log('\n📝 Starting new project...\n');
  
  // Copy template files
  await copyTemplateFiles(projectState);
  
  // Initialize git
  await initializeGitWrapper(projectState);
  
  // Run Architect to create backlogs
  await runArchitectBacklogs(projectState, requirement, state);
  
  // Don't run any tasks - just show the backlogs
  console.log('\n✅ Project setup complete!');
  console.log('\n📋 To start working on a backlog, use:');
  console.log('   npm run process-backlog');
  console.log('\n📋 To add more backlogs, use:');
  console.log('   npm run backlog <description>');
}

/**
 * Copy files from express-app template
 */
async function copyTemplateFiles(projectState) {
  log(EMOJI.folder, 'Setting up project template...');
  
  const projectPath = projectState.projectPath;
  const EXPRESS_TEMPLATE_NAME = 'express-app';
  
  if (copyProjectTemplate(EXPRESS_TEMPLATE_NAME, projectPath)) {
    logSuccess('Copied Express app template');
    
    // Update package.json with project name
    const packagePath = join(projectPath, 'package.json');
    if (existsSync(packagePath)) {
      const packageContent = readJsonFile(packagePath);
      if (packageContent) {
        packageContent.name = projectPath.split('/').pop();
        writeJsonFile(packagePath, packageContent);
        logSuccess('Updated package.json with project name');
      }
    }
    
    projectState.appendLog({
      action: 'TEMPLATE_COPIED',
      details: 'Express app template files copied successfully'
    });
  } else {
    logWarning('Template not found, skipping template copy');
  }
}

/**
 * Execute task command flow
 */
export async function executeAddTask(projectState, requirement, state) {
  console.log('\n📝 Adding new task to existing project...\n');
  
  // Run Architect for new task
  await runArchitect(projectState, requirement, state);
  
  // Run Coder for each task
  await runCoderTasks(projectState, requirement, state);
}

/**
 * Execute fix command flow
 */
export async function executeFix(projectState, requirement, state) {
  console.log('\n🔧 Fixing issues in project...\n');
  
  // First, check if we're in the middle of a backlog
  let currentBacklog = null;
  const backlogsData = projectState.getBacklogsData();
  
  if (backlogsData) {
    currentBacklog = backlogsData.backlogs.find(b => b.status === 'in_progress');
    
    if (currentBacklog) {
      console.log(`📋 Working on backlog #${currentBacklog.id}: ${currentBacklog.title}`);
    }
  }
  
  // Check if there's an incomplete task to resume
  const lastIncompleteTask = projectState.getLastIncompleteTask();
  if (lastIncompleteTask >= 0) {
    console.log(`📝 Found incomplete task at index ${lastIncompleteTask + 1}`);
    console.log('🔄 Resuming task execution...\n');
    
    // Load existing tasks from the last architect run
    const taskManager = new TaskManager(projectState);
    const tasks = taskManager.reconstructTasksFromLogs();
    state.tasks = tasks;
    
    console.log(`📋 Found ${tasks.length} tasks from current backlog`);
    const completedCount = tasks.filter(t => t.status === 'completed').length;
    console.log(`✅ ${completedCount} completed, ${tasks.length - completedCount} remaining\n`);
    
    // Resume coder tasks from where we left off
    // Use the backlog description as the requirement if available
    const actualRequirement = currentBacklog ? currentBacklog.description : requirement;
    await runCoderTasks(projectState, actualRequirement, state);
    return;
  }
  
  // Otherwise, run Project Reviewer as normal
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
export async function executeRefactor(projectState, requirement, state) {
  console.log('\n♻️  Refactoring project...\n');
  
  // Run Refactor Analyst
  await runRefactorAnalyst(projectState, requirement, state);
  
  // Run Coder for each refactor task
  await runCoderTasks(projectState, requirement, state);
}

/**
 * Execute fix-tests command flow
 */
export async function executeFixTests(projectState, requirement, state) {
  console.log('\n🔍 Running tests to check current status...\n');
  
  let testOutput = '';
  
  // Always run tests to get current status
  // First run npm install to ensure all dependencies are available
  try {
    await npmInstall(projectState.projectPath);
    console.log('');
  } catch (error) {
    console.error('  ⚠️  Continuing anyway to see test errors...\n');
  }
  
  console.log('📋 Running tests...');
  
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
  
  console.log('\n📊 Test analysis:\n');
  
  // Check if tests are passing
  const testsArePassing = testOutput.includes(' passed (') && !testOutput.includes(' failed (');
  
  // If no test output detected, the test command might have issues
  if (!testOutput || testOutput.trim().length === 0) {
    console.log('❌ No test output detected. The test command may have failed to run.');
    console.log('   Please check that tests can be run with: npm test\n');
    return;
  }
  
  if (testsArePassing) {
    console.log('✅ All tests are passing! No fixes needed.\n');
    
    // Check if there are too many tests (more than 5)
    const testCountMatch = testOutput.match(/(\d+) passed/);
    const testCount = testCountMatch ? parseInt(testCountMatch[1]) : 0;
    
    if (testCount > 5) {
      console.log(`⚠️  Warning: You have ${testCount} tests. Consider simplifying to 2-3 core functionality tests.`);
      console.log('   Tests should focus on main functionality, not edge cases.\n');
    }
    
    return;
  }
  
  console.log('❌ Tests are failing. Analyzing failures...\n');
  
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
  console.log('🔧 Fixing tests to match implementation...\n');
  
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
    console.log('❌ Error calling Claude API:', error.message);
    console.log('\n💡 Falling back to manual analysis...\n');
    
    // Simple fallback: analyze test output and provide recommendations
    console.log('📋 Test failures detected:\n');
    
    // Extract failure information from test output
    const failurePattern = /✘.*?\((.*?)\)/g;
    const failures = [...testOutput.matchAll(failurePattern)];
    
    if (failures.length > 0) {
      console.log('Failed tests:');
      failures.forEach((match, i) => {
        console.log(`  ${i + 1}. ${match[0]}`);
      });
      console.log('\n');
    }
    
    // Analyze common error patterns
    if (testOutput.includes('is already used')) {
      console.log('🔧 Port conflict detected. Solutions:');
      const portMatch = testOutput.match(/localhost:(\d+)/);
      const conflictPort = portMatch ? portMatch[1] : 'PORT';
      console.log(`  1. Kill the process: lsof -ti:${conflictPort} | xargs kill -9`);
      console.log('  2. Or update playwright.config.js: reuseExistingServer: true\n');
    }
    
    if (testOutput.includes('Expected') && (testOutput.includes('Received') || testOutput.includes('to contain'))) {
      console.log('🔧 Assertion mismatch detected. The tests expect different values than what the implementation provides.');
      console.log('  Review the test expectations and update them to match the actual implementation.\n');
    }
    
    if (testOutput.includes('Timed out') && testOutput.includes('waiting for')) {
      console.log('🔧 Timeout detected. The test is waiting for something that never appears.');
      console.log('  Check if the element selector is correct or if the timing needs adjustment.\n');
    }
    
    console.log('📝 To fix tests manually:');
    console.log('  1. Review the test output above');
    console.log('  2. Check what the implementation actually does');
    console.log('  3. Update test expectations to match the implementation');
    console.log('  4. Run npm test again to verify\n');
    
    return;
  }
  
  // Apply the fixes
  try {
    const fixes = parseAgentResponse(fixResult, 'Tester');
    
    if (fixes && fixes.fixed_tests) {
      console.log(`📝 Applying fixes to ${fixes.fixed_tests.length} test file(s)...\n`);
      
      // Write the fixed test files
      fixes.fixed_tests.forEach(fix => {
        writeFileSync(fix.file_path, fix.updated_content);
        console.log(`  ✓ Updated: ${fix.file_path}`);
      });
      
      console.log('\n📋 Changes made:');
      fixes.changes_made.forEach((change, i) => {
        console.log(`  ${i + 1}. ${change}`);
      });
      
      console.log('\n✅ Test fixes applied!');
      
      // Run tests again to verify fixes
      console.log('\n🧪 Running tests to verify fixes...\n');
      
      // Kill any existing server first
      await killPort(3000, projectState.projectPath);
      
      try {
        const { stdout } = await execAsync('npm test', { 
          cwd: projectState.projectPath,
          env: { ...process.env, CI: 'true' }
        });
        console.log('✅ All tests are now passing!\n');
        console.log(stdout);
      } catch (error) {
        console.log('⚠️  Some tests are still failing:\n');
        console.log(error.stdout || error.message);
        if (error.stderr) console.log(error.stderr);
      }
      
      // Log the fixes
      projectState.appendLog({
        action: 'TESTS_FIXED',
        files_updated: fixes.fixed_tests.length,
        changes: fixes.changes_made
      });
      
      projectState.appendTaskLog('COMPLETE', `Fixed ${fixes.fixed_tests.length} test file(s)`);
      
    } else {
      console.log('❌ Unable to parse fix response. Raw response:');
      console.log(fixResult);
    }
    
  } catch (error) {
    console.log('❌ Error applying fixes:', error.message);
    console.log('Raw response:', fixResult);
  }
}

/**
 * Execute add-backlog command
 */
export async function executeAddBacklog(projectState, requirement, state) {
  console.log('\n📋 Adding new backlog item...\n');
  
  // Load existing backlogs
  let backlogsData = projectState.getBacklogsData() || { backlogs: [] };
  
  // Extract the backlog description from requirement
  const backlogDescription = requirement.replace(/^Add backlog:\s*/i, '');
  
  // Create simple backlog entry (could enhance with AI later)
  const newBacklog = projectState.addBacklog({
    title: backlogDescription.split(' ').slice(0, 4).join(' '),
    description: backlogDescription,
    priority: 'medium',
    estimated_effort: 'medium',
    dependencies: [],
    acceptance_criteria: []
  });
  
  console.log('✅ Added new backlog item:');
  console.log(`   ${newBacklog.id}. ${newBacklog.title}`);
  console.log(`      ${newBacklog.description}\n`);
  
  projectState.appendLog({
    action: 'BACKLOG_ADDED',
    backlog: newBacklog
  });
}

/**
 * Execute list-backlogs command
 */
export async function executeListBacklogs(projectState, requirement, state) {
  const backlogsData = projectState.getBacklogsData();
  
  if (!backlogsData) {
    console.log('No backlogs found. Create a project first with npm run create-project');
    return;
  }
  
  console.log(`\n📋 Project Backlogs (${backlogsData.backlogs.length} items):\n`);
  
  // Group by status
  const pending = backlogsData.backlogs.filter(b => b.status === 'pending');
  const inProgress = backlogsData.backlogs.filter(b => b.status === 'in_progress');
  const completed = backlogsData.backlogs.filter(b => b.status === 'completed');
  
  if (inProgress.length > 0) {
    console.log('🔄 In Progress:');
    inProgress.forEach(b => {
      console.log(`   ${b.id}. ${b.title} [${b.priority}]`);
    });
    console.log('');
  }
  
  // Show all backlogs with checkboxes
  console.log('All Backlogs:');
  backlogsData.backlogs.forEach(b => {
    const checkbox = b.status === 'completed' ? '✅' : '⬜';
    const statusIndicator = b.status === 'in_progress' ? ' 🔄' : '';
    console.log(`${checkbox} ${b.id}. ${b.title} [${b.priority}]${statusIndicator}`);
    
    if (b.status !== 'completed') {
      console.log(`      ${b.description}`);
      if (b.dependencies.length > 0) {
        const unmetDeps = b.dependencies.filter(dep => 
          !backlogsData.backlogs.find(backlog => backlog.id === dep && backlog.status === 'completed')
        );
        if (unmetDeps.length > 0) {
          console.log(`      ⚠️  Depends on: ${unmetDeps.join(', ')}`);
        }
      }
    }
  });
  console.log('');
  
  console.log('Use "npm run process-backlog [id]" to work on a specific backlog');
}

/**
 * Execute reset-backlog command
 */
export async function executeResetBacklog(projectState, requirement, state) {
  const backlogsData = projectState.getBacklogsData();
  
  if (!backlogsData) {
    console.log('No backlogs found. Create a project first with npm run create-project');
    return;
  }
  const backlogToReset = backlogsData.backlogs.find(b => b.id === parseInt(state.backlogId));
  
  if (!backlogToReset) {
    console.error(`Backlog #${state.backlogId} not found`);
    return;
  }
  
  // Reset status to pending
  projectState.updateBacklogStatus(backlogToReset.id, 'pending', { completed_at: undefined });
  
  console.log(`✅ Reset backlog #${backlogToReset.id}: ${backlogToReset.title} to pending status`);
  
  projectState.appendLog({
    action: 'BACKLOG_RESET',
    backlog: backlogToReset
  });
}

/**
 * Execute process-backlog command
 */
export async function executeProcessBacklog(projectState, requirement, state) {
  const backlogsData = projectState.getBacklogsData();
  
  if (!backlogsData) {
    console.log('No backlogs found. Create a project first with npm run create-project');
    return;
  }
  
  // Determine which backlog to process
  let backlogToProcess = null;
  
  if (state.backlogId) {
    // Specific backlog requested
    backlogToProcess = backlogsData.backlogs.find(b => b.id === parseInt(state.backlogId));
    if (!backlogToProcess) {
      console.error(`Backlog #${state.backlogId} not found`);
      return;
    }
  } else {
    // First check for in-progress backlogs (interrupted work)
    const inProgress = backlogsData.backlogs.filter(b => b.status === 'in_progress');
    if (inProgress.length > 0) {
      backlogToProcess = inProgress[0];
      console.log(`📋 Found interrupted backlog: #${backlogToProcess.id} ${backlogToProcess.title}`);
    } else {
      // Find next available pending backlog (respecting dependencies)
      const pending = backlogsData.backlogs.filter(b => b.status === 'pending');
      const completed = backlogsData.backlogs.filter(b => b.status === 'completed').map(b => b.id);
      
      for (const backlog of pending) {
        // Check if all dependencies are completed
        if (backlog.dependencies.every(dep => completed.includes(dep))) {
          backlogToProcess = backlog;
          break;
        }
      }
      
      if (!backlogToProcess && pending.length > 0) {
        console.log('⚠️  All pending backlogs have unmet dependencies');
        console.log('\nPending backlogs:');
        pending.forEach(b => {
          console.log(`   ${b.id}. ${b.title} - waiting for: ${b.dependencies.join(', ')}`);
        });
        return;
      }
    }
  }
  
  if (!backlogToProcess) {
    console.log('✅ All backlogs completed!');
    return;
  }
  
  console.log(`\n📋 Processing backlog #${backlogToProcess.id}: ${backlogToProcess.title}\n`);
  console.log(`Description: ${backlogToProcess.description}`);
  console.log(`Priority: ${backlogToProcess.priority}`);
  console.log(`Estimated effort: ${backlogToProcess.estimated_effort}\n`);
  
  // Check if we're resuming an interrupted backlog
  let needsArchitect = true;
  if (backlogToProcess.status === 'in_progress') {
    console.log('⚠️  Resuming interrupted backlog...\n');
    
    // Check if we have tasks for this backlog in the logs
    const allTasks = projectState.getRequirementTasks(backlogToProcess.description);
    if (allTasks.length > 0) {
      needsArchitect = false;
      state.tasks = allTasks;
      console.log(`Found ${allTasks.length} existing tasks from previous attempt`);
      
      // Check task completion status
      const completedTasks = allTasks.filter(t => t.status === 'completed');
      const incompleteTasks = allTasks.filter(t => t.status !== 'completed');
      
      if (completedTasks.length > 0 && incompleteTasks.length > 0) {
        // Some tasks done, some not - review and continue
        console.log(`✓ Completed: ${completedTasks.length} tasks`);
        console.log(`⬜ Remaining: ${incompleteTasks.length} tasks\n`);
        
        // Review what's been built so far
        console.log('📊 Reviewing existing code before continuing...');
        const allFiles = getAllProjectFilesWithContent(projectState.projectPath).join('\n');
        const reviewPrompt = `Review the current state of: ${backlogToProcess.description}\n\nCompleted tasks:\n${completedTasks.map(t => `- ${t.description}`).join('\n')}\n\nRemaining tasks:\n${incompleteTasks.map(t => `- ${t.description}`).join('\n')}\n\nCurrent code:\n${allFiles}\n\nProvide a brief assessment: Is the code working so far? Any issues to fix before continuing?`;
        
        try {
          const review = await callClaudeWrapper(reviewPrompt, 'Code Reviewer', projectState);
          console.log('Review complete. Continuing with remaining tasks...\n');
        } catch (e) {
          console.log('Review skipped. Continuing with remaining tasks...\n');
        }
      } else if (incompleteTasks.length === 0) {
        console.log('⚠️  All tasks appear complete but backlog was interrupted');
        console.log('    Will verify with tests...\n');
      }
    }
  }
  
  // Update status to in_progress
  projectState.updateBacklogStatus(backlogToProcess.id, 'in_progress');
  
  // Run standard architect to break down into tasks (if needed)
  if (needsArchitect) {
    await runArchitect(projectState, backlogToProcess.description, state);
  }
  
  // Run coder for each task
  await runCoderTasks(projectState, backlogToProcess.description, state);
  
  // If successful, mark as completed
  projectState.updateBacklogStatus(backlogToProcess.id, 'completed', {
    completed_at: new Date().toISOString()
  });
  
  console.log(`\n✅ Backlog #${backlogToProcess.id} completed!`);
  
  projectState.appendLog({
    action: 'BACKLOG_COMPLETED',
    backlog: backlogToProcess
  });
}

/**
 * Initialize git repository
 */
async function initializeGitWrapper(projectState) {
  const projectPath = projectState.projectPath;
  
  try {
    const success = await initGit(projectPath);
    
    if (success) {
      projectState.appendLog({
        action: 'GIT_INITIALIZED',
        details: 'Created git repo and .gitignore with initial commit'
      });
    } else {
      projectState.appendTextLog(`WARNING: Git init failed`);
    }
  } catch (error) {
    projectState.appendTextLog(`WARNING: Git init failed - ${error.message}`);
  }
}

/**
 * Run Architect to create tasks
 */
export async function runArchitect(projectState, requirement, state) {
  console.log('🏗️  Architect designing solution...');
  projectState.appendTextLog(`\nArchitect designing solution...`);
  projectState.appendTaskLog('PLAN', `Creating tasks for: ${requirement}`);
  
  const architectResult = await callClaudeWrapper(
    PROMPTS.architect(requirement), 
    'Architect', 
    projectState
  );
  
  // Parse tasks and store full architect plan
  const architectPlan = parseAgentResponse(architectResult, 'Architect');
  state.architectPlan = architectPlan; // Store for tester
  
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
 * Run Architect to create backlogs instead of tasks
 */
export async function runArchitectBacklogs(projectState, requirement, state) {
  console.log('🏗️  Architect creating project backlogs...');
  projectState.appendTextLog(`\nArchitect creating backlogs...`);
  projectState.appendTaskLog('PLAN', `Creating backlogs for: ${requirement}`);
  
  const architectResult = await callClaudeWrapper(
    loadTemplate('architect-backlogs').replace('${requirement}', requirement), 
    'Architect', 
    projectState
  );
  
  // Parse backlogs
  const architectPlan = parseAgentResponse(architectResult, 'Architect');
  if (!architectPlan || architectPlan.status === 'FAILURE') {
    throw new Error(architectPlan?.error || 'Architect failed to create backlogs');
  }
  
  // Save backlogs to file
  const backlogsData = {
    project_summary: architectPlan.project_summary,
    runtime_requirements: architectPlan.runtime_requirements,
    technical_considerations: architectPlan.technical_considerations,
    backlogs: architectPlan.backlogs.map((b, idx) => ({
      ...b,
      id: idx + 1,
      status: 'pending',
      created_at: new Date().toISOString()
    }))
  };
  
  projectState.saveBacklogsData(backlogsData);
  console.log(`\n📋 Created ${backlogsData.backlogs.length} backlogs:\n`);
  
  // Display backlogs
  backlogsData.backlogs.forEach(backlog => {
    console.log(`   ${backlog.id}. ${backlog.title} [${backlog.priority}]`);
    console.log(`      ${backlog.description}`);
    console.log(`      Effort: ${backlog.estimated_effort}`);
    if (backlog.dependencies.length > 0) {
      console.log(`      Depends on: ${backlog.dependencies.join(', ')}`);
    }
    console.log('');
  });
  
  projectState.appendLog({
    action: 'BACKLOGS_CREATED',
    details: `Created ${backlogsData.backlogs.length} backlogs`,
    backlogs: backlogsData.backlogs
  });
}

/**
 * Run Project Reviewer
 */
export async function runProjectReviewer(projectState, requirement, state) {
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
  
  const reviewResult = await callClaudeWrapper(
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
export async function runRefactorAnalyst(projectState, requirement, state) {
  console.log('♻️  Analyzing code for refactoring...');
  
  const allFiles = getAllProjectFilesWithContent(projectState.projectPath).join('\n');
  
  projectState.appendTextLog(`\nRefactor Analyst analyzing code...`);
  projectState.appendTaskLog('PLAN', `Refactor analysis: ${requirement}`);
  
  const refactorResult = await callClaudeWrapper(
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
export async function runCoderTasks(projectState, requirement, state) {
  console.log('💻 Implementing tasks...\n');
  
  // Find the first incomplete task based on status
  let startIndex = 0;
  for (let i = 0; i < state.tasks.length; i++) {
    if (state.tasks[i].status === 'completed') {
      startIndex = i + 1;
    } else {
      break;
    }
  }
  
  // If all tasks are complete, nothing to do
  if (startIndex >= state.tasks.length) {
    console.log('✅ All tasks already completed\n');
    return;
  }
  
  if (startIndex > 0) {
    console.log(`📝 Resuming from task ${startIndex + 1} (${state.tasks.length - startIndex} remaining)...\n`);
    projectState.appendTextLog(`\nResuming from task ${startIndex + 1}`);
  }
  
  for (let i = startIndex; i < state.tasks.length; i++) {
    const task = state.tasks[i];
    
    console.log(`\n📝 Task ${task.taskNumber} (${i + 1}/${state.tasks.length}): ${task.description}`);
    projectState.appendTextLog(`\nStarting Task ${task.taskNumber}: ${task.description}`);
    projectState.appendTaskLog('BUILD', `Task ${task.taskNumber}: ${task.description}`);
    
    try {
      // Get all existing files
      const allFiles = getAllProjectFiles(projectState.projectPath)
        .map(f => `File: ${f}\n${readFileSync(join(projectState.projectPath, f), 'utf8')}`)
        .join('\n\n---\n\n');
      
      // Call Coder
      const coderResult = await callClaudeWrapper(
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
      
      // Clear last incomplete task on success
      projectState.clearLastIncompleteTask();
      
    } catch (error) {
      // Log task failure
      console.error(`  ❌ Task ${task.taskNumber} failed: ${error.message}`);
      
      projectState.appendLog({
        action: 'TASK_FAILED',
        taskNumber: task.taskNumber,
        taskIndex: i + 1,
        totalTasks: state.tasks.length,
        description: task.description,
        error: error.message
      });
      
      projectState.appendTextLog(`ERROR: Task ${task.taskNumber} failed - ${error.message}`);
      projectState.appendTaskLog('ERROR', `Task ${task.taskNumber} failed: ${error.message}`);
      
      // Store incomplete task info
      projectState.setLastIncompleteTask(i);
      
      // Re-throw to stop execution
      throw error;
    }
  }
  
  console.log('\n✅ All tasks completed!\n');
}

/**
 * Run Coder to fix specific issues
 */
export async function runCoderFix(projectState, requirement, recommendation, state) {
  console.log('🔧 Fixing issues...\n');
  
  const allFiles = getAllProjectFiles(projectState.projectPath)
    .map(f => `File: ${f}\n${readFileSync(join(projectState.projectPath, f), 'utf8')}`)
    .join('\n\n---\n\n');
  
  projectState.appendTextLog(`\nFixing issues based on: ${recommendation}`);
  projectState.appendTaskLog('BUILD', `Fixing: ${recommendation}`);
  
  const coderResult = await callClaudeWrapper(
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
export async function runTests(projectState, projectPath, requirement, state) {
  // Create tests if they don't exist
  const testFile = join(projectPath, 'plan-build-test/test/e2e.test.js');
  
  if (!existsSync(testFile) && state.tasks.length > 0) {
    console.log('🧪 Creating tests...');
    console.log('📋 Tests will verify functionality works correctly');
    console.log('');
    
    projectState.appendTextLog(`\nTester creating validation tests...`);
    
    // Get all implementation files so Tester can see what was built
    const implementationFiles = getAllProjectFilesWithContent(projectPath).join('\n');
    
    const testResult = await callClaudeWrapper(
      PROMPTS.finalTest(requirement, projectPath, state.architectPlan, implementationFiles), 
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
    await ensureTestSetupWrapper(projectPath, projectState);
  }
  
  // Always install dependencies to ensure any new packages are installed
  console.log('');
  try {
    await npmInstall(projectPath);
  } catch (error) {
    // Don't continue if npm install fails - tests will fail anyway
    throw error;
  }
  
  // Run tests
  console.log('\n🧪 Running tests...\n');
  
  // Kill any existing server on port 3000 first
  await killPort(3000, projectPath);
  
  let testOutput = '';
  try {
    const { stdout, stderr } = await execAsync('npm test', {
      cwd: projectPath,
      env: { ...process.env, CI: 'true' },
      timeout: 120000
    });
    
    testOutput = stdout + '\n' + stderr;
    console.log(stdout);
    if (stderr) console.error(stderr);
    
    // Log the test output for future use
    projectState.appendTextLog('\nRunning tests...\n' + testOutput);
    
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
    // Tests failed, capture the output
    testOutput = (error.stdout || '') + '\n' + (error.stderr || '');
    
    console.error('\n❌ Tests failed!');
    console.log(error.stdout || error.message);
    if (error.stderr) console.error(error.stderr);
    
    // Log the test output for future use (for fix-tests command)
    projectState.appendTextLog('\nRunning tests...\n' + testOutput);
    
    projectState.appendLog({
      action: 'TESTS_FAILED',
      error: error.message,
      output: testOutput
    });
    
    console.log('\n💡 Tip: Run "npm run fix-tests" to automatically fix the failing tests');
    
    process.exit(1);
  }
}

/**
 * Ensure test setup files exist
 */
async function ensureTestSetupWrapper(projectPath, projectState) {
  await ensureTestSetup(projectPath);
}
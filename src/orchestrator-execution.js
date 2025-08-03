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
  Logger.section('Starting new project...', '📝');
  
  // Copy template files
  await copyTemplateFiles(projectState);
  
  // Initialize git
  await initializeGitWrapper(projectState);
  
  // Run Architect to create backlogs
  await runArchitectBacklogs(projectState, requirement, state);
  
  // Don't run any tasks - just show the backlogs
  Logger.success('Project setup complete!');
  Logger.info('To start working on a backlog, use:');
  Logger.command('npm run process-backlog');
  Logger.info('To add more backlogs, use:');
  Logger.command('npm run backlog <description>');
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
  Logger.section('Adding new task to existing project...', '📝');
  
  // Run Architect for new task
  await runArchitect(projectState, requirement, state);
  
  // Run Coder for each task
  await runCoderTasks(projectState, requirement, state);
}

/**
 * Execute fix command flow
 */
export async function executeFix(projectState, requirement, state) {
  Logger.section('Fixing issues in project...', '🔧');
  
  // First, check if we're in the middle of a backlog
  let currentBacklog = null;
  const backlogsData = projectState.getBacklogsData();
  
  if (backlogsData) {
    currentBacklog = backlogsData.backlogs.find(b => b.status === 'in_progress');
    
    if (currentBacklog) {
      Logger.info(`Working on backlog #${currentBacklog.id}: ${currentBacklog.title}`);
    }
  }
  
  // Check if there's an incomplete task to resume
  const lastIncompleteTask = projectState.getLastIncompleteTask();
  if (lastIncompleteTask >= 0) {
    Logger.info(`Found incomplete task at index ${lastIncompleteTask + 1}`);
    Logger.info('Resuming task execution...');
    
    // Load existing tasks from the last architect run
    const taskManager = new TaskManager(projectState);
    const tasks = taskManager.reconstructTasksFromLogs();
    state.tasks = tasks;
    
    Logger.info(`Found ${tasks.length} tasks from current backlog`);
    const completedCount = tasks.filter(t => t.status === 'completed').length;
    Logger.success(`${completedCount} completed, ${tasks.length - completedCount} remaining`);
    
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
  Logger.section('Refactoring project...', '♻️');
  
  // Run Refactor Analyst
  await runRefactorAnalyst(projectState, requirement, state);
  
  // Run Coder for each refactor task
  await runCoderTasks(projectState, requirement, state);
}

/**
 * Execute fix-tests command flow
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
      console.log(''); // Empty line // Empty line for spacing
    }
    
    // Analyze common error patterns
    if (testOutput.includes('is already used')) {
      Logger.warning('Port conflict detected. Solutions:');
      const portMatch = testOutput.match(/localhost:(\d+)/);
      const conflictPort = portMatch ? portMatch[1] : 'PORT';
      Logger.command(`1. Kill the process: lsof -ti:${conflictPort} | xargs kill -9`);
      Logger.command(`2. Or update playwright.config.js: reuseExistingServer: true`);
      console.log(''); // Empty line // Empty line for spacing
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
      console.log(`📝 Applying fixes to ${fixes.fixed_tests.length} test file(s)...\n`);
      
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
      console.log(fixResult); // Show raw response // Show raw response
    }
    
  } catch (error) {
    Logger.error(`Error applying fixes: ${error.message}`);
    Logger.info('Raw response:');
    console.log(fixResult); // Show raw response
  }
}

/**
 * Execute add-backlog command
 */
export async function executeAddBacklog(projectState, requirement, state) {
  Logger.section('Adding new backlog item...', '📋');
  
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
  
  Logger.success('Added new backlog item:');
  Logger.command(`${newBacklog.id}. ${newBacklog.title}`);
  Logger.command(`   ${newBacklog.description}`);
  console.log(''); // Empty line // Empty line
  
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
    Logger.warning('No backlogs found. Create a project first with npm run create-project');
    return;
  }
  
  Logger.section(`Project Backlogs (${backlogsData.backlogs.length} items)`, '📋');
  
  // Group by status
  const pending = backlogsData.backlogs.filter(b => b.status === 'pending');
  const inProgress = backlogsData.backlogs.filter(b => b.status === 'in_progress');
  const completed = backlogsData.backlogs.filter(b => b.status === 'completed');
  
  if (inProgress.length > 0) {
    Logger.info('In Progress:');
    inProgress.forEach(b => {
      Logger.command(`${b.id}. ${b.title} [${b.priority}]`);
    });
    console.log(''); // Empty line // Empty line
  }
  
  // Show all backlogs with checkboxes
  Logger.info('All Backlogs:');
  backlogsData.backlogs.forEach(b => {
    const checkbox = b.status === 'completed' ? '✅' : '⬜';
    const statusIndicator = b.status === 'in_progress' ? ' 🔄' : '';
    Logger.command(`${checkbox} ${b.id}. ${b.title} [${b.priority}]${statusIndicator}`);
    
    if (b.status !== 'completed') {
      Logger.command(`   ${b.description}`);
      if (b.dependencies.length > 0) {
        const unmetDeps = b.dependencies.filter(dep => 
          !backlogsData.backlogs.find(backlog => backlog.id === dep && backlog.status === 'completed')
        );
        if (unmetDeps.length > 0) {
          Logger.warning(`Depends on: ${unmetDeps.join(', ')}`, true);
        }
      }
    }
  });
  console.log(''); // Empty line // Empty line
  
  Logger.info('Use "npm run process-backlog [id]" to work on a specific backlog');
}

/**
 * Execute reset-backlog command
 */
export async function executeResetBacklog(projectState, requirement, state) {
  const backlogsData = projectState.getBacklogsData();
  
  if (!backlogsData) {
    Logger.warning('No backlogs found. Create a project first with npm run create-project');
    return;
  }
  const backlogToReset = backlogsData.backlogs.find(b => b.id === parseInt(state.backlogId));
  
  if (!backlogToReset) {
    console.error(`Backlog #${state.backlogId} not found`);
    return;
  }
  
  // Reset status to pending
  projectState.updateBacklogStatus(backlogToReset.id, 'pending', { completed_at: undefined });
  
  Logger.success(`Reset backlog #${backlogToReset.id}: ${backlogToReset.title} to pending status`);
  
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
    Logger.warning('No backlogs found. Create a project first with npm run create-project');
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
      Logger.info(`Found interrupted backlog: #${backlogToProcess.id} ${backlogToProcess.title}`);
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
        Logger.warning('All pending backlogs have unmet dependencies');
        Logger.info('Pending backlogs:');
        pending.forEach(b => {
          Logger.command(`${b.id}. ${b.title} - waiting for: ${b.dependencies.join(', ')}`);
        });
        return;
      }
    }
  }
  
  if (!backlogToProcess) {
    Logger.success('All backlogs completed!');
    return;
  }
  
  Logger.section(`Processing backlog #${backlogToProcess.id}: ${backlogToProcess.title}`, '📋');
  Logger.info(`Description: ${backlogToProcess.description}`);
  Logger.info(`Priority: ${backlogToProcess.priority}`);
  Logger.info(`Estimated effort: ${backlogToProcess.estimated_effort}`);
  console.log(''); // Empty line // Empty line
  
  // Check if we're resuming an interrupted backlog
  let needsArchitect = true;
  if (backlogToProcess.status === 'in_progress') {
    Logger.warning('Resuming interrupted backlog...');
    console.log(''); // Empty line // Empty line
    
    // Check if we have tasks for this backlog in the logs
    const allTasks = projectState.getRequirementTasks(backlogToProcess.description);
    if (allTasks.length > 0) {
      needsArchitect = false;
      state.tasks = allTasks;
      Logger.info(`Found ${allTasks.length} existing tasks from previous attempt`);
      
      // Check task completion status
      const completedTasks = allTasks.filter(t => t.status === 'completed');
      const incompleteTasks = allTasks.filter(t => t.status !== 'completed');
      
      if (completedTasks.length > 0 && incompleteTasks.length > 0) {
        // Some tasks done, some not - review and continue
        Logger.success(`Completed: ${completedTasks.length} tasks`);
        Logger.info(`Remaining: ${incompleteTasks.length} tasks`);
        console.log(''); // Empty line // Empty line
        
        // Review what's been built so far
        Logger.info('Reviewing existing code before continuing...');
        const allFiles = getAllProjectFilesWithContent(projectState.projectPath).join('\n');
        const reviewPrompt = `Review the current state of: ${backlogToProcess.description}\n\nCompleted tasks:\n${completedTasks.map(t => `- ${t.description}`).join('\n')}\n\nRemaining tasks:\n${incompleteTasks.map(t => `- ${t.description}`).join('\n')}\n\nCurrent code:\n${allFiles}\n\nProvide a brief assessment: Is the code working so far? Any issues to fix before continuing?`;
        
        try {
          const review = await callClaudeWrapper(reviewPrompt, 'Code Reviewer', projectState);
          Logger.info('Review complete. Continuing with remaining tasks...');
          console.log(''); // Empty line // Empty line
        } catch (e) {
          Logger.info('Review skipped. Continuing with remaining tasks...');
          console.log(''); // Empty line // Empty line
        }
      } else if (incompleteTasks.length === 0) {
        Logger.warning('All tasks appear complete but backlog was interrupted');
        Logger.info('Will verify with tests...', true);
        console.log(''); // Empty line // Empty line
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
  
  Logger.success(`Backlog #${backlogToProcess.id} completed!`);
  
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
  Logger.section('Architect designing solution...', '🏗️');
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
  Logger.info(`Found ${state.tasks.length} tasks to implement`);
  console.log(''); // Empty line // Empty line
  
  if (state.tasks.length === 0) {
    throw new Error('Architect failed to create any tasks');
  }
  
  // Sync task counter with logs before assigning new task numbers
  projectState.syncTaskCounter();
  
  // Assign task numbers and log each task
  state.tasks.forEach((task, i) => {
    const taskNum = projectState.getNextTaskNumber();
    task.taskNumber = taskNum;
    
    Logger.command(`${i + 1}. ${task.description}`);
    
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
  
  console.log(''); // Empty line
  
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
  Logger.section('Architect creating project backlogs...', '🏗️');
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
  Logger.section(`Created ${backlogsData.backlogs.length} backlogs`, '📋');
  
  // Display backlogs
  backlogsData.backlogs.forEach(backlog => {
    Logger.command(`${backlog.id}. ${backlog.title} [${backlog.priority}]`);
    Logger.command(`   ${backlog.description}`);
    Logger.command(`   Effort: ${backlog.estimated_effort}`);
    if (backlog.dependencies.length > 0) {
      Logger.command(`   Depends on: ${backlog.dependencies.join(', ')}`);
    }
    console.log(''); // Empty line // Empty line
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
  Logger.section('Reviewing project state...', '📊');
  
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
    Logger.info('Project Review:');
    Logger.info(`Status: ${reviewJson.project_state.current_status}`, true);
    Logger.info(`Recommendation: ${reviewJson.recommendation.next_action}`, true);
    Logger.info(`Details: ${reviewJson.recommendation.description}`, true);
    console.log(''); // Empty line // Empty line
    
    return reviewJson.recommendation.description;
  }
  
  return reviewResult;
}

/**
 * Run Refactor Analyst
 */
export async function runRefactorAnalyst(projectState, requirement, state) {
  Logger.section('Analyzing code for refactoring...', '♻️');
  
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
    
    Logger.info('Refactor Analysis:');
    Logger.info(`Strengths: ${refactorJson.assessment.strengths.length} identified`, true);
    Logger.info(`Issues: ${refactorJson.assessment.weaknesses.length} found`, true);
    Logger.info(`Tasks: ${state.tasks.length} refactoring tasks`, true);
    console.log(''); // Empty line // Empty line
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
  Logger.section('Implementing tasks...', '💻');
  
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
    Logger.success('All tasks already completed');
    console.log(''); // Empty line // Empty line
    return;
  }
  
  if (startIndex > 0) {
    Logger.info(`Resuming from task ${startIndex + 1} (${state.tasks.length - startIndex} remaining)...`);
    console.log(''); // Empty line // Empty line
    projectState.appendTextLog(`\nResuming from task ${startIndex + 1}`);
  }
  
  for (let i = startIndex; i < state.tasks.length; i++) {
    const task = state.tasks[i];
    
    Logger.task(task.taskNumber, `${i + 1}/${state.tasks.length}`, task.description);
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
        Logger.file(existsSync(filePath) ? 'Updated' : 'Created', file.path);
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
      
      Logger.taskComplete(task.taskNumber);
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
  
  Logger.success('All tasks completed!');
  console.log(''); // Empty line // Empty line
}

/**
 * Run Coder to fix specific issues
 */
export async function runCoderFix(projectState, requirement, recommendation, state) {
  Logger.section('Fixing issues...', '🔧');
  
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
    Logger.file('Fixed', file.path);
    projectState.appendTextLog(`  Fixed: ${file.path}`);
  }
  
  Logger.success('Fixes applied!');
  console.log(''); // Empty line // Empty line
}

/**
 * Create and run tests
 */
export async function runTests(projectState, projectPath, requirement, state) {
  // Create tests if they don't exist
  const testFile = join(projectPath, 'plan-build-test/test/e2e.test.js');
  
  if (!existsSync(testFile) && state.tasks.length > 0) {
    Logger.info('Creating tests...');
    Logger.info('Tests will verify functionality works correctly');
    console.log(''); // Empty line // Empty line
    
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
        Logger.info('Tests included:', true);
        testJson.test_file.test_cases.forEach(tc => {
          Logger.command(`• ${tc.name}`);
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
      Logger.file('Created', file.path);
    }
    
    // Ensure package.json and playwright.config.js exist
    await ensureTestSetupWrapper(projectPath, projectState);
  }
  
  // Always install dependencies to ensure any new packages are installed
  console.log(''); // Empty line
  try {
    await npmInstall(projectPath);
  } catch (error) {
    // Don't continue if npm install fails - tests will fail anyway
    throw error;
  }
  
  // Run tests
  Logger.section('Running tests...', '🧪');
  
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
    console.log(stdout); // Show test output
    if (stderr) console.error(stderr);
    
    // Log the test output for future use
    projectState.appendTextLog('\nRunning tests...\n' + testOutput);
    
    projectState.appendLog({
      action: 'TESTS_PASSED',
      details: 'All tests passed successfully'
    });
    
    Logger.success('All tests passed!');
    
    // Try to start server
    try {
      Logger.section('Starting server...', '🌐');
      const serverProcess = exec('npm start', {
        cwd: projectPath,
        detached: false
      });
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      Logger.success('Project ready!');
      Logger.info('URL: http://localhost:3000', true);
      Logger.info('Press Ctrl+C to stop the server', true);
      console.log(''); // Empty line
      
      // Keep process alive
      await new Promise(() => {});
    } catch {
      Logger.success('Project completed successfully!');
    }
    
  } catch (error) {
    // Tests failed, capture the output
    testOutput = (error.stdout || '') + '\n' + (error.stderr || '');
    
    console.error('\n❌ Tests failed!');
    console.log(error.stdout || error.message); // Show error output
    if (error.stderr) console.error(error.stderr);
    
    // Log the test output for future use (for fix-tests command)
    projectState.appendTextLog('\nRunning tests...\n' + testOutput);
    
    projectState.appendLog({
      action: 'TESTS_FAILED',
      error: error.message,
      output: testOutput
    });
    
    Logger.info('Tip: Run "npm run fix-tests" to automatically fix the failing tests');
    
    process.exit(1);
  }
}

/**
 * Ensure test setup files exist
 */
async function ensureTestSetupWrapper(projectPath, projectState) {
  await ensureTestSetup(projectPath);
}
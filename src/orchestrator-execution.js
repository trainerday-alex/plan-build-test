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


// Backlog-related commands have been moved to src/commands/backlog-commands.js

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
// TODO: Move to src/agents/ai-agents.js
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
// TODO: Move to src/agents/ai-agents.js
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
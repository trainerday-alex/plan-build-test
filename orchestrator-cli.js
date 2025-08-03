#!/usr/bin/env node

import { runOrchestrator } from './orchestrator.js';
import { exec } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

// Import shared utilities
import { PROJECTS_DIR } from './src/config.js';
import { getProjectPath, readJsonFile } from './src/file-utils.js';
import { autoCommit } from './src/git-utils.js';
import { getCurrentProject, setCurrentProject, requireCurrentProject, validateProjectExists, getProjectStatus } from './src/project-manager.js';
import { log, logSuccess, logError, logSection, logListItem, logCheckbox, EMOJI } from './src/console-utils.js';
import { exitWithError, validateArgs, wrapAsync, ERROR_MESSAGES } from './src/error-handlers.js';


// Main command handler
const main = wrapAsync(async () => {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'create-project':
    case 'new-project': // Keep for backward compatibility
      validateArgs(args, 2, ERROR_MESSAGES.COMMAND_USAGE.CREATE_PROJECT);
      const projectName = args[0];
      const description = args.slice(1).join(' ');
      
      log(EMOJI.rocket, 'Creating new project...\n');
      logSection('Setup Phase:');
      logListItem('Create project folder');
      logListItem('Initialize git repository');
      logListItem('Create .gitignore');
      logListItem('Set as current project');
      logListItem('Initialize logs\n');
      
      setCurrentProject(projectName);
      
      console.log('Then: Plan → Build → Test cycle for first task\n');
      await runOrchestrator(projectName, description, 'create-project');
      break;

    case 'backlog':
      validateArgs(args, 1, ERROR_MESSAGES.COMMAND_USAGE.BACKLOG);
      const currentProject = requireCurrentProject();
      const backlogDescription = args.join(' ');
      const backlogProjectPath = getProjectPath(currentProject);
      
      log(EMOJI.clipboard, `Adding new backlog item to ${currentProject}...`);
      
      // Commit current state before starting new backlog
      log(EMOJI.package, 'Committing current state...');
      await autoCommit(backlogProjectPath, `Before backlog: ${backlogDescription.substring(0, 50)}...`);
      
      console.log('\nAdding backlog item...\n');
      await runOrchestrator(currentProject, `Add backlog: ${backlogDescription}`, 'add-backlog');
      break;

    case 'process-backlog':
      const processProject = requireCurrentProject();
      const backlogId = args[0];
      if (!backlogId) {
        log(EMOJI.clipboard, 'Processing next backlog item...');
        await runOrchestrator(processProject, 'Process next backlog item', 'process-backlog');
      } else {
        log(EMOJI.clipboard, `Processing backlog item #${backlogId}...`);
        await runOrchestrator(processProject, `Process backlog item #${backlogId}`, 'process-backlog', { backlogId });
      }
      break;

    case 'list-backlogs':
    case 'show-backlogs':
      const listProject = getCurrentProject();
      if (!listProject) {
        console.error('No active project. Use npm run new-project or npm run change-project first.');
        process.exit(1);
      }
      console.log(`\n📋 Listing backlogs for ${listProject}...`);
      await runOrchestrator(listProject, 'List backlogs', 'list-backlogs');
      break;

    case 'reset-backlog':
      const resetProject = getCurrentProject();
      if (!resetProject) {
        console.error('No active project. Use npm run new-project or npm run change-project first.');
        process.exit(1);
      }
      const backlogIdToReset = args[0];
      if (!backlogIdToReset) {
        console.error('Usage: npm run reset-backlog <id>');
        process.exit(1);
      }
      console.log(`\n🔄 Resetting backlog #${backlogIdToReset} to pending status...`);
      await runOrchestrator(resetProject, `Reset backlog #${backlogIdToReset}`, 'reset-backlog', { backlogId: backlogIdToReset });
      break;

    case 'help':
      logSection('Plan-Build-Test Orchestrator Commands');
      
      console.log('\nProject Management:');
      logListItem('npm run create-project <name> <description>  - Create new project with backlogs');
      logListItem('npm run change-project <name>                - Switch to existing project');
      logListItem('npm run status                               - Show current project status');
      logListItem('npm run start-project                        - Start the web server\n');
      
      console.log('Backlog Management:');
      logListItem('npm run show-backlogs                        - List all backlogs with status');
      logListItem('npm run process-backlog [id]                 - Work on next (or specific) backlog');
      logListItem('npm run backlog <description>                - Add new backlog item');
      logListItem('npm run reset-backlog <id>                   - Reset stuck backlog to pending\n');
      
      console.log('Development:');
      logListItem('npm run fix                                  - Fix failing tests');
      logListItem('npm run fix-tests                            - Update tests to match implementation');
      logListItem('npm run refactor                             - Improve code quality\n');
      
      console.log('Legend:');
      logListItem(`${EMOJI.success} Completed backlog`);
      logListItem('⬜ Pending backlog');
      logListItem(`${EMOJI.loading} In progress\n`);
      break;

    case 'fix':
      const fixProject = requireCurrentProject();
      console.log(`\n🔧 Fixing issues in ${fixProject}...`);
      console.log('Running: Plan → Build → Test\n');
      await runOrchestrator(fixProject, 'Fix failing tests and resolve issues', 'fix');
      break;

    case 'refactor':
      const refactorProject = requireCurrentProject();
      const refactorProjectPath = getProjectPath(refactorProject);
      
      log(EMOJI.recycle, `Refactoring ${refactorProject}...`);
      
      // Commit current state before refactoring
      log(EMOJI.package, 'Committing current state...');
      await autoCommit(refactorProjectPath, 'Before refactor');
      
      console.log('\nRunning: Plan → Build → Test\n');
      await runOrchestrator(refactorProject, 'Refactor and improve existing code', 'refactor');
      break;

    case 'change-project':
      if (args.length < 1) {
        console.error('Usage: npm run change-project <project-name>');
        process.exit(1);
      }
      const newProject = args[0];
      const projectPath = join(PROJECTS_DIR, newProject);
      if (!existsSync(projectPath)) {
        console.error(`Project "${newProject}" not found in ${PROJECTS_DIR}`);
        process.exit(1);
      }
      setCurrentProject(newProject);
      console.log(`✅ Switched to project: ${newProject}`);
      break;

    case 'start-project':
      const startProject = getCurrentProject();
      if (!startProject) {
        console.error('No active project. Use npm run new-project or npm run change-project first.');
        process.exit(1);
      }
      
      const startProjectPath = join(PROJECTS_DIR, startProject);
      if (!existsSync(startProjectPath)) {
        console.error(`Project "${startProject}" not found in ${PROJECTS_DIR}`);
        process.exit(1);
      }
      
      console.log(`\n🌐 Starting server for project: ${startProject}`);
      console.log(`📁 Location: ${startProjectPath}`);
      console.log(`🔗 URL: http://localhost:3000/plan-build-test\n`);
      console.log('Press Ctrl+C to stop the server\n');
      
      try {
        // Start server and keep process alive
        const serverProcess = exec('npm start', {
          cwd: startProjectPath,
          stdio: 'inherit'
        });
        
        // Handle process termination
        process.on('SIGINT', () => {
          console.log('\n🛑 Stopping server...');
          serverProcess.kill();
          process.exit(0);
        });
        
        // Keep the process alive
        await new Promise(() => {});
        
      } catch (error) {
        console.error(`❌ Failed to start server: ${error.message}`);
        process.exit(1);
      }
      break;

    case 'status':
      const statusProject = requireCurrentProject();
      const statusProjectPath = getProjectPath(statusProject);
      
      log(EMOJI.chart, `Status for project: ${statusProject}\n`);
      
      const projectStatus = getProjectStatus(statusProjectPath);
      
      if (!projectStatus.exists) {
        console.log(projectStatus.message || 'No log file found.');
        process.exit(0);
      }
      
      if (projectStatus.error) {
        logError(projectStatus.error);
        process.exit(1);
      }
      
      console.log(`Status: ${projectStatus.status}`);
      console.log(`Progress: ${projectStatus.completedTasks}/${projectStatus.totalTasks} tasks completed\n`);
      
      if (projectStatus.requirements && projectStatus.requirements.length > 0) {
        console.log(`Requirements (${projectStatus.requirements.length}):`);
        projectStatus.requirements.forEach(req => {
          const reqTasks = projectStatus.tasks.filter(t => t.requirement === req);
          const reqCompleted = reqTasks.filter(t => t.status === 'completed');
          logListItem(`${req} (${reqCompleted.length}/${reqTasks.length} completed)`);
        });
        console.log('');
      }
      
      if (projectStatus.tasks && projectStatus.tasks.length > 0) {
        console.log('Tasks:');
        projectStatus.tasks.forEach(task => {
          logCheckbox(task.status === 'completed', `${task.number}. ${task.description}`, 1);
        });
      }
      
      // Show recent task log entries
      const taskLogFile = join(statusProjectPath, 'task-log.txt');
      if (existsSync(taskLogFile)) {
        console.log('\nRecent Activity:');
        const taskLog = readFileSync(taskLogFile, 'utf8');
        const lines = taskLog.trim().split('\n');
        const recentLines = lines.slice(-5); // Last 5 entries
        recentLines.forEach(line => console.log(line));
      }
      
      console.log(`\nProject location: ${statusProjectPath}`);
      break;

    case 'fix-tests':
      const fixTestsProject = requireCurrentProject();
      log(EMOJI.magnifier, `Analyzing and fixing failing tests in ${fixTestsProject}...`);
      console.log('Running: Read Logs → Analyze Failures → Fix Tests\n');
      await runOrchestrator(fixTestsProject, 'Fix failing tests to match implementation (do not change code)', 'fix-tests');
      break;

    default:
      exitWithError('Unknown command. Run "npm run help" to see all available commands.');
  }
});

// Run main function
main();
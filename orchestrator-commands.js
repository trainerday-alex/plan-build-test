#!/usr/bin/env node

import { runOrchestratorNew } from './orchestrator.js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import dotenv from 'dotenv';

dotenv.config();

const execAsync = promisify(exec);
const PROJECTS_DIR = process.env.PROJECTS_DIR || join(process.cwd(), 'projects');
const CURRENT_PROJECT_FILE = join(process.cwd(), '.current-project');

// Get current project
function getCurrentProject() {
  if (existsSync(CURRENT_PROJECT_FILE)) {
    return readFileSync(CURRENT_PROJECT_FILE, 'utf8').trim();
  }
  return null;
}

// Set current project
function setCurrentProject(projectName) {
  writeFileSync(CURRENT_PROJECT_FILE, projectName);
}

// Auto commit changes
async function autoCommit(projectPath, message) {
  try {
    // Check if git is initialized
    await execAsync('git status', { cwd: projectPath });
    
    // Add all changes
    await execAsync('git add -A', { cwd: projectPath });
    
    // Check if there are changes to commit
    const { stdout } = await execAsync('git status --porcelain', { cwd: projectPath });
    if (stdout.trim()) {
      // Commit changes
      await execAsync(`git commit -m "${message}"`, { cwd: projectPath });
      console.log(`  ✓ Committed: ${message}`);
    } else {
      console.log('  ✓ No changes to commit');
    }
  } catch (error) {
    console.log('  ⚠️  Git commit failed (git may not be initialized)');
  }
}

// Main command handler
async function main() {
  const command = process.argv[2];
  const args = process.argv.slice(3);

  switch (command) {
    case 'create-project':
    case 'new-project': // Keep for backward compatibility
      if (args.length < 2) {
        console.error('Usage: npm run new-project <name> <description>');
        process.exit(1);
      }
      const projectName = args[0];
      const description = args.slice(1).join(' ');
      
      console.log('\n🚀 Creating new project...\n');
      console.log('Setup Phase:');
      console.log('  - Create project folder');
      console.log('  - Initialize git repository');
      console.log('  - Create .gitignore');
      console.log('  - Set as current project');
      console.log('  - Initialize logs\n');
      
      setCurrentProject(projectName);
      
      console.log('Then: Plan → Build → Test cycle for first task\n');
      await runOrchestratorNew(projectName, description, 'create-project');
      break;

    case 'backlog':
      if (args.length < 1) {
        console.error('Usage: npm run backlog <backlog-description>');
        process.exit(1);
      }
      const currentProject = getCurrentProject();
      if (!currentProject) {
        console.error('No active project. Use npm run new-project or npm run change-project first.');
        process.exit(1);
      }
      const backlogDescription = args.join(' ');
      const backlogProjectPath = join(PROJECTS_DIR, currentProject);
      
      console.log(`\n📋 Adding new backlog item to ${currentProject}...`);
      
      // Commit current state before starting new backlog
      console.log('\n📦 Committing current state...');
      await autoCommit(backlogProjectPath, `Before backlog: ${backlogDescription.substring(0, 50)}...`);
      
      console.log('\nAdding backlog item...\n');
      await runOrchestratorNew(currentProject, `Add backlog: ${backlogDescription}`, 'add-backlog');
      break;

    case 'process-backlog':
      const processProject = getCurrentProject();
      if (!processProject) {
        console.error('No active project. Use npm run new-project or npm run change-project first.');
        process.exit(1);
      }
      const backlogId = args[0];
      if (!backlogId) {
        console.log('\n📋 Processing next backlog item...');
        await runOrchestratorNew(processProject, 'Process next backlog item', 'process-backlog');
      } else {
        console.log(`\n📋 Processing backlog item #${backlogId}...`);
        await runOrchestratorNew(processProject, `Process backlog item #${backlogId}`, 'process-backlog', { backlogId });
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
      await runOrchestratorNew(listProject, 'List backlogs', 'list-backlogs');
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
      await runOrchestratorNew(resetProject, `Reset backlog #${backlogIdToReset}`, 'reset-backlog', { backlogId: backlogIdToReset });
      break;

    case 'help':
      console.log('\n📚 Plan-Build-Test Orchestrator Commands\n');
      console.log('Project Management:');
      console.log('  npm run create-project <name> <description>  - Create new project with backlogs');
      console.log('  npm run change-project <name>                - Switch to existing project');
      console.log('  npm run status                               - Show current project status');
      console.log('  npm run start-project                        - Start the web server\n');
      
      console.log('Backlog Management:');
      console.log('  npm run show-backlogs                        - List all backlogs with status');
      console.log('  npm run process-backlog [id]                 - Work on next (or specific) backlog');
      console.log('  npm run backlog <description>                - Add new backlog item');
      console.log('  npm run reset-backlog <id>                   - Reset stuck backlog to pending\n');
      
      console.log('Development:');
      console.log('  npm run fix                                  - Fix failing tests');
      console.log('  npm run fix-tests                            - Update tests to match implementation');
      console.log('  npm run refactor                             - Improve code quality\n');
      
      console.log('Legend:');
      console.log('  ✅ Completed backlog');
      console.log('  ⬜ Pending backlog');
      console.log('  🔄 In progress\n');
      break;

    case 'fix':
      const fixProject = getCurrentProject();
      if (!fixProject) {
        console.error('No active project. Use npm run new-project or npm run change-project first.');
        process.exit(1);
      }
      console.log(`\n🔧 Fixing issues in ${fixProject}...`);
      console.log('Running: Plan → Build → Test\n');
      await runOrchestratorNew(fixProject, 'Fix failing tests and resolve issues', 'fix');
      break;

    case 'refactor':
      const refactorProject = getCurrentProject();
      if (!refactorProject) {
        console.error('No active project. Use npm run new-project or npm run change-project first.');
        process.exit(1);
      }
      const refactorProjectPath = join(PROJECTS_DIR, refactorProject);
      
      console.log(`\n♻️  Refactoring ${refactorProject}...`);
      
      // Commit current state before refactoring
      console.log('\n📦 Committing current state...');
      await autoCommit(refactorProjectPath, 'Before refactor');
      
      console.log('\nRunning: Plan → Build → Test\n');
      await runOrchestratorNew(refactorProject, 'Refactor and improve existing code', 'refactor');
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
      const statusProject = getCurrentProject();
      if (!statusProject) {
        console.error('No active project. Use npm run new-project or npm run change-project first.');
        process.exit(1);
      }
      
      console.log(`\n📊 Status for project: ${statusProject}\n`);
      
      const statusProjectPath = join(PROJECTS_DIR, statusProject);
      const logFile = join(statusProjectPath, 'plan-build-test', 'logs.json');
      
      if (!existsSync(logFile)) {
        console.log('No log file found. Project may be new or not initialized.');
        process.exit(0);
      }
      
      try {
        const logs = JSON.parse(readFileSync(logFile, 'utf8'));
        
        // Extract tasks and completion status from logs
        const taskMap = new Map();
        const requirements = new Set();
        
        logs.forEach(entry => {
          if (entry.action === 'CREATE_TASK') {
            taskMap.set(entry.taskNumber, {
              number: entry.taskNumber,
              description: entry.description,
              status: 'pending',
              requirement: entry.requirement
            });
            if (entry.requirement) requirements.add(entry.requirement);
          } else if (entry.action === 'COMPLETE_TASK' && taskMap.has(entry.taskNumber)) {
            taskMap.get(entry.taskNumber).status = 'completed';
          }
        });
        
        const tasks = Array.from(taskMap.values()).sort((a, b) => a.number - b.number);
        const completedTasks = tasks.filter(t => t.status === 'completed');
        
        console.log(`Status: ${completedTasks.length === tasks.length ? 'completed' : 'in progress'}`);
        console.log(`Progress: ${completedTasks.length}/${tasks.length} tasks completed\n`);
        
        if (requirements.size > 0) {
          console.log(`Requirements (${requirements.size}):`);
          requirements.forEach(req => {
            const reqTasks = tasks.filter(t => t.requirement === req);
            const reqCompleted = reqTasks.filter(t => t.status === 'completed');
            console.log(`  • ${req} (${reqCompleted.length}/${reqTasks.length} completed)`);
          });
          console.log('');
        }
        
        if (tasks.length > 0) {
          console.log('Tasks:');
          tasks.forEach(task => {
            const status = task.status === 'completed' ? '✅' : '⬜';
            console.log(`  ${status} ${task.number}. ${task.description}`);
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
        
      } catch (error) {
        console.error('Error reading project state:', error.message);
      }
      break;

    case 'fix-tests':
      const fixTestsProject = getCurrentProject();
      if (!fixTestsProject) {
        console.error('No active project. Use npm run new-project or npm run change-project first.');
        process.exit(1);
      }
      console.log(`\n🔍 Analyzing and fixing failing tests in ${fixTestsProject}...`);
      console.log('Running: Read Logs → Analyze Failures → Fix Tests\n');
      await runOrchestratorNew(fixTestsProject, 'Fix failing tests to match implementation (do not change code)', 'fix-tests');
      break;

    default:
      console.error('Unknown command. Run "npm run help" to see all available commands.');
      process.exit(1);
  }
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
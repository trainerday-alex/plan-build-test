#!/usr/bin/env node

import { runOrchestrator } from './orchestrator-smart.js';
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
    case 'new-project':
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
      await runOrchestrator(projectName, description);
      break;

    case 'task':
      if (args.length < 1) {
        console.error('Usage: npm run task <task-description>');
        process.exit(1);
      }
      const currentProject = getCurrentProject();
      if (!currentProject) {
        console.error('No active project. Use npm run new-project or npm run change-project first.');
        process.exit(1);
      }
      const taskDescription = args.join(' ');
      const taskProjectPath = join(PROJECTS_DIR, currentProject);
      
      console.log(`\n📌 Adding new task to ${currentProject}...`);
      
      // Commit current state before starting new task
      console.log('\n📦 Committing current state...');
      await autoCommit(taskProjectPath, `Before task: ${taskDescription.substring(0, 50)}...`);
      
      console.log('\nRunning: Plan → Build → Test\n');
      await runOrchestrator(currentProject, `Add new task: ${taskDescription}`);
      break;

    case 'fix':
      const fixProject = getCurrentProject();
      if (!fixProject) {
        console.error('No active project. Use npm run new-project or npm run change-project first.');
        process.exit(1);
      }
      console.log(`\n🔧 Fixing issues in ${fixProject}...`);
      console.log('Running: Plan → Build → Test\n');
      await runOrchestrator(fixProject, 'Fix failing tests and resolve issues');
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
      await runOrchestrator(refactorProject, 'Refactor and improve existing code');
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

    case 'status':
      const statusProject = getCurrentProject();
      if (!statusProject) {
        console.error('No active project. Use npm run new-project or npm run change-project first.');
        process.exit(1);
      }
      
      console.log(`\n📊 Status for project: ${statusProject}\n`);
      
      const statusProjectPath = join(PROJECTS_DIR, statusProject);
      const stateFile = join(statusProjectPath, 'orchestrator-state.json');
      
      if (!existsSync(stateFile)) {
        console.log('No state file found. Project may be new or not initialized.');
        process.exit(0);
      }
      
      try {
        const state = JSON.parse(readFileSync(stateFile, 'utf8'));
        
        console.log(`Status: ${state.status || 'unknown'}`);
        console.log(`Progress: ${state.completedTasks.length}/${state.tasks.length} tasks completed\n`);
        
        if (state.tasks && state.tasks.length > 0) {
          console.log('Tasks:');
          state.tasks.forEach((task, i) => {
            const isCompleted = state.completedTasks.includes(task.description);
            const status = isCompleted ? '✅' : '⬜';
            console.log(`${status} ${i + 1}. ${task.description}`);
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

    default:
      console.error('Unknown command. Use: new-project, task, fix, refactor, change-project, or status');
      process.exit(1);
  }
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
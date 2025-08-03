#!/usr/bin/env node

import { join } from 'path';
import { existsSync, mkdirSync, rmSync } from 'fs';

// Import shared utilities  
import { cleanupTempFiles } from './src/file-utils.js';
import { PROJECTS_DIR } from './src/config.js';

// Import ProjectState from new location
import { ProjectState } from './src/project-state.js';

// Import all execution functions from new location
import {
  executeCreateProject,
  executeAddTask,
  executeFix,
  executeRefactor,
  runTests
} from './src/orchestrator-execution.js';

// Import backlog commands from new location
import {
  executeAddBacklog,
  executeProcessBacklog,
  executeListBacklogs,
  executeResetBacklog
} from './src/commands/backlog-commands.js';

// Import test commands from new location
import {
  executeFixTests
} from './src/commands/test-commands.js';

// Export for backward compatibility
export { loadTemplate, createPrompts } from './src/template-utils.js';
import { createPrompts } from './src/template-utils.js';
export const PROMPTS = createPrompts();
export { ProjectState } from './src/project-state.js';

/**
 * Main orchestrator function with command-based flow
 */
export async function runOrchestrator(projectName, requirement, commandType = 'create-project', options = {}) {
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
      status: 'started',
      ...options
    };

    // Execute based on command type
    switch (commandType) {
      case 'create-project':
        await executeCreateProject(projectState, requirement, state);
        break;
        
      case 'task':
        await executeAddTask(projectState, requirement, state);
        break;
        
      case 'add-backlog':
        await executeAddBacklog(projectState, requirement, state);
        break;
        
      case 'process-backlog':
        await executeProcessBacklog(projectState, requirement, state);
        break;
        
      case 'list-backlogs':
        await executeListBacklogs(projectState, requirement, state);
        break;
        
      case 'reset-backlog':
        await executeResetBacklog(projectState, requirement, state);
        break;
        
      case 'fix':
        await executeFix(projectState, requirement, state);
        break;
        
      case 'refactor':
        await executeRefactor(projectState, requirement, state);
        break;
        
      case 'fix-tests':
        await executeFixTests(projectState, requirement, state);
        break;
        
      default:
        console.error(`❌ Unknown command type: ${commandType}`);
        process.exit(1);
    }
    
    // Finish with testing unless we're analyzing test fixes, managing backlogs, or creating a new project
    if (!['fix-tests', 'list-backlogs', 'add-backlog', 'create-project', 'reset-backlog'].includes(commandType)) {
      await runTests(projectState, projectPath, requirement, state);
    }
    
  } catch (error) {
    console.error('❌ Orchestrator error:', error.message);
    projectState.appendTextLog(`ERROR: ${error.message}`);
    process.exit(1);
  }
}
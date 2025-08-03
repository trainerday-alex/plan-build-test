/**
 * Backlog management commands
 * Handles all backlog-related operations including add, list, reset, and process
 */

import { Logger } from '../logger.js';
import { getAllProjectFilesWithContent } from '../file-utils.js';
import { callClaude } from '../claude-utils.js';

// Import agent functions that will be moved later
// TODO: Update these imports after agents are extracted
import { runArchitect, runCoderTasks } from '../orchestrator-execution.js';

/**
 * Wrapper for callClaude to maintain compatibility
 */
async function callClaudeWrapper(prompt, role, projectState = null, retryCount = 0) {
  return callClaude(prompt, role, projectState, retryCount);
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
  console.log(''); // Empty line
  
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
  
  // Show in-progress items first
  const inProgress = backlogsData.backlogs.filter(b => b.status === 'in_progress');
  const pending = backlogsData.backlogs.filter(b => b.status === 'pending');
  const completed = backlogsData.backlogs.filter(b => b.status === 'completed');
  
  if (inProgress.length > 0) {
    Logger.info('In Progress:');
    inProgress.forEach(b => {
      Logger.command(`${b.id}. ${b.title} [${b.priority}]`);
    });
    console.log(''); // Empty line
  }
  
  // Show all backlogs with status
  Logger.info('All Backlogs:');
  backlogsData.backlogs.forEach(b => {
    const checkbox = b.status === 'completed' ? '✅' : '⬜';
    const statusIndicator = b.status === 'in_progress' ? ' 🔄' : '';
    Logger.command(`${checkbox} ${b.id}. ${b.title} [${b.priority}]${statusIndicator}`);
    
    // Show description and dependencies
    if (b.description !== b.title) {
      Logger.command(`   ${b.description}`);
    }
    
    if (b.dependencies && b.dependencies.length > 0) {
      // Check if dependencies are met
      const completedIds = completed.map(c => c.id);
      const unmetDeps = b.dependencies.filter(dep => !completedIds.includes(dep));
      if (unmetDeps.length > 0 && b.status !== 'completed') {
        Logger.warning(`Depends on: ${unmetDeps.join(', ')}`, true);
      }
    }
  });
  
  console.log(''); // Empty line
  
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
  
  const backlogId = parseInt(state.backlogId);
  const backlogToReset = backlogsData.backlogs.find(b => b.id === backlogId);
  
  if (!backlogToReset) {
    console.error(`Backlog #${backlogId} not found`);
    return;
  }
  
  // Reset to pending status
  projectState.updateBacklogStatus(backlogId, 'pending');
  Logger.success(`Reset backlog #${backlogToReset.id}: ${backlogToReset.title} to pending status`);
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
  console.log(''); // Empty line
  
  // Check if we're resuming an interrupted backlog
  let needsArchitect = true;
  if (backlogToProcess.status === 'in_progress') {
    Logger.warning('Resuming interrupted backlog...');
    console.log(''); // Empty line
    
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
        console.log(''); // Empty line
        
        // Review what's been built so far
        Logger.info('Reviewing existing code before continuing...');
        const allFiles = getAllProjectFilesWithContent(projectState.projectPath).join('\n');
        const reviewPrompt = `Review the current state of: ${backlogToProcess.description}\n\nCompleted tasks:\n${completedTasks.map(t => `- ${t.description}`).join('\n')}\n\nRemaining tasks:\n${incompleteTasks.map(t => `- ${t.description}`).join('\n')}\n\nCurrent code:\n${allFiles}\n\nProvide a brief assessment: Is the code working so far? Any issues to fix before continuing?`;
        
        try {
          const review = await callClaudeWrapper(reviewPrompt, 'Code Reviewer', projectState);
          Logger.info('Review complete. Continuing with remaining tasks...');
          console.log(''); // Empty line
        } catch (e) {
          Logger.info('Review skipped. Continuing with remaining tasks...');
          console.log(''); // Empty line
        }
      } else if (incompleteTasks.length === 0) {
        Logger.warning('All tasks appear complete but backlog was interrupted');
        Logger.info('Will verify with tests...', true);
        console.log(''); // Empty line
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
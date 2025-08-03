import { existsSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { CURRENT_PROJECT_FILE, PROJECTS_DIR } from './config.js';
import { getProjectPath } from './file-utils.js';

/**
 * Get the current active project name
 */
export function getCurrentProject() {
  if (existsSync(CURRENT_PROJECT_FILE)) {
    return readFileSync(CURRENT_PROJECT_FILE, 'utf8').trim();
  }
  return null;
}

/**
 * Set the current active project
 */
export function setCurrentProject(projectName) {
  writeFileSync(CURRENT_PROJECT_FILE, projectName);
}

/**
 * Check if a project exists
 */
export function projectExists(projectName) {
  const projectPath = getProjectPath(projectName);
  return existsSync(projectPath);
}

/**
 * Require current project or exit with error
 */
export function requireCurrentProject() {
  const currentProject = getCurrentProject();
  if (!currentProject) {
    console.error('No active project. Use npm run new-project or npm run change-project first.');
    process.exit(1);
  }
  return currentProject;
}

/**
 * Validate project exists or exit with error
 */
export function validateProjectExists(projectName) {
  if (!projectExists(projectName)) {
    console.error(`Project "${projectName}" not found in ${PROJECTS_DIR}`);
    process.exit(1);
  }
}

/**
 * Get project info including path and validation
 */
export function getProjectInfo(projectName = null) {
  const project = projectName || requireCurrentProject();
  validateProjectExists(project);
  
  return {
    name: project,
    path: getProjectPath(project)
  };
}

/**
 * List all projects in the projects directory
 */
export function listProjects() {
  if (!existsSync(PROJECTS_DIR)) {
    return [];
  }
  
  const entries = readdirSync(PROJECTS_DIR, { withFileTypes: true });
  
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

/**
 * Get project status summary
 */
export function getProjectStatus(projectPath) {
  const planBuildTestDir = join(projectPath, 'plan-build-test');
  const logFile = join(planBuildTestDir, 'logs.json');
  
  if (!existsSync(logFile)) {
    return {
      exists: false,
      message: 'No log file found. Project may be new or not initialized.'
    };
  }
  
  try {
    const logs = JSON.parse(readFileSync(logFile, 'utf8'));
    
    // Extract tasks and completion status
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
    
    return {
      exists: true,
      status: completedTasks.length === tasks.length ? 'completed' : 'in progress',
      totalTasks: tasks.length,
      completedTasks: completedTasks.length,
      requirements: Array.from(requirements),
      tasks: tasks
    };
  } catch (error) {
    return {
      exists: true,
      error: `Error reading project state: ${error.message}`
    };
  }
}
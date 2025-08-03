import { join } from 'path';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { readJsonFile, writeJsonFile, appendTextLog as appendTextLogUtil } from './file-utils.js';

/**
 * Project state management class
 * Handles all project-specific state, logging, and task tracking
 */
export class ProjectState {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.planBuildTestDir = join(projectPath, 'plan-build-test');
    this.logFile = join(this.planBuildTestDir, 'logs.json');
    this.textLogFile = join(this.planBuildTestDir, 'log.txt');
    this.taskLogFile = join(this.planBuildTestDir, 'task-log.txt');
    this.currentTaskNumber = 0;
    
    // Ensure plan-build-test directory exists
    if (!existsSync(this.planBuildTestDir)) {
      mkdirSync(this.planBuildTestDir, { recursive: true });
    }
    
    // Initialize task counter from existing logs
    if (existsSync(this.logFile)) {
      try {
        const log = JSON.parse(readFileSync(this.logFile, 'utf8'));
        // Find the highest task number from CREATE_TASK entries only
        const createTaskEntries = log.filter(e => e.action === 'CREATE_TASK' && e.taskNumber);
        if (createTaskEntries.length > 0) {
          const maxTaskNumber = Math.max(...createTaskEntries.map(e => e.taskNumber));
          this.currentTaskNumber = maxTaskNumber;
          console.log(`[DEBUG] Loaded task counter: ${this.currentTaskNumber} from ${this.logFile}`);
        }
      } catch (e) {
        // If log file is corrupted, start fresh
        console.log(`[DEBUG] Log file error, starting fresh: ${e.message}`);
        this.currentTaskNumber = 0;
      }
    } else {
      console.log(`[DEBUG] No log file exists at ${this.logFile}, starting at 0`);
    }
  }

  exists() {
    return existsSync(this.projectPath) && existsSync(this.planBuildTestDir);
  }

  // Get all requirements from logs
  getAllRequirements() {
    if (!existsSync(this.logFile)) return [];
    
    try {
      const log = JSON.parse(readFileSync(this.logFile, 'utf8'));
      const requirements = new Set();
      
      // Find all unique requirements from CREATE_TASK entries
      log.forEach(entry => {
        if (entry.action === 'CREATE_TASK' && entry.requirement) {
          requirements.add(entry.requirement);
        }
      });
      
      return Array.from(requirements);
    } catch (e) {
      return [];
    }
  }
  
  // Get tasks for a specific requirement from logs
  getRequirementTasks(requirement) {
    if (!existsSync(this.logFile)) return [];
    
    try {
      const log = JSON.parse(readFileSync(this.logFile, 'utf8'));
      const tasks = [];
      const taskMap = new Map();
      
      // Build task list from logs
      log.forEach(entry => {
        if (entry.action === 'CREATE_TASK' && entry.requirement === requirement) {
          taskMap.set(entry.taskNumber, {
            taskNumber: entry.taskNumber,
            description: entry.description,
            test: entry.testCommand || 'verify manually',
            status: 'pending',
            requirement: requirement
          });
        } else if (entry.action === 'COMPLETE_TASK' && taskMap.has(entry.taskNumber)) {
          taskMap.get(entry.taskNumber).status = 'completed';
        }
      });
      
      return Array.from(taskMap.values()).sort((a, b) => a.taskNumber - b.taskNumber);
    } catch (e) {
      return [];
    }
  }

  getNextTaskNumber() {
    this.currentTaskNumber++;
    return this.currentTaskNumber;
  }

  getCurrentTaskNumber() {
    return this.currentTaskNumber;
  }
  
  // Sync task counter with the highest task number in logs
  syncTaskCounter() {
    const log = readJsonFile(this.logFile);
    if (log) {
      const createTaskEntries = log.filter(e => e.action === 'CREATE_TASK' && e.taskNumber);
      if (createTaskEntries.length > 0) {
        const maxTaskNumber = Math.max(...createTaskEntries.map(e => e.taskNumber));
        this.currentTaskNumber = maxTaskNumber;
      } else {
        this.currentTaskNumber = 0;
      }
    } else {
      this.currentTaskNumber = 0;
    }
  }

  appendLog(entry) {
    let log = readJsonFile(this.logFile) || [];
    
    log.push({
      timestamp: new Date().toISOString(),
      taskNumber: this.currentTaskNumber || null,
      ...entry
    });
    
    writeJsonFile(this.logFile, log);
  }

  getLog() {
    return readJsonFile(this.logFile) || [];
  }

  getLogSummary() {
    const log = this.getLog();
    return log.map(entry => 
      `[${entry.timestamp}] ${entry.action}: ${entry.details}`
    ).join('\n');
  }

  // New method to append to text log file
  appendTextLog(message, includeTimestamp = true) {
    appendTextLogUtil(this.textLogFile, message, includeTimestamp);
  }

  // Append to task log
  appendTaskLog(cycle, message) {
    const timestamp = new Date().toISOString();
    appendTextLogUtil(this.taskLogFile, `${cycle}: ${message}`, true);
  }
  
  // Get the last incomplete task index from logs
  getLastIncompleteTask() {
    const log = this.getLog();
    let lastFailedIndex = -1;
    
    // Find the last TASK_FAILED entry
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].action === 'TASK_FAILED') {
        lastFailedIndex = log[i].taskIndex - 1; // Convert to 0-based index
        break;
      }
    }
    
    return lastFailedIndex;
  }
  
  // Set the last incomplete task
  setLastIncompleteTask(taskIndex) {
    // This is already logged via appendLog with TASK_FAILED action
    // No additional storage needed
  }
  
  // Clear the last incomplete task
  clearLastIncompleteTask() {
    // No action needed - completion is tracked via COMPLETE_TASK logs
  }
  
  // ====== BACKLOGS MANAGEMENT METHODS ======
  
  /**
   * Get the path to the backlogs.json file
   * @returns {string} Path to backlogs file
   */
  getBacklogsFilePath() {
    return join(this.projectPath, 'backlogs.json');
  }
  
  /**
   * Read and parse the backlogs data
   * @returns {Object|null} Backlogs data or null if file doesn't exist
   */
  getBacklogsData() {
    const backlogsFile = this.getBacklogsFilePath();
    if (!existsSync(backlogsFile)) {
      return null;
    }
    try {
      return JSON.parse(readFileSync(backlogsFile, 'utf8'));
    } catch (e) {
      console.error('Error reading backlogs file:', e.message);
      return null;
    }
  }
  
  /**
   * Save backlogs data to file
   * @param {Object} data - Backlogs data to save
   */
  saveBacklogsData(data) {
    const backlogsFile = this.getBacklogsFilePath();
    writeFileSync(backlogsFile, JSON.stringify(data, null, 2));
  }
  
  /**
   * Update a specific backlog's status and optional fields
   * @param {number} backlogId - ID of the backlog to update
   * @param {string} status - New status
   * @param {Object} additionalFields - Additional fields to update
   * @returns {boolean} True if updated, false if not found
   */
  updateBacklogStatus(backlogId, status, additionalFields = {}) {
    const data = this.getBacklogsData();
    if (!data) return false;
    
    const backlog = data.backlogs.find(b => b.id === backlogId);
    if (!backlog) return false;
    
    backlog.status = status;
    Object.assign(backlog, additionalFields);
    
    this.saveBacklogsData(data);
    return true;
  }
  
  /**
   * Add a new backlog to the project
   * @param {Object} backlog - Backlog data (description, etc.)
   * @returns {Object} The created backlog with ID and metadata
   */
  addBacklog(backlog) {
    let data = this.getBacklogsData() || { backlogs: [] };
    const newBacklog = {
      id: data.backlogs.length + 1,
      status: 'pending',
      created_at: new Date().toISOString(),
      ...backlog
    };
    data.backlogs.push(newBacklog);
    this.saveBacklogsData(data);
    return newBacklog;
  }
}
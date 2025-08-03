/**
 * TaskManager class for handling task reconstruction and management
 */
export class TaskManager {
  constructor(projectState) {
    this.projectState = projectState;
  }
  
  /**
   * Reconstruct tasks from project logs
   * @param {string} requirement - Optional requirement to filter tasks
   * @returns {Array} Array of tasks with status
   */
  reconstructTasksFromLogs(requirement = null) {
    const log = this.projectState.getLog();
    const tasks = [];
    const taskNumbers = new Set();
    const completedTaskNumbers = new Set();
    
    // Find the most recent ARCHITECT_COMPLETE
    let lastArchitectIndex = -1;
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].action === 'ARCHITECT_COMPLETE') {
        lastArchitectIndex = i;
        break;
      }
    }
    
    // Collect completed task numbers
    log.forEach(entry => {
      if (entry.action === 'COMPLETE_TASK') {
        completedTaskNumbers.add(entry.taskNumber);
      }
    });
    
    // Reconstruct tasks
    if (lastArchitectIndex >= 0 && log[lastArchitectIndex].tasks) {
      // Use tasks from ARCHITECT_COMPLETE if available
      log[lastArchitectIndex].tasks.forEach(task => {
        tasks.push({
          ...task,
          status: completedTaskNumbers.has(task.taskNumber) ? 'completed' : 'pending'
        });
      });
    } else {
      // Fallback reconstruction logic from individual CREATE_TASK entries
      log.forEach((entry, index) => {
        if (index > lastArchitectIndex && 
            entry.action === 'CREATE_TASK' && 
            !taskNumbers.has(entry.taskNumber)) {
          // Filter by requirement if provided
          if (!requirement || entry.requirement === requirement) {
            tasks.push({
              taskNumber: entry.taskNumber,
              description: entry.description,
              test: entry.testCommand || 'npm test',
              status: completedTaskNumbers.has(entry.taskNumber) ? 'completed' : 'pending',
              requirement: requirement || entry.requirement
            });
            taskNumbers.add(entry.taskNumber);
          }
        }
      });
    }
    
    return tasks.sort((a, b) => a.taskNumber - b.taskNumber);
  }
  
  /**
   * Get all incomplete tasks
   * @param {Array} tasks - Array of tasks
   * @returns {Array} Array of incomplete tasks
   */
  getIncompleteTasks(tasks) {
    return tasks.filter(t => t.status !== 'completed');
  }
  
  /**
   * Get all completed tasks
   * @param {Array} tasks - Array of tasks
   * @returns {Array} Array of completed tasks
   */
  getCompletedTasks(tasks) {
    return tasks.filter(t => t.status === 'completed');
  }
  
  /**
   * Get the index of the next incomplete task
   * @param {Array} tasks - Array of tasks
   * @returns {number} Index of next incomplete task, or -1 if all complete
   */
  getNextIncompleteTaskIndex(tasks) {
    return tasks.findIndex(t => t.status !== 'completed');
  }
  
  /**
   * Check if all tasks are completed
   * @param {Array} tasks - Array of tasks
   * @returns {boolean} True if all tasks are completed
   */
  areAllTasksCompleted(tasks) {
    return tasks.length > 0 && tasks.every(t => t.status === 'completed');
  }
  
  /**
   * Get task completion statistics
   * @param {Array} tasks - Array of tasks
   * @returns {Object} Statistics object with total, completed, and pending counts
   */
  getTaskStatistics(tasks) {
    const completed = tasks.filter(t => t.status === 'completed').length;
    const pending = tasks.filter(t => t.status !== 'completed').length;
    
    return {
      total: tasks.length,
      completed,
      pending,
      percentComplete: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0
    };
  }
}
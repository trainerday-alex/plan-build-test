/**
 * Centralized logging service for consistent output formatting
 */
export class Logger {
  /**
   * Log a section header
   * @param {string} title - Section title
   * @param {string} emoji - Optional emoji prefix
   */
  static section(title, emoji = '') {
    console.log(`\n${emoji} ${title}\n`.trim());
  }
  
  /**
   * Log a task with number and description
   * @param {number} taskNumber - Task number
   * @param {number} total - Total number of tasks
   * @param {string} description - Task description
   */
  static task(taskNumber, total, description) {
    console.log(`\n📝 Task ${taskNumber} (${total}): ${description}`);
  }
  
  /**
   * Log task completion
   * @param {number} taskNumber - Completed task number
   */
  static taskComplete(taskNumber) {
    console.log(`  ✓ Task ${taskNumber} completed`);
  }
  
  /**
   * Log success message
   * @param {string} message - Success message
   * @param {boolean} indent - Whether to indent the message
   */
  static success(message, indent = false) {
    console.log(`${indent ? '  ' : ''}✅ ${message}`);
  }
  
  /**
   * Log error message
   * @param {string} message - Error message
   * @param {boolean} indent - Whether to indent the message
   */
  static error(message, indent = false) {
    console.error(`${indent ? '  ' : ''}❌ ${message}`);
  }
  
  /**
   * Log warning message
   * @param {string} message - Warning message
   * @param {boolean} indent - Whether to indent the message
   */
  static warning(message, indent = false) {
    console.log(`${indent ? '  ' : ''}⚠️  ${message}`);
  }
  
  /**
   * Log info message
   * @param {string} message - Info message
   * @param {boolean} indent - Whether to indent the message
   */
  static info(message, indent = false) {
    console.log(`${indent ? '  ' : ''}📋 ${message}`);
  }
  
  /**
   * Log file operation
   * @param {string} action - Action performed (e.g., 'Created', 'Updated')
   * @param {string} path - File path
   * @param {boolean} indent - Whether to indent the message
   */
  static file(action, path, indent = true) {
    console.log(`${indent ? '  ' : ''}✓ ${action}: ${path}`);
  }
  
  /**
   * Log command
   * @param {string} command - Command to display
   */
  static command(command) {
    console.log(`   ${command}`);
  }
  
  /**
   * Log a list of items
   * @param {string[]} items - Items to list
   * @param {boolean} numbered - Whether to number the items
   */
  static list(items, numbered = true) {
    items.forEach((item, i) => {
      if (numbered) {
        console.log(`   ${i + 1}. ${item}`);
      } else {
        console.log(`   • ${item}`);
      }
    });
  }
}
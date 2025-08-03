import { logError, logWarning } from './console-utils.js';

/**
 * Standard error messages
 */
export const ERROR_MESSAGES = {
  NO_ACTIVE_PROJECT: 'No active project. Use npm run new-project or npm run change-project first.',
  PROJECT_NOT_FOUND: (name) => `Project "${name}" not found`,
  COMMAND_USAGE: {
    CREATE_PROJECT: 'Usage: npm run new-project <name> <description>',
    CHANGE_PROJECT: 'Usage: npm run change-project <project-name>',
    BACKLOG: 'Usage: npm run backlog <backlog-description>',
    RESET_BACKLOG: 'Usage: npm run reset-backlog <id>'
  },
  CLAUDE_ERROR: 'Error calling Claude API',
  GIT_NOT_INSTALLED: 'Git may not be installed',
  NO_BACKLOGS: 'No backlogs found. Create a project first with npm run create-project',
  BACKLOG_NOT_FOUND: (id) => `Backlog #${id} not found`,
  ALL_BACKLOGS_COMPLETED: '✅ All backlogs completed!',
  UNMET_DEPENDENCIES: '⚠️  All pending backlogs have unmet dependencies'
};

/**
 * Exit with error message
 */
export function exitWithError(message, code = 1) {
  logError(message);
  process.exit(code);
}

/**
 * Handle command errors with appropriate messages
 */
export function handleCommandError(command, error) {
  if (error.code === 'ENOENT') {
    exitWithError(`Command not found: ${command}`);
  } else if (error.message.includes('timed out')) {
    exitWithError(`Command timed out: ${command}`);
  } else {
    exitWithError(`Command failed: ${error.message}`);
  }
}

/**
 * Handle Claude API errors
 */
export function handleClaudeError(error, role) {
  logError(`${role} error: ${error.message}`);
  
  if (error.code === 'ENOENT') {
    logError('Command not found - is Claude CLI installed?');
  } else if (error.message.includes('timed out')) {
    logError('Request timed out');
  } else if (error.stderr) {
    logError(`Error output: ${error.stderr}`);
  }
  
  throw error;
}

/**
 * Validate required arguments
 */
export function validateArgs(args, minRequired, usageMessage) {
  if (args.length < minRequired) {
    exitWithError(usageMessage);
  }
}

/**
 * Safe JSON parse with error handling
 */
export function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return fallback;
  }
}

/**
 * Wrap async functions with error handling
 */
export function wrapAsync(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(`Error: ${error.message}`);
      if (error.stack && process.env.DEBUG) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  };
}

/**
 * Create a retry wrapper for functions
 */
export function withRetry(fn, maxRetries = 3, delay = 1000) {
  return async (...args) => {
    let lastError;
    
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;
        
        if (i < maxRetries) {
          logWarning(`Attempt ${i + 1} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  };
}

/**
 * Format error for logging
 */
export function formatError(error) {
  if (error.code) {
    return `${error.message} (code: ${error.code})`;
  }
  return error.message || String(error);
}
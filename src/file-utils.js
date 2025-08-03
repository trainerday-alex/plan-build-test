import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync, rmSync, cpSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { PROJECTS_DIR, PLAN_BUILD_TEST_DIR, LOGS_FILENAME, TEXT_LOG_FILENAME, TASK_LOG_FILENAME, BACKLOGS_FILENAME, TEMP_DIR, TEMP_FILE_PREFIX, TEMP_FILE_AGE_LIMIT } from './config.js';

/**
 * Get the full path to a project directory
 */
export function getProjectPath(projectName) {
  return join(PROJECTS_DIR, projectName);
}

/**
 * Get the plan-build-test directory for a project
 */
export function getPlanBuildTestPath(projectPath) {
  return join(projectPath, PLAN_BUILD_TEST_DIR);
}

/**
 * Create directory if it doesn't exist (including parent directories)
 */
export function ensureDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Create directory by path (not file path)
 */
export function ensureDirExists(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Read JSON file safely with error handling
 */
export function readJsonFile(filePath) {
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading JSON file ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Write JSON file with pretty formatting
 */
export function writeJsonFile(filePath, data) {
  ensureDir(filePath);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * Read project file (handles common project file paths)
 */
export function readProjectFile(projectPath, filename) {
  const filePath = join(projectPath, filename);
  return readJsonFile(filePath);
}

/**
 * Write project file (handles common project file paths)
 */
export function writeProjectFile(projectPath, filename, data) {
  const filePath = join(projectPath, filename);
  writeJsonFile(filePath, data);
}

/**
 * Read backlogs file for a project
 */
export function readBacklogs(projectPath) {
  return readProjectFile(projectPath, BACKLOGS_FILENAME) || { backlogs: [] };
}

/**
 * Write backlogs file for a project
 */
export function writeBacklogs(projectPath, backlogsData) {
  writeProjectFile(projectPath, BACKLOGS_FILENAME, backlogsData);
}

/**
 * Get all project files recursively (excluding certain directories)
 */
export function getAllProjectFiles(projectPath, excludeDirs = ['node_modules', '.git', 'plan-build-test']) {
  const files = [];
  
  function scanDir(dir, prefix = '') {
    if (!existsSync(dir)) return;
    
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !excludeDirs.includes(entry.name)) {
        scanDir(join(dir, entry.name), join(prefix, entry.name));
      } else if (entry.isFile() && !entry.name.startsWith('.')) {
        files.push(join(prefix, entry.name));
      }
    }
  }
  
  scanDir(projectPath);
  return files;
}

/**
 * Get all project files with their contents
 */
export function getAllProjectFilesWithContent(projectPath) {
  const files = getAllProjectFiles(projectPath);
  const filesWithContent = [];
  
  for (const file of files) {
    try {
      const fullPath = join(projectPath, file);
      const content = readFileSync(fullPath, 'utf8');
      filesWithContent.push(`\n=== File: ${file} ===\n${content}`);
    } catch (err) {
      // Skip files that can't be read
    }
  }
  
  return filesWithContent;
}

/**
 * Copy directory recursively
 */
export function copyDirectory(source, destination) {
  if (existsSync(source)) {
    cpSync(source, destination, { recursive: true });
  }
}

/**
 * Delete directory recursively
 */
export function deleteDirectory(dirPath) {
  if (existsSync(dirPath)) {
    rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Clean up old temp files
 */
export function cleanupTempFiles() {
  if (!existsSync(TEMP_DIR)) return;
  
  try {
    const files = readdirSync(TEMP_DIR);
    let cleaned = 0;
    const ageLimit = Date.now() - TEMP_FILE_AGE_LIMIT;
    
    files.forEach(file => {
      if (file.startsWith(TEMP_FILE_PREFIX) && file.endsWith('.txt')) {
        const filePath = join(TEMP_DIR, file);
        const stats = statSync(filePath);
        if (stats.mtimeMs < ageLimit) {
          unlinkSync(filePath);
          cleaned++;
        }
      }
    });
    
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} temporary files`);
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}

/**
 * Append to text log file
 */
export function appendTextLog(filePath, message, includeTimestamp = true) {
  ensureDir(filePath);
  const timestamp = new Date().toISOString();
  const logEntry = includeTimestamp ? `[${timestamp}] ${message}\n` : `${message}\n`;
  
  if (existsSync(filePath)) {
    appendFileSync(filePath, logEntry);
  } else {
    writeFileSync(filePath, logEntry);
  }
}
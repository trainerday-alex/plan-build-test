import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Project paths
export const ROOT_DIR = join(__dirname, '..');
export const PROJECTS_DIR = process.env.PROJECTS_DIR || join(ROOT_DIR, 'projects');
export const TEMPLATES_DIR = join(ROOT_DIR, 'templates');
export const AGENTS_DIR = join(ROOT_DIR, 'agents');
export const CURRENT_PROJECT_FILE = join(ROOT_DIR, '.current-project');

// Plan-build-test specific paths
export const PLAN_BUILD_TEST_DIR = 'plan-build-test';
export const LOGS_FILENAME = 'logs.json';
export const TEXT_LOG_FILENAME = 'log.txt';
export const TASK_LOG_FILENAME = 'task-log.txt';
export const BACKLOGS_FILENAME = 'backlogs.json';

// Timeouts
export const CLAUDE_TIMEOUT = 120000; // 120 seconds
export const NPM_INSTALL_TIMEOUT = 120000; // 120 seconds
export const TEST_TIMEOUT = 120000; // 120 seconds

// Claude retry configuration
export const CLAUDE_MAX_RETRIES = 2;
export const CLAUDE_RETRY_DELAY = 5000; // 5 seconds

// Temp file settings
export const TEMP_DIR = join(ROOT_DIR, '.tmp');
export const TEMP_FILE_PREFIX = '.claude-prompt-';
export const TEMP_FILE_AGE_LIMIT = 60 * 60 * 1000; // 1 hour

// Server configuration
export const DEFAULT_PORT = 3000;
export const SERVER_BASE_URL = `http://localhost:${DEFAULT_PORT}`;

// Git configuration
export const GIT_IGNORE_CONTENT = `node_modules/
dist/
*.log
.DS_Store
.env
plan-build-test/logs.json
plan-build-test/log.txt
plan-build-test/task-log.txt
`;

// Express app template configuration
export const EXPRESS_TEMPLATE_NAME = 'express-app';

// Test configuration
export const PLAYWRIGHT_VERSION = '^1.40.0';
export const EXPRESS_VERSION = '^4.18.2';
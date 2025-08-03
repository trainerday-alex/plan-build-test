/**
 * Console output utilities for consistent formatting
 */

// Console colors (ANSI escape codes)
const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

/**
 * Log with emoji prefix
 */
export function log(emoji, message) {
  console.log(`${emoji} ${message}`);
}

/**
 * Log success message
 */
export function logSuccess(message) {
  console.log(`✅ ${message}`);
}

/**
 * Log error message
 */
export function logError(message) {
  console.log(`❌ ${message}`);
}

/**
 * Log warning message
 */
export function logWarning(message) {
  console.log(`⚠️  ${message}`);
}

/**
 * Log info message
 */
export function logInfo(message) {
  console.log(`ℹ️  ${message}`);
}

/**
 * Log task/step message
 */
export function logStep(message) {
  console.log(`📝 ${message}`);
}

/**
 * Log section header
 */
export function logSection(title) {
  console.log(`\n${title}`);
  console.log('═'.repeat(title.length));
}

/**
 * Log subsection
 */
export function logSubsection(title) {
  console.log(`\n${title}`);
  console.log('─'.repeat(title.length));
}

/**
 * Log list item
 */
export function logListItem(message, indent = 1) {
  const prefix = '  '.repeat(indent);
  console.log(`${prefix}• ${message}`);
}

/**
 * Log numbered list item
 */
export function logNumberedItem(number, message, indent = 1) {
  const prefix = '  '.repeat(indent);
  console.log(`${prefix}${number}. ${message}`);
}

/**
 * Log checkbox item
 */
export function logCheckbox(checked, message, indent = 0) {
  const checkbox = checked ? '✅' : '⬜';
  const prefix = '  '.repeat(indent);
  console.log(`${prefix}${checkbox} ${message}`);
}

/**
 * Log progress
 */
export function logProgress(current, total, message) {
  console.log(`📊 Progress: ${current}/${total} - ${message}`);
}

/**
 * Log divider
 */
export function logDivider() {
  console.log('─'.repeat(80));
}

/**
 * Log thick divider
 */
export function logThickDivider() {
  console.log('═'.repeat(80));
}

/**
 * Common emoji constants for consistency
 */
export const EMOJI = {
  // Status
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  
  // Actions
  rocket: '🚀',
  gear: '🔧',
  wrench: '🔧',
  hammer: '🔨',
  recycle: '♻️',
  
  // Documents
  clipboard: '📋',
  file: '📄',
  folder: '📁',
  memo: '📝',
  
  // Analysis
  chart: '📊',
  magnifier: '🔍',
  microscope: '🔬',
  
  // Testing
  testTube: '🧪',
  checkMark: '✓',
  
  // Development
  computer: '💻',
  package: '📦',
  globe: '🌐',
  
  // UI
  sparkles: '✨',
  party: '🎉',
  stop: '🛑',
  play: '▶️',
  loading: '🔄',
  
  // Architecture
  building: '🏗️',
  bricks: '🧱',
  
  // Cleaning
  broom: '🧹',
  trash: '🗑️',
  
  // Links
  link: '🔗',
  chain: '⛓️'
};

/**
 * Format file path for display
 */
export function formatPath(path) {
  return path.replace(/\\/g, '/');
}

/**
 * Format timestamp
 */
export function formatTimestamp(date = new Date()) {
  return date.toISOString();
}

/**
 * Format duration (milliseconds to human readable)
 */
export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}
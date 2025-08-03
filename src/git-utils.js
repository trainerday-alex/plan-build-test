import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { GIT_IGNORE_CONTENT } from './config.js';

const execAsync = promisify(exec);

/**
 * Check if git is initialized in a directory
 */
export async function isGitInitialized(projectPath) {
  try {
    await execAsync('git status', { cwd: projectPath });
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize git repository
 */
export async function initializeGit(projectPath) {
  try {
    console.log('🔧 Initializing git repository...');
    
    // Check if git already initialized
    if (await isGitInitialized(projectPath)) {
      console.log('  ✓ Git already initialized');
      return true;
    }
    
    // Initialize git
    await execAsync('git init', { cwd: projectPath });
    console.log('  ✓ Initialized git repository');
    
    // Check if .gitignore exists, if not create it
    const gitignorePath = join(projectPath, '.gitignore');
    if (!existsSync(gitignorePath)) {
      writeFileSync(gitignorePath, GIT_IGNORE_CONTENT);
      console.log('  ✓ Created .gitignore');
    } else {
      console.log('  ✓ Using existing .gitignore');
    }
    
    // Initial commit
    await execAsync('git add -A', { cwd: projectPath });
    await execAsync('git commit -m "Initial commit"', { cwd: projectPath });
    console.log('  ✓ Created initial commit\n');
    
    return true;
  } catch (error) {
    console.log('  ⚠️  Git init failed (git may not be installed)\n');
    return false;
  }
}

/**
 * Auto commit changes with a message
 */
export async function autoCommit(projectPath, message) {
  try {
    // Check if git is initialized
    if (!await isGitInitialized(projectPath)) {
      console.log('  ⚠️  Git not initialized, skipping commit');
      return false;
    }
    
    // Add all changes
    await execAsync('git add -A', { cwd: projectPath });
    
    // Check if there are changes to commit
    const { stdout } = await execAsync('git status --porcelain', { cwd: projectPath });
    if (stdout.trim()) {
      // Commit changes
      await execAsync(`git commit -m "${message}"`, { cwd: projectPath });
      console.log(`  ✓ Committed: ${message}`);
      return true;
    } else {
      console.log('  ✓ No changes to commit');
      return false;
    }
  } catch (error) {
    console.log('  ⚠️  Git commit failed:', error.message);
    return false;
  }
}

/**
 * Get current git branch
 */
export async function getCurrentBranch(projectPath) {
  try {
    if (!await isGitInitialized(projectPath)) {
      return null;
    }
    const { stdout } = await execAsync('git branch --show-current', { cwd: projectPath });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get git status
 */
export async function getGitStatus(projectPath) {
  try {
    if (!await isGitInitialized(projectPath)) {
      return null;
    }
    const { stdout } = await execAsync('git status --porcelain', { cwd: projectPath });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get recent commits
 */
export async function getRecentCommits(projectPath, count = 10) {
  try {
    if (!await isGitInitialized(projectPath)) {
      return [];
    }
    const { stdout } = await execAsync(`git log --oneline -n ${count}`, { cwd: projectPath });
    return stdout.trim().split('\n').filter(line => line.length > 0);
  } catch {
    return [];
  }
}
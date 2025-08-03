import { spawn } from 'child_process';
import { writeFileSync, existsSync, readFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { TEMP_DIR, TEMP_FILE_PREFIX, CLAUDE_TIMEOUT, CLAUDE_MAX_RETRIES, CLAUDE_RETRY_DELAY } from './config.js';
import { ensureDirExists } from './file-utils.js';
import { logInfo, logError, logWarning } from './console-utils.js';

/**
 * Call Claude CLI with a prompt
 */
export async function callClaude(prompt, role, projectState = null, retryCount = 0) {
  console.log(`  → Calling ${role}...${retryCount > 0 ? ` (retry ${retryCount}/${CLAUDE_MAX_RETRIES})` : ''}`);
  
  if (projectState) {
    projectState.appendTextLog(`Calling ${role}...${retryCount > 0 ? ` (retry ${retryCount})` : ''}`);
    projectState.appendTextLog(`Prompt: ${prompt.substring(0, 500)}...`, false);
  }
  
  // Ensure .tmp directory exists
  ensureDirExists(TEMP_DIR);
  
  // Clean up old temp files (older than 1 hour)
  cleanupOldTempFiles();
  
  const tmpFile = join(TEMP_DIR, `${TEMP_FILE_PREFIX}${Date.now()}.txt`);
  
  try {
    writeFileSync(tmpFile, prompt);
    
    // Check if file was written successfully
    if (!existsSync(tmpFile)) {
      throw new Error('Failed to write prompt file');
    }
    
    // Check file size
    const fileStats = statSync(tmpFile);
    console.log(`  → Prompt file size: ${(fileStats.size / 1024).toFixed(2)} KB`);
    
    // Read the file content first
    const promptContent = readFileSync(tmpFile, 'utf8');
    
    // Run claude with the content using spawn for better control
    const result = await runClaudeProcess(promptContent);
    
    // Check for empty response
    if (!result.stdout || result.stdout.trim().length === 0) {
      logError('Empty response from Claude');
      throw new Error('Empty response from Claude CLI');
    }
    
    // Clean up temp file
    try { 
      unlinkSync(tmpFile); 
    } catch {}
    
    console.log(`  ← ${role} completed`);
    if (projectState) {
      projectState.appendTextLog(`${role} completed successfully`);
      projectState.appendTextLog(`Response length: ${result.stdout.length} characters`, false);
    }
    
    return result.stdout.trim();
    
  } catch (error) {
    logError(`${role} error: ${error.message}`);
    
    // More detailed error logging
    if (error.code === 'ENOENT') {
      logError('Command not found - is Claude CLI installed?');
    } else if (error.message.includes('timed out')) {
      logError(`Request timed out after ${CLAUDE_TIMEOUT / 1000} seconds`);
    } else if (error.stderr) {
      logError(`Error output: ${error.stderr}`);
    }
    
    if (error.stdout) {
      logInfo(`Partial output received: ${error.stdout.substring(0, 200)}...`);
    }
    
    if (projectState) {
      projectState.appendTextLog(`ERROR: ${role} failed - ${error.message}`);
      projectState.appendTextLog(`Error code: ${error.code || 'unknown'}`, false);
      projectState.appendTextLog(`Failed prompt saved to: ${tmpFile}`, false);
    }
    
    // Save failed prompt for debugging
    logError(`Failed prompt saved to: ${tmpFile}`);
    logInfo(`To retry manually: cat "${tmpFile}" | claude -p`);
    
    // Show a preview of the prompt for debugging
    try {
      const promptPreview = promptContent.substring(0, 300).replace(/\n/g, '\n     ');
      logInfo('Prompt preview (first 300 chars):');
      console.error(`     ${promptPreview}...`);
    } catch (readError) {
      logError('Could not show prompt preview');
    }
    
    // Retry on certain errors
    if (retryCount < CLAUDE_MAX_RETRIES && 
        (error.message.includes('timed out') || 
         error.message.includes('ECONNRESET') ||
         error.message.includes('Empty response'))) {
      logWarning(`Retrying in ${CLAUDE_RETRY_DELAY / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, CLAUDE_RETRY_DELAY));
      return callClaude(prompt, role, projectState, retryCount + 1);
    }
    
    throw error;
  }
}

/**
 * Run Claude process with better control
 */
async function runClaudeProcess(promptContent) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    
    const claudeProcess = spawn('claude', ['-p'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    // Set timeout
    const timeout = setTimeout(() => {
      timedOut = true;
      claudeProcess.kill('SIGTERM');
    }, CLAUDE_TIMEOUT);
    
    // Send the prompt content to stdin
    claudeProcess.stdin.write(promptContent);
    claudeProcess.stdin.end();
    
    // Collect output
    claudeProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    claudeProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    // Wait for process to complete
    claudeProcess.on('close', (code) => {
      clearTimeout(timeout);
      
      if (timedOut) {
        reject(new Error(`Claude process timed out after ${CLAUDE_TIMEOUT / 1000} seconds`));
      } else if (code !== 0) {
        const error = new Error(`Claude process exited with code ${code}`);
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
    
    claudeProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Clean up old temporary files
 */
function cleanupOldTempFiles() {
  try {
    const files = readdirSync(TEMP_DIR);
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    files.forEach(file => {
      if (file.startsWith(TEMP_FILE_PREFIX) && file.endsWith('.txt')) {
        const filePath = join(TEMP_DIR, file);
        const stats = statSync(filePath);
        if (stats.mtimeMs < oneHourAgo) {
          unlinkSync(filePath);
        }
      }
    });
  } catch (e) {
    // Ignore cleanup errors
  }
}
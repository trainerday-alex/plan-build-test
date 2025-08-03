import { logWarning } from './console-utils.js';

/**
 * Parse JSON response from agent with fallback to text parsing
 */
export function parseAgentResponse(response, agentType) {
  // Try to extract JSON from markdown code block
  const jsonMatch = response.match(/```json\s*\n([\s\S]*?)\n\s*```/);
  if (jsonMatch) {
    try {
      const json = JSON.parse(jsonMatch[1]);
      if (json.status === 'FAILURE') {
        throw new Error(json.error || 'Agent returned failure status');
      }
      return json;
    } catch (e) {
      logWarning(`Failed to parse JSON from ${agentType}: ${e.message}`);
    }
  }
  
  // Try direct JSON parse
  try {
    const json = JSON.parse(response);
    if (json.status === 'FAILURE') {
      throw new Error(json.error || 'Agent returned failure status');
    }
    return json;
  } catch (e) {
    // Fall back to text parsing
    logWarning(`${agentType} response is not valid JSON, using text parsing`);
    return null;
  }
}

/**
 * Extract tasks from architect response
 */
export function parseTasks(architectResponse) {
  // Try JSON parsing first
  const json = parseAgentResponse(architectResponse, 'Architect');
  if (json && json.tasks) {
    return json.tasks.map(task => ({
      description: task.description,
      test: task.test_command || 'verify manually'
    }));
  }
  
  // Fallback to text parsing
  const tasks = [];
  const lines = architectResponse.split('\n');
  let inTaskSection = false;
  
  for (const line of lines) {
    if (line.includes('TASK LIST') || line.includes('REFACTORING TASKS')) {
      inTaskSection = true;
      continue;
    }
    
    if (inTaskSection && line.match(/^\d+\./)) {
      const match = line.match(/^\d+\.\s*(.+?)(?:\s*\(test:\s*(.+?)\))?$/);
      if (match) {
        tasks.push({
          description: match[1].trim(),
          test: match[2] ? match[2].trim() : 'verify manually'
        });
      }
    }
    
    // Stop at next section
    if (inTaskSection && line.match(/^[A-Z\s]+:/) && !line.includes('TASK')) {
      break;
    }
  }
  
  return tasks;
}

/**
 * Extract file content from coder responses
 */
export function parseFileContent(response) {
  // Try JSON parsing first
  const json = parseAgentResponse(response, 'Coder');
  if (json && json.files) {
    return json.files.map(file => ({
      path: file.path,
      content: file.content
    }));
  }
  
  // Fallback to text parsing
  const files = [];
  const lines = response.split('\n');
  let currentFile = null;
  let inCodeBlock = false;
  let codeContent = [];
  let codeLanguage = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for file path patterns
    if (!inCodeBlock) {
      // Pattern 1: **filename.ext**
      const boldMatch = line.match(/^\*\*([\w\-\/]+\.(js|json|md|html|css|jsx|ts|tsx))\*\*/);
      // Pattern 2: # filename.ext or ## filename.ext
      const headerMatch = line.match(/^#+\s*([\w\-\/]+\.(js|json|md|html|css|jsx|ts|tsx))/);
      // Pattern 3: Plain path
      const plainMatch = line.match(/^((?:src\/|test\/|tests\/|lib\/|\.\/)?[\w\-\/]+\.(js|json|md|html|css|jsx|ts|tsx))$/);
      
      if (boldMatch || headerMatch || plainMatch) {
        // Save previous file if exists
        if (currentFile && codeContent.length > 0) {
          files.push({ path: currentFile, content: codeContent.join('\n') });
        }
        
        // Extract filename
        if (boldMatch) {
          currentFile = boldMatch[1];
        } else if (headerMatch) {
          currentFile = headerMatch[1];
        } else if (plainMatch) {
          currentFile = plainMatch[1];
        }
        
        codeContent = [];
        continue;
      }
    }
    
    // Track code blocks
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        // Starting code block
        inCodeBlock = true;
        codeLanguage = line.substring(3).trim();
      } else {
        // Ending code block
        inCodeBlock = false;
        if (currentFile && codeContent.length > 0) {
          files.push({ path: currentFile, content: codeContent.join('\n') });
          currentFile = null;
          codeContent = [];
        }
      }
    } else if (inCodeBlock && currentFile) {
      codeContent.push(line);
    }
  }
  
  // Handle last file if not closed properly
  if (currentFile && codeContent.length > 0) {
    files.push({ path: currentFile, content: codeContent.join('\n') });
  }
  
  return files;
}

/**
 * Parse test fix response
 */
export function parseTestFixResponse(response) {
  const json = parseAgentResponse(response, 'Tester');
  
  if (json && json.fixed_tests) {
    return {
      fixedTests: json.fixed_tests,
      changesMade: json.changes_made || []
    };
  }
  
  // Fallback parsing not implemented for test fixes
  return null;
}

/**
 * Parse backlogs from architect response
 */
export function parseBacklogs(response) {
  const json = parseAgentResponse(response, 'Architect');
  
  if (!json || json.status === 'FAILURE') {
    throw new Error(json?.error || 'Architect failed to create backlogs');
  }
  
  return {
    projectSummary: json.project_summary,
    runtimeRequirements: json.runtime_requirements,
    technicalConsiderations: json.technical_considerations,
    backlogs: json.backlogs || []
  };
}

/**
 * Parse project review response
 */
export function parseProjectReview(response) {
  const json = parseAgentResponse(response, 'Project Reviewer');
  
  if (json && json.recommendation) {
    return {
      state: json.project_state,
      recommendation: json.recommendation
    };
  }
  
  // Fallback to raw text
  return {
    state: { current_status: 'unknown' },
    recommendation: { 
      next_action: 'continue',
      description: response 
    }
  };
}

/**
 * Parse refactor analysis response
 */
export function parseRefactorAnalysis(response) {
  const json = parseAgentResponse(response, 'Refactor Analyst');
  
  if (json && json.refactor_tasks) {
    return {
      assessment: json.assessment || { strengths: [], weaknesses: [] },
      tasks: json.refactor_tasks.map(task => ({
        description: task.description,
        test: task.test_command || 'npm test',
        isRefactor: true
      }))
    };
  }
  
  // Fallback to task parsing
  return {
    assessment: { strengths: [], weaknesses: [] },
    tasks: parseTasks(response).map(task => ({ ...task, isRefactor: true }))
  };
}
# Orchestrator Refactoring Plan - Phase 2

## Overview
After the initial refactoring that split orchestrator.js into modular components, this document outlines Phase 2 refactoring to address remaining code duplication and architectural improvements.

## Current State Analysis

### File Sizes
- `src/orchestrator-execution.js` - 1275 lines (TOO LARGE)
- `orchestrator.js` - 133 lines (good)
- `src/project-state.js` - 184 lines (good)

### Key Issues Identified
1. **Massive code duplication** in backlogs handling
2. **Repeated NPM command patterns** (install, test, kill process)
3. **147 console.log statements** with inconsistent formatting
4. **Duplicated task reconstruction logic** in multiple functions
5. **Similar error handling patterns** repeated everywhere
6. **Monolithic orchestrator-execution.js** needs splitting

## Detailed Refactoring Plan

### 1. Backlogs Management Centralization (HIGH PRIORITY)

**Problem**: The pattern `const backlogsFile = join(projectState.projectPath, 'backlogs.json')` appears in 6 different functions with similar read/write logic.

**Files Affected**:
- `executeAddBacklog` (line 495)
- `executeListBacklogs` (line 535)
- `executeResetBacklog` (line 587)
- `executeProcessBacklog` (line 620)
- `executeFix` (line 114)
- `runArchitectBacklogs` (line 841)

**Solution**: Extend ProjectState class with backlogs management

```javascript
// src/project-state.js additions
class ProjectState {
  // ... existing code ...
  
  getBacklogsFilePath() {
    return join(this.projectPath, 'backlogs.json');
  }
  
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
  
  saveBacklogsData(data) {
    const backlogsFile = this.getBacklogsFilePath();
    writeFileSync(backlogsFile, JSON.stringify(data, null, 2));
  }
  
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
```

### 2. NPM Commands Module (HIGH PRIORITY)

**Problem**: NPM install/test commands are duplicated with similar error handling

**Duplication Locations**:
- `executeFixTests` lines 233-237 (npm install)
- `runTests` lines 1183-1192 (npm install)
- `executeFixTests` lines 248-253 (npm test)
- `runTests` lines 1207-1212 (npm test)
- Kill process pattern at lines 449 and 1199

**Solution**: Create dedicated NPM utilities module

```javascript
// src/npm-utils.js
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export async function npmInstall(projectPath, options = {}) {
  const { 
    timeout = 120000, 
    silent = false 
  } = options;
  
  if (!silent) console.log('📦 Installing dependencies...');
  
  try {
    await execAsync('npm install', { 
      cwd: projectPath,
      timeout 
    });
    if (!silent) console.log('  ✓ Dependencies installed');
    return { success: true };
  } catch (error) {
    const message = `Failed to install dependencies: ${error.message}`;
    if (!silent) console.error(`  ❌ ${message}`);
    throw new Error(message);
  }
}

export async function npmTest(projectPath, options = {}) {
  const { 
    timeout = 120000,
    env = { ...process.env, CI: 'true' }
  } = options;
  
  return await execAsync('npm test', {
    cwd: projectPath,
    env,
    timeout
  });
}

export async function killProcessOnPort(port, projectPath = null) {
  try {
    await execAsync(`lsof -ti:${port} | xargs kill -9`, 
      projectPath ? { cwd: projectPath } : {}
    );
    await new Promise(resolve => setTimeout(resolve, 1000));
    return true;
  } catch {
    // No process running on port
    return false;
  }
}

export async function npmStart(projectPath, detached = false) {
  return exec('npm start', {
    cwd: projectPath,
    detached
  });
}
```

### 3. Logging Service (MEDIUM PRIORITY)

**Problem**: 147 console.log statements with inconsistent formatting

**Solution**: Create centralized logging service

```javascript
// src/logger.js
export class Logger {
  static section(title, emoji = '') {
    console.log(`\n${emoji} ${title}\n`.trim());
  }
  
  static task(taskNumber, total, description) {
    console.log(`\n📝 Task ${taskNumber} (${total}): ${description}`);
  }
  
  static taskComplete(taskNumber) {
    console.log(`  ✓ Task ${taskNumber} completed`);
  }
  
  static success(message, indent = false) {
    console.log(`${indent ? '  ' : ''}✅ ${message}`);
  }
  
  static error(message, indent = false) {
    console.error(`${indent ? '  ' : ''}❌ ${message}`);
  }
  
  static warning(message, indent = false) {
    console.log(`${indent ? '  ' : ''}⚠️  ${message}`);
  }
  
  static info(message, indent = false) {
    console.log(`${indent ? '  ' : ''}📋 ${message}`);
  }
  
  static file(action, path, indent = true) {
    console.log(`${indent ? '  ' : ''}✓ ${action}: ${path}`);
  }
  
  static command(command) {
    console.log(`   ${command}`);
  }
  
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
```

### 4. Task Management Extraction (HIGH PRIORITY)

**Problem**: Complex task reconstruction logic duplicated in executeFix and executeProcessBacklog

**Duplication**:
- `executeFix` lines 116-187 
- `executeProcessBacklog` lines 702-714

**Solution**: Create TaskManager class

```javascript
// src/task-manager.js
export class TaskManager {
  constructor(projectState) {
    this.projectState = projectState;
  }
  
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
      log[lastArchitectIndex].tasks.forEach(task => {
        tasks.push({
          ...task,
          status: completedTaskNumbers.has(task.taskNumber) ? 'completed' : 'pending'
        });
      });
    } else {
      // Fallback reconstruction logic
      log.forEach((entry, index) => {
        if (index > lastArchitectIndex && 
            entry.action === 'CREATE_TASK' && 
            !taskNumbers.has(entry.taskNumber)) {
          tasks.push({
            taskNumber: entry.taskNumber,
            description: entry.description,
            test: entry.testCommand || 'npm test',
            status: completedTaskNumbers.has(entry.taskNumber) ? 'completed' : 'pending',
            requirement: requirement || entry.requirement
          });
          taskNumbers.add(entry.taskNumber);
        }
      });
    }
    
    return tasks.sort((a, b) => a.taskNumber - b.taskNumber);
  }
  
  getIncompleteTasks(tasks) {
    return tasks.filter(t => t.status !== 'completed');
  }
  
  getCompletedTasks(tasks) {
    return tasks.filter(t => t.status === 'completed');
  }
  
  getNextIncompleteTaskIndex(tasks) {
    return tasks.findIndex(t => t.status !== 'completed');
  }
}
```

### 5. Command Pattern Implementation (MEDIUM PRIORITY)

**Problem**: All execute* functions follow similar patterns but with duplicated setup/teardown

**Solution**: Create command base class

```javascript
// src/commands/base-command.js
export class BaseCommand {
  constructor(projectState, requirement, state) {
    this.projectState = projectState;
    this.requirement = requirement;
    this.state = state;
  }
  
  async execute() {
    const startMessage = this.getStartMessage();
    if (startMessage) {
      Logger.section(startMessage.text, startMessage.emoji);
    }
    
    this.projectState.appendTextLog(`\n${this.getName()}: ${this.requirement}`);
    
    try {
      await this.doExecute();
    } catch (error) {
      this.projectState.appendTextLog(`ERROR in ${this.getName()}: ${error.message}`);
      throw error;
    }
  }
  
  // Abstract methods to be implemented by subclasses
  getName() { throw new Error('getName must be implemented'); }
  getStartMessage() { return null; }
  async doExecute() { throw new Error('doExecute must be implemented'); }
}
```

### 6. File Structure Reorganization (HIGH PRIORITY)

**Problem**: orchestrator-execution.js is 1275 lines - too large and hard to maintain

**Solution**: Split into logical modules

```
src/
├── commands/
│   ├── base-command.js
│   ├── create-project.js    (executeCreateProject, copyTemplateFiles)
│   ├── task-commands.js     (executeAddTask)
│   ├── backlog-commands.js  (executeAddBacklog, executeListBacklogs, etc.)
│   ├── fix-commands.js      (executeFix, executeFixTests)
│   └── refactor-command.js  (executeRefactor)
├── agents/
│   ├── architect.js         (runArchitect, runArchitectBacklogs)
│   ├── coder.js            (runCoderTasks, runCoderFix)
│   ├── reviewer.js         (runProjectReviewer)
│   ├── tester.js           (runTests)
│   └── refactor-analyst.js (runRefactorAnalyst)
├── utils/
│   ├── npm-utils.js        (npm commands)
│   ├── git-utils.js        (existing)
│   ├── task-manager.js     (task reconstruction)
│   └── logger.js           (logging service)
└── orchestrator-execution.js (minimal coordinator)
```

### 7. Error Handling Standardization (LOW PRIORITY)

**Problem**: Inconsistent error handling across functions

**Solution**: Create error handling utilities

```javascript
// src/utils/error-utils.js
export async function withErrorHandling(fn, context) {
  const { errorMessage, projectState, rethrow = true } = context;
  
  try {
    return await fn();
  } catch (error) {
    const message = `${errorMessage}: ${error.message}`;
    Logger.error(message);
    
    if (projectState) {
      projectState.appendTextLog(`ERROR: ${message}`);
      projectState.appendLog({
        action: 'ERROR',
        error: error.message,
        context: errorMessage
      });
    }
    
    if (rethrow) throw error;
    return { error: true, message };
  }
}

export function wrapAsync(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      console.error(`Unhandled error in ${fn.name}:`, error);
      throw error;
    }
  };
}
```

## Implementation Strategy

### Phase 1: Core Utilities (1-2 days)
1. Create npm-utils.js
2. Create logger.js
3. Update project-state.js with backlogs methods
4. Create task-manager.js

### Phase 2: Command Extraction (2-3 days)
1. Create commands directory structure
2. Extract create-project command
3. Extract backlog commands
4. Extract fix commands
5. Extract task and refactor commands

### Phase 3: Agent Extraction (2-3 days)
1. Create agents directory structure
2. Extract architect agents
3. Extract coder agents
4. Extract tester and reviewer agents

### Phase 4: Integration & Testing (1-2 days)
1. Update orchestrator-execution.js to use new modules
2. Test all commands
3. Update imports in orchestrator.js
4. Performance testing

## Benefits

### Code Reduction
- Remove ~400-500 lines of duplicated code
- Reduce orchestrator-execution.js from 1275 to ~200 lines
- Total codebase reduction: ~30-40%

### Maintainability
- Single responsibility principle for each module
- Easier to test individual components
- Clear separation of concerns
- Consistent patterns throughout

### Extensibility
- Easy to add new commands
- Simple to add new agents
- Centralized configuration
- Plugin-friendly architecture

## Risks & Mitigations

### Risk 1: Breaking Changes
**Mitigation**: Implement changes incrementally with thorough testing after each phase

### Risk 2: Import Path Issues
**Mitigation**: Use careful refactoring tools and update all imports systematically

### Risk 3: Performance Impact
**Mitigation**: Profile before and after to ensure no performance degradation

## Success Metrics
- [ ] All tests pass after refactoring
- [ ] No duplicate code blocks > 10 lines
- [ ] No single file > 500 lines
- [ ] 90%+ code coverage maintained
- [ ] All commands work identically to before

## Next Steps
1. Review and approve this plan
2. Create feature branch `refactor-phase-2`
3. Implement Phase 1 utilities
4. Test and iterate
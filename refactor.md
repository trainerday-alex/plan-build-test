# Refactoring Plan: Breaking Up orchestrator-execution.js

## Overview
The `orchestrator-execution.js` file has grown to 1206 lines and mixes command orchestration with AI agent implementation. This refactoring will split it into focused modules with clear separation of concerns.

## Current Structure Problems
- Single file with 1206 lines is hard to navigate
- Mixes high-level orchestration with implementation details
- Related functions are scattered throughout the file
- Difficult to test individual components in isolation

## Target Structure

```
src/
├── commands/
│   ├── project-commands.js   (~200 lines)
│   ├── task-commands.js      (~250 lines)
│   ├── backlog-commands.js   (~300 lines)
│   └── test-commands.js      (~150 lines)
└── agents/
    ├── ai-agents.js          (~400 lines)
    └── test-runner.js        (~150 lines)
```

## Migration Steps

### Phase 1: Setup (Low Risk)
1. Create directory structure:
   - `mkdir -p src/commands src/agents`
2. Keep `orchestrator-execution.js` intact initially
3. Test that nothing is broken

### Phase 2: Extract Backlog Commands (Low Risk)
Extract to `src/commands/backlog-commands.js`:
- `executeAddBacklog` (line 440)
- `executeListBacklogs` (line 473)
- `executeResetBacklog` (line 523)
- `executeProcessBacklog` (line 551)

These are good to start with because:
- 3 of 4 are simple CRUD operations
- Minimal dependencies on other functions
- Clear boundaries

### Phase 3: Extract Test Commands
Extract to `src/commands/test-commands.js`:
- `executeFixTests` (line 180)
- Move helper functions it needs

### Phase 4: Extract Task Commands
Extract to `src/commands/task-commands.js`:
- `executeAddTask` (line 102)
- `executeFix` (line 115)
- `executeRefactor` (line 167)

### Phase 5: Extract Project Commands
Extract to `src/commands/project-commands.js`:
- `executeCreateProject` (line 47)
- `copyTemplateFiles` (line 70) - helper

### Phase 6: Extract AI Agents
Extract to `src/agents/ai-agents.js`:
- `runArchitect` (line 703)
- `runArchitectBacklogs` (line 759)
- `runProjectReviewer` (line 813)
- `runRefactorAnalyst` (line 852)
- `runCoderTasks` (line 907)
- `runCoderFix` (line 1024)

### Phase 7: Extract Test Runner
Extract to `src/agents/test-runner.js`:
- `runTests` (line 1068)
- `ensureTestSetupWrapper` (line 1205)

### Phase 8: Update Imports
1. Update `orchestrator.js` to import from new locations
2. Update inter-module imports
3. Keep helper functions in a minimal `orchestrator-execution.js` or distribute them

### Phase 9: Cleanup
1. Remove or rename the original `orchestrator-execution.js`
2. Update any documentation
3. Run comprehensive tests

## Implementation Details

### Import Structure
Each command module will need:
```javascript
// Common imports
import { Logger } from '../logger.js';
import { ProjectState } from '../project-state.js';

// Agent imports (for command files)
import { runArchitect, runCoderTasks } from '../agents/ai-agents.js';
import { runTests } from '../agents/test-runner.js';
```

### Export Structure
```javascript
// Example: backlog-commands.js
export {
  executeAddBacklog,
  executeListBacklogs,
  executeResetBacklog,
  executeProcessBacklog
};
```

### Testing Strategy
After each phase:
1. Run all npm commands to ensure functionality
2. Check for import/export errors
3. Verify no circular dependencies
4. Run a full project creation cycle

## Benefits
1. **Manageable file sizes**: No file over 400 lines
2. **Clear separation**: Commands orchestrate, agents execute
3. **Better testability**: Can mock agent layer when testing commands
4. **Easier navigation**: Related functions grouped together
5. **Clearer dependencies**: Unidirectional flow from commands → agents

## Risks and Mitigation
- **Risk**: Missing imports/exports
  - **Mitigation**: Test after each phase, easy to fix
- **Risk**: Circular dependencies
  - **Mitigation**: Clear layer separation prevents this
- **Risk**: Breaking existing functionality
  - **Mitigation**: Incremental approach, git commits after each phase

## Success Metrics
- All npm commands work as before
- No circular dependency warnings
- Each file under 400 lines
- Clear module boundaries
- Improved code organization
# Orchestrator Refactoring Plan

## Current State
- `orchestrator.js` - 1565 lines containing everything
- `orchestrator-commands.js` - CLI entry point that calls orchestrator.js (DO NOT TOUCH)

## Goal
Break orchestrator.js into 3 manageable files without changing functionality

## Refactoring Plan

### 1. Extract ProjectState class → `src/project-state.js`
- Move the entire ProjectState class (lines 39-214)
- Add necessary imports (fs, path, file-utils)
- Export the class

### 2. Create `src/orchestrator-execution.js` 
Move all execution logic from orchestrator.js:
- All `execute*` functions (8 total)
  - executeCreateProject
  - executeAddTask
  - executeFix
  - executeRefactor
  - executeFixTests
  - executeAddBacklog
  - executeProcessBacklog
  - executeListBacklogs
  - executeResetBacklog
- All `run*` functions (8 total)
  - runArchitect
  - runArchitectBacklogs
  - runProjectReviewer
  - runRefactorAnalyst
  - runCoderTasks
  - runCoderFix
  - runTests
- Helper functions
  - copyTemplateFiles
  - initializeGitWrapper
  - ensureTestSetupWrapper
  - callClaudeWrapper

### 3. Simplify `orchestrator.js`
Keep only:
- Import statements
- Export statements for backward compatibility
- The main `runOrchestrator` function that:
  - Creates ProjectState
  - Calls appropriate execute* functions from orchestrator-execution.js
  - Handles errors

## Important Notes
- DO NOT modify `orchestrator-commands.js` - it's the CLI entry point
- Maintain all exports for backward compatibility
- Test each command after refactoring to ensure nothing breaks

## File Structure After Refactoring
```
orchestrator.js (~200 lines)
  - Main entry point function
  - Imports from other modules
  - Delegates to execution functions

src/project-state.js (~180 lines)
  - ProjectState class
  - All state management logic

src/orchestrator-execution.js (~1200 lines)
  - All execute* functions
  - All run* functions  
  - Helper functions
  - Actual implementation logic

orchestrator-commands.js (UNCHANGED)
  - CLI entry point
  - Parses commands
  - Calls orchestrator.js
```
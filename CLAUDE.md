# CLAUDE.md

IMPORTANT: You cannot run Claude CLI commands from within Claude Code. The orchestrator commands (npm run new-project, npm run task, etc.) must be run from the terminal, not from within Claude Code.

Note: The fix-tests command requires Claude API to be configured. If you get "Execution error", ensure:
1. Claude CLI is installed and configured with API key
2. Run the command from terminal, not from within Claude Code

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Run Tests
```bash
npm test
```

### Project Management Commands
```bash
npm run create-project <name> <description>  # Create a new project with backlogs
npm run backlog <description>             # Add new backlog item to current project
npm run process-backlog [id]              # Process next backlog (or specific id)
npm run list-backlogs                     # List all backlogs for current project
npm run task <description>                # Legacy: Add new feature directly (use backlogs instead)
npm run fix                               # Fix failing tests in current project
npm run fix-tests                         # Read logs and fix tests to match implementation
npm run refactor                          # Improve code quality in current project
npm run change-project <name>             # Switch to existing project
npm run status                            # Show current project status
```

## Architecture

This is an AI orchestrator that builds working software through a three-step cycle: Plan/Review → Build → Test.

### Core Components

1. **orchestrator.js** - Main orchestration engine that manages the three-part flow
   - Handles project state management and logging
   - Coordinates the Plan/Review → Build → Test cycle
   - Manages fallback to local analysis when Claude is unavailable

2. **orchestrator-commands.js** - CLI command interface
   - Routes user commands to appropriate orchestrator actions
   - Manages current project context (stored in `.current-project`)
   - Handles automatic git commits at strategic checkpoints


### The Three-Part Flow

Every action follows these steps:

1. **Plan/Review Phase**: Reviews logs, understands current state, plans next action
2. **Build Phase**: Implements the plan by creating or modifying code
3. **Test Phase**: Runs automated tests to validate the implementation

### Project Structure

Projects are created in `PROJECTS_DIR` (configurable via .env) with:
- Git repository with automatic commits
- `backlogs.json` - List of project backlogs (feature sets to build)
- `log.txt` - Detailed execution log
- `task-log.txt` - High-level Plan/Build/Test cycles
- Generated application code and tests

### Backlog System

The orchestrator now uses a three-level hierarchy:
1. **Project** - The overall application being built
2. **Backlogs** - Feature sets or major components (stored in backlogs.json)
3. **Tasks** - Individual implementation steps within a backlog

When creating a new project:
- `npm run create-project` creates the project and generates initial backlogs
- `npm run process-backlog` works on the next available backlog
- Each backlog is broken down into tasks during processing

#### Backlog Sizing Guidelines
- Each backlog should be a complete, demonstrable feature
- Target: 300-1000 lines of code when implemented
- Should take AI ~10-30 minutes to complete (1-3 hours human time)
- Examples: "User Login System", "Product Search", "Shopping Cart"
- Not: "Add button" (too small) or "Complete app" (too large)

### Key Implementation Details

- Uses Node.js native test runner (`node --test`)
- ES modules (`type: "module"` in package.json)
- Automatic git commits before/after tasks for clean history
- Fallback to local analysis when Claude API times out
- Projects maintain state through comprehensive logging
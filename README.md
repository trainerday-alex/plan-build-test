# Plan-Build-Test Loop

An AI orchestrator that builds working software through a simple, repeating cycle: **Plan/Review → Build → Test**

Every action follows the same three steps, keeping development predictable and testable.

## Quick Start

```bash
# Install dependencies
npm install

# Create a new project
npm run new-project my-app "build a todo list with add and delete"

# Add features (works on current project)
npm run task "add ability to edit todos"

# Fix issues
npm run fix

# Improve code
npm run refactor
```

## How It Works

Every command follows the same three-step cycle:

### 1. Plan/Review
- Reviews logs and current state
- Understands what's been done
- Plans the next action

### 2. Build
- Implements the plan
- Creates or modifies code

### 3. Test
- Runs automated tests
- Validates everything works

After tests pass, the web server stays running so you can try it yourself.

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Project Directory
Create a `.env` file with your preferred project location:
```
PROJECTS_DIR=/Users/alex/Documents/Projects/ai-projects
```

If not specified, projects will be created in `./projects/`

## Commands

### Create a New Project
```bash
npm run new-project <name> <description>
```
Creates a new project and sets it as current. Includes:
- Project folder with git init
- All necessary files and dependencies
- First working implementation

### Work on Current Project
```bash
npm run task <description>    # Add new feature
npm run fix                   # Fix failing tests
npm run refactor             # Improve code quality
npm run status               # Show project progress
```

### Switch Projects
```bash
npm run change-project <name>  # Switch to existing project
```

## What Gets Created

Each project includes:
- Working application code
- Web server (when needed)
- Automated tests
- Git repository with automatic commits
- Comprehensive logs:
  - `log.txt` - Detailed execution log
  - `task-log.txt` - High-level Plan/Build/Test cycles

## Git Integration

The loop automatically commits your code:
- **New Project**: Initial commit after setup
- **Before Tasks**: Commits current state as checkpoint
- **After Success**: Commits completed work
- **Before Refactor**: Saves working version

This creates a clean git history showing your project evolution.

## Example Workflow

```bash
# Day 1: Create a login page
npm run new-project login-app "build a login page"
# (builds and tests automatically, server starts for manual testing)

# Day 2: Add password reset
npm run task "add forgot password link and reset flow"
# (reviews current state, plans, builds, tests)

# Something broke?
npm run fix
# (reviews logs, identifies issue, fixes it, tests)

# Code needs cleanup?
npm run refactor
# (improves code structure while maintaining functionality)
```

## Why Plan-Build-Test?

This loop mirrors how developers actually work:

1. **Plan/Review** - Check logs, understand current state, plan changes
2. **Build** - Write the code
3. **Test** - Verify it works

By enforcing this pattern, the AI:
- Never codes blindly without reviewing first
- Always tests before declaring success
- Maintains clear logs of every decision
- Commits at strategic checkpoints

The human stays in control, deciding what happens next after each cycle.

## Troubleshooting

- **Claude timeouts**: The orchestrator will use local analysis as fallback
- **Test failures**: Run `npm run fix` to diagnose and repair
- **Need to see details**: Check `log.txt` and `task-log.txt` in your project

## License

MIT
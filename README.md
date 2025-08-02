# Plan-Build-Test Loop

An AI-powered orchestrator that creates and coordinates specialized agents using the Claude Code CLI/SDK to build working software. Following lean methodology principles, it focuses on delivering the most important features first through a systematic cycle: **Plan/Review → Build → Test**

This is designed to work with pure JavaScript and Express.js server. Probably best for prototyping right now but just changing the agent prompts and adding a new setup template could work for any project. Just fork it and make your own or if you want to help on this and add support for other environments that's great as well.

This implementation is based on "The Three-Part Flow" philosophy - a business-first approach that prioritizes rapid validation of ideas through working demos. Instead of over-planning, the system builds testable software in 30-minute cycles, allowing you to validate assumptions with real working code before moving to the next priority.

Every action follows the same three steps with dedicated AI agents (Architect, Coder, Tester, Refactor Analyst) working together, ensuring each cycle produces deployable, testable software that demonstrates concrete business value.

## Requirements

- **Claude Code CLI**: Install Claude Code from https://docs.anthropic.com/en/docs/claude-code/setup
- **Claude Code SDK**: Follow the SDK setup at https://docs.anthropic.com/en/docs/claude-code/sdk
- **Node.js**: Version 18 or higher
- **npm**: Comes with Node.js

Make sure Claude Code is working properly before proceeding. You can test by running `cc --version` in your terminal.

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/trainerday-alex/plan-build-test.git
cd plan-build-test

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env and update:
# - PROJECTS_DIR: where AI-generated projects will be created

# 4. Create your first project
npm run create-project my-app "build a todo list with add and delete"
# This creates the project and shows a list of backlogs (feature sets)

# 5. Process backlogs to build features
npm run process-backlog      # Works on the next available backlog
npm run list-backlogs        # See all backlogs and their status

# 6. Add more backlogs as needed
npm run backlog "add user authentication"

# 7. Fix issues or improve code
npm run fix                   # Fix failing tests
npm run refactor             # Improve code quality
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
- Creates automated tests
- Runs tests to validate everything works

After tests pass, the web server stays running so you can try it yourself.

## Commands

### Create a New Project
```bash
npm run create-project <name> <description>
```
Creates a new project and sets it as current. Includes:
- Project folder with git init
- List of backlogs (feature sets) to implement
- All necessary files and dependencies

### Work with Backlogs
```bash
npm run list-backlogs         # See all backlogs and their status
npm run process-backlog       # Work on the next available backlog
npm run process-backlog 3     # Work on specific backlog #3
npm run backlog <description> # Add a new backlog item
```

### Work on Current Project
```bash
npm run fix                   # Fix failing tests (resumes from failed tasks)
npm run fix-tests            # Update tests to match implementation
npm run refactor             # Improve code quality
npm run status               # Show project progress
npm run task <description>    # Legacy: Add feature directly (use backlogs instead)
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
- `backlogs.json` - List of feature sets to implement
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
# Day 1: Create a project with authentication
npm run create-project auth-app "build user authentication system"
# Shows backlogs like: 1. User Registration, 2. Login, 3. Password Reset

# Start with the first backlog
npm run process-backlog
# (builds user registration feature)

# Add more requirements as you discover them
npm run backlog "add email verification"

# Day 2: Continue with next backlog
npm run process-backlog
# (builds login feature)

# Something broke?
npm run fix
# (reviews logs, identifies issue, fixes it, tests)

# Code needs cleanup?
npm run refactor
# (improves code structure while maintaining functionality)
```

## Philosophy: Lean & Business-First

Built on lean methodology principles:
- **Most Important First** - Start with the highest priority feature that delivers real value
- **Working Software Always** - Every cycle produces something you can actually test and use
- **Validate Before Expanding** - Test your assumptions with real code before building more
- **No Over-Planning** - Build, test, learn, then decide what's next based on results
- **Concrete Over Abstract** - "Enter X, see Y" is clearer than lengthy specifications

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


## Recent Improvements

- **Better Task Resumption**: The `fix` command now properly resumes from failed tasks within the correct backlog context
- **Automatic Dependency Installation**: Dependencies are automatically installed before running tests
- **Improved Error Handling**: Better diagnostics for Claude CLI failures with retry logic
- **Test Simplification**: Tests now focus on 2-3 core functionality tests instead of edge cases
- **Fix-Tests Command**: New command to update tests when implementation changes

## Troubleshooting

- **Claude timeouts**: The orchestrator will retry with increased timeout (120s) and better error messages
- **Test failures**: Run `npm run fix` to diagnose and repair (properly resumes from failed task)
- **Missing dependencies**: Now automatically runs `npm install` before tests
- **Too many tests**: Use `npm run fix-tests` to simplify tests to core functionality
- **Need to see details**: Check `log.txt` and `task-log.txt` in your project

## License

MIT
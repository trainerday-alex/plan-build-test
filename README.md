# Plan-Build-Test Loop

An AI-powered orchestrator that creates and coordinates specialized agents using the Claude Code CLI/SDK to build working software. Following lean methodology principles, it focuses on delivering the most important features first through a systematic cycle: **Plan/Review → Build → Test**

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
# - AGENTS_PATH: where agent templates are stored (optional)

# 4. Create your first project
npm run create-project my-app "build a todo list with add and delete"

# 5. Add features (works on current project)
npm run task "add ability to edit todos"

# 6. Fix issues or improve code
npm run fix                   # Fix failing tests (I work directly with Claude Code on this part)
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
npm run create-project login-app "build a login page"
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

## OPTIONAL: Agent Templates with Basic Memory

You can store and manage agent templates using the [Basic Memory MCP plugin](https://github.com/BasicMCP/basic-memory), which enables:

- **Edit from Claude Desktop**: Improve agent prompts directly from Claude or any MCP-supporting LLM
- **Review in Obsidian**: View and organize your agent templates as part of an Obsidian project
- **Version Control**: Track changes to your agent strategies over time
- **Collaborate**: Share agent improvements across team members

To use Basic Memory for agent templates:
1. Install and configure Basic Memory MCP plugin
2. Set `AGENTS_PATH` in your `.env` to point to your Basic Memory project location
3. Agent templates will be automatically loaded from there (with YAML frontmatter stripped)

Default agent templates are included in `./agents/` if you prefer local-only usage.

## Troubleshooting

- **Claude timeouts**: The orchestrator will use local analysis as fallback
- **Test failures**: Run `npm run fix` to diagnose and repair
- **Need to see details**: Check `log.txt` and `task-log.txt` in your project

## License

MIT
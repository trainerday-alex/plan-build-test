# The Three-Part Flow Orchestrator

A smart, task-based AI orchestrator that builds and maintains working software projects by coordinating three specialized agents: Architect, Coder, and Tester. Features intelligent project continuation, detailed logging, and automated testing.

## Overview

This orchestrator takes a project name and requirement, then automatically:
1. Creates new projects or intelligently continues existing ones
2. Breaks down requirements into testable tasks
3. Implements each task incrementally with full state tracking
4. Creates all necessary files, servers, and tests
5. Manages the complete project lifecycle with detailed logs

## How It Works

### The Three Agents

1. **Architect Agent**
   - Analyzes requirements and creates a task-based blueprint
   - Identifies runtime requirements (web servers, databases, etc.)
   - Breaks work into independently testable steps
   - Defines success criteria and final validation tests

2. **Coder Agent**
   - Implements each task from the Architect's plan
   - Creates/updates files incrementally
   - Builds on previous work
   - Provides test instructions for each step

3. **Tester Agent**
   - Creates comprehensive test suites
   - Writes Playwright tests for UI validation
   - Ensures the final product works as specified

### The Process

1. **Requirement Input** → "Build a login page with specific credentials"
2. **Architect Planning** → Creates numbered task list with test criteria
3. **Incremental Building** → Each task is implemented and verified
4. **Final Validation** → Playwright tests confirm everything works
5. **Ready Project** → Complete with server, tests, and documentation

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

## Usage

### Smart Orchestrator (Recommended)

The smart orchestrator requires both project name and description, and intelligently manages project state:

```bash
node orchestrator-smart.js "<project-name>" "<requirement>"
```

#### Examples

Create a new project:
```bash
node orchestrator-smart.js "login-page" "build a login page with email test@example.com and password secret123"
```

Continue an existing project:
```bash
# Run the same command - it will continue where it left off
node orchestrator-smart.js "login-page" "build a login page with email test@example.com and password secret123"
```

Add features to existing project:
```bash
node orchestrator-smart.js "login-page" "add forgot password functionality"
```

### Basic Orchestrator (Legacy)

For simple one-off projects without state management:
```bash
node orchestrator-tasks.js "create a calculator with add and subtract"
```

### What Gets Created

Projects are created in your configured directory with:
- Complete source code (HTML, CSS, JavaScript)
- Web server configuration (Express.js or http-server)
- Playwright tests with automatic server management
- Package.json with all dependencies
- Project state files:
  - `orchestrator-state.json` - Current progress and tasks
  - `orchestrator-log.json` - Detailed timestamped action log
  - `playwright.config.js` - Test configuration with server lifecycle

## Project Structure

```
the-three-part-flow/
├── orchestrator-tasks.js    # Main task-based orchestrator
├── orchestrator.js          # Original simple orchestrator
├── projects/                # Generated projects go here
│   └── [project-name]/
│       ├── src/            # Source code
│       ├── test/           # Test files
│       ├── server.js       # Web server (if needed)
│       ├── package.json    # Dependencies
│       └── orchestrator-results.json
└── test.js                 # Orchestrator tests
```

## Running Generated Projects

After the orchestrator completes:

```bash
cd /path/to/your/projects/[project-name]
npm install
npm test         # Automatically starts server, runs tests, stops server
```

For manual testing:
```bash
npm start        # Starts the web server
# Open http://localhost:3000 in your browser
```

Additional test options:
```bash
npm run test:ui       # Playwright UI mode
npm run test:headed   # Run tests with visible browser
```

## How the Task-Based Approach Works

1. **Architect creates a numbered task list:**
   ```
   1. Create HTML login form (test: form displays in browser)
   2. Add CSS styling (test: form is centered and styled)
   3. Add validation logic (test: correct credentials show success)
   4. Setup web server (test: page loads at localhost:3000)
   5. Create Playwright test (test: automated login works)
   ```

2. **Each task is executed independently:**
   - Coder implements the specific task
   - Files are created/updated
   - Test instructions provided
   - Next task builds on previous work

3. **Final validation:**
   - Playwright tests verify end-to-end functionality
   - Web server is configured if needed
   - All dependencies are included

## Architecture Evolution

### Version 1: Simple Orchestrator (`orchestrator.js`)
- Single pass through Architect → Coder → Tester
- Sometimes missed files (HTML, CSS)
- No incremental building

### Version 2: Task-Based Orchestrator (`orchestrator-tasks.js`)
- Architect creates testable task list
- Incremental building with verification
- Handles complex projects better
- Creates all necessary files
- Includes runtime requirements (servers, etc.)

### Version 3: Smart Orchestrator (`orchestrator-smart.js`)
- **Project Management**: Named projects with dedicated directories
- **State Persistence**: Tracks progress across sessions
- **Intelligent Continuation**: Resumes from last completed task
- **Project Evolution**: Can add features to existing projects
- **Detailed Logging**: Full audit trail of all actions
- **Environment Configuration**: Uses .env for project directory

## Key Features

- **Natural Language Input**: Describe what you want in plain English
- **Complete Projects**: Not just code snippets, but working applications
- **Test-Driven**: Each step has clear test criteria
- **Incremental Building**: Complex projects built step-by-step
- **Runtime Awareness**: Creates servers, configs, and tests as needed
- **State Management**: Projects can be paused and resumed anytime
- **Smart Continuation**: Intelligently continues where it left off
- **Feature Addition**: Add new features to existing projects
- **Automated Testing**: Playwright tests with automatic server lifecycle
- **Detailed Logging**: Complete audit trail of all actions

## Troubleshooting

**If the orchestrator times out:**
- Try a simpler requirement first
- Break complex requirements into smaller pieces
- Run with more specific requirements

**If files are missing:**
- Check orchestrator-results.json for what was processed
- The task-based orchestrator (`orchestrator-tasks.js`) is more reliable
- Ensure your requirement is clear and specific

## The Philosophy

This project demonstrates the "Three-Part Flow" for human/AI collaboration:

1. **Discovery & Planning** - Architect understands and plans
2. **Build It** - Coder implements incrementally  
3. **Validate & Evolve** - Tester ensures it works

The key insight: breaking work into small, testable tasks with clear success criteria produces better results than trying to build everything at once.

## Development

To improve the orchestrator:
1. Run it with various requirements
2. Identify what fails or times out
3. Update the prompts or task handling
4. Test the improvements

The orchestrator can even improve itself:
```bash
node orchestrator-tasks.js "add better error handling to orchestrator-tasks.js"
```

## License

MIT
# Session Notes: Backlog System Implementation

## What We Accomplished

### 1. Created a Three-Level Hierarchy
- **Project** → **Backlogs** → **Tasks**
- Projects now generate backlogs (feature sets) instead of immediately building
- Each backlog breaks down into 4-10 tasks when processed

### 2. Improved Backlog Sizing
- Each backlog = 300-1000 lines of code
- 4-10 tasks per backlog (sweet spot: 6-8 tasks)
- Represents ~10-30 minutes AI time (1-3 hours human time)
- Complete, demonstrable features

### 3. New Commands
- `npm run create-project` - Creates project and shows backlogs (doesn't build)
- `npm run show-backlogs` - Lists backlogs with ✅/⬜ checkboxes
- `npm run process-backlog` - Works on next/interrupted backlog
- `npm run reset-backlog <id>` - Reset stuck backlog
- `npm run help` - Shows all commands

### 4. Fixed Issues
- Create-project no longer runs tests automatically
- Process-backlog now resumes interrupted work properly
- Added code review when resuming partial work
- Simple projects now create fewer backlogs (1 instead of 3)

## Testing Improvements We Started

### Current Issues with Tests
- Tests are too granular and implementation-focused
- Check internal state instead of user-visible behavior
- Examples of bad tests:
  - Checking localStorage contents
  - Verifying CSS classes
  - Testing internal state objects

### Changes Made to Testing
- Updated tester agent to focus on **basic user-facing functionality**
- Good tests now check:
  - What users can DO (click, type, submit)
  - What users can SEE (messages, items, errors)
- Simplified scope: Happy path + 1-2 simple error cases

### Next Steps for Testing
1. **Ensure tests match actual implementation** - Tests should use exact selectors and messages from the code
2. **Keep tests simple** - No complex scenarios or edge cases
3. **Test behavior, not implementation** - Focus on user actions and visible results
4. **Handle browser validation properly** - HTML5 validation happens before JavaScript

## Other Improvements to Consider
1. Better handling of specific requirements (preserve exact values like emails/passwords)
2. Smarter backlog generation for simple projects
3. More intelligent test generation based on actual code
4. Better error recovery when backlogs fail mid-process
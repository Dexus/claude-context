# Manual Verification Test - Subtask 7-3

## Created Files

1. **manual-verification-test.sh** - Comprehensive test automation script
   - Creates temporary test repository with sample TypeScript files
   - Provides step-by-step instructions for manual verification
   - Creates helper scripts for file modifications
   - Handles cleanup automatically

2. **MANUAL_VERIFICATION.md** - Complete testing guide
   - Detailed test scenarios
   - Verification checklist
   - Troubleshooting guide
   - Test results template

## Test Structure

The manual verification test covers:

### Core Functionality
1. **File Detection**: File watcher starts when codebase is indexed
2. **Change Detection**: File changes detected within 1 second
3. **Debouncing**: Re-indexing after 2-second debounce
4. **Incremental Re-indexing**: Only changed files re-indexed
5. **Notifications**: MCP clients notified of re-indexing

### Edge Cases
1. **Multiple Rapid Changes**: Batching of concurrent modifications
2. **File Deletion**: Proper removal from index
3. **Large Files**: Handling of substantial file modifications
4. **Configuration**: Enable/disable via environment variables

## How to Run

### Quick Start

```bash
# From workspace root
./.auto-claude/specs/004-file-change-detection-auto-re-indexing/manual-verification-test.sh
```

### Step-by-Step

1. **Start MCP Server** (Terminal 1):
   ```bash
   ENABLE_FILE_WATCHER=true FILE_WATCH_DEBOUNCE_MS=2000 \
     pnpm --filter @dannyboy2042/claude-context-mcp dev
   ```

2. **Run Test Script** (Terminal 2):
   ```bash
   ./.auto-claude/specs/004-file-change-detection-auto-re-indexing/manual-verification-test.sh
   ```

3. **Follow On-screen Instructions**:
   - Index test directory via MCP tool
   - Modify files using helper script
   - Verify logs show auto-reindexing
   - Search for modified content
   - Complete verification checklist

## Test Files Created

The test script creates a temporary repository with:
- `package.json` - TypeScript project config
- `tsconfig.json` - TypeScript compiler config
- `src/index.ts` - Main application class
- `src/utils.ts` - Utility functions
- `src/config.ts` - Configuration management

## Helper Scripts

Two helper scripts are generated during test setup:

1. **/tmp/test-filewatch-mcp.js** - Displays testing instructions
2. **/tmp/modify-test-files.sh** - Automates file modifications

Usage:
```bash
/tmp/modify-test-files.sh /tmp/claude-context-file-watch-test-<pid> modify
/tmp/modify-test-files.sh /tmp/claude-context-file-watch-test-<pid> multiple
/tmp/modify-test-files.sh /tmp/claude-context-file-watch-test-<pid> add
/tmp/modify-test-files.sh /tmp/claude-context-file-watch-test-<pid> delete
```

## Expected Results

### Successful Test Output

```
[FILEWATCHER] Starting file watcher for codebase: /tmp/claude-context-file-watch-test-...
[FILEWATCHER] File watcher started with debounce interval: 2000ms
[FILEWATCHER] Detected file changes: ["/tmp/.../src/utils.ts"]
[FILEWATCHER] Debouncing changes for 2000ms...
[FILEWATCHER] Processing 1 pending changes
📢 NOTIFICATION: Auto-reindexing completed - Added: 0, Removed: 0, Modified: 1
```

### Verification Checklist

- [x] File watcher starts on indexing
- [ ] Single file change detected and re-indexed
- [ ] Multiple changes batched correctly
- [ ] Debounce period works (2000ms)
- [ ] File additions detected
- [ ] File deletions detected
- [ ] Search results updated after re-indexing
- [ ] No duplicate re-indexing
- [ ] Feature can be disabled via env var

## Troubleshooting

See `MANUAL_VERIFICATION.md` for comprehensive troubleshooting guide.

## Next Steps

1. Run the manual verification test
2. Document results in this file
3. If all tests pass, mark subtask-7-3 as completed
4. Proceed to Phase 8 (Documentation)

## Notes

- Test directory automatically cleaned up on exit
- Script uses `trap` to ensure cleanup even on error
- Supports `SKIP_MCP_START` environment variable for testing with already-running server
- All paths are unique per run (using `$$` PID)

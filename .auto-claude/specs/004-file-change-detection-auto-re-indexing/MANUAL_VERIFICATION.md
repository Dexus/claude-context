# Manual Verification Test: File Change Detection & Auto Re-indexing

This document describes the manual verification test for the file change detection and auto-reindexing feature.

## Overview

The manual verification test validates that:
1. File system watcher detects changes in indexed directories
2. Changes are debounced by 2 seconds to batch rapid edits
3. Only changed files are re-indexed (incremental, not full rebuild)
4. Re-indexing runs in background without blocking searches
5. MCP clients receive notifications when re-indexing completes
6. Feature can be disabled via configuration

## Test Script

A comprehensive test script is provided at:
```
.auto-claude/specs/004-file-change-detection-auto-re-indexing/manual-verification-test.sh
```

## Running the Test

### Quick Start

```bash
# From the workspace root
./.auto-claude/specs/004-file-change-detection-auto-re-indexing/manual-verification-test.sh
```

The script will:
1. Create a temporary test repository with sample TypeScript files
2. Provide instructions for starting the MCP server
3. Generate helper scripts for modifying files
4. Display step-by-step verification instructions
5. Clean up automatically when you exit

### Detailed Steps

#### Step 1: Start the MCP Server

In a separate terminal, start the MCP server with file watching enabled:

```bash
cd /path/to/claude-context
ENABLE_FILE_WATCHER=true FILE_WATCH_DEBOUNCE_MS=2000 pnpm --filter @dannyboy2042/claude-context-mcp dev
```

Expected output:
```
[FILEWATCHER] File watching is enabled with debounce interval: 2000ms
[FILEWATCHER] Initializing file watchers for indexed codebases...
```

#### Step 2: Run the Test Script

```bash
./.auto-claude/specs/004-file-change-detection-auto-re-indexing/manual-verification-test.sh
```

This will create a test repository at `/tmp/claude-context-file-watch-test-<pid>` with:
- `package.json` - TypeScript project configuration
- `tsconfig.json` - TypeScript compiler configuration
- `src/index.ts` - Main application class
- `src/utils.ts` - Utility functions
- `src/config.ts` - Configuration management

#### Step 3: Index the Test Directory

Use the `index_codebase` MCP tool to index the test directory:

**MCP Tool Call:**
```json
{
  "codebasePath": "/tmp/claude-context-file-watch-test-<pid>"
}
```

**Expected Logs:**
```
[FILEWATCHER] Starting file watcher for codebase: /tmp/claude-context-file-watch-test-<pid>
[FILEWATCHER] Watching path: /tmp/claude-context-file-watch-test-<pid>
[FILEWATCHER] File watcher started with debounce interval: 2000ms
[INDEX] Starting background indexing...
[INDEX] Indexing complete: 4 files processed
```

#### Step 4: Modify a File

Use the helper script to modify a file:

```bash
/tmp/modify-test-files.sh /tmp/claude-context-file-watch-test-<pid> modify
```

This will add a new `multiply` function to `src/utils.ts`.

#### Step 5: Wait for Debounce Period

Wait 2-3 seconds for the debounce to trigger.

**Expected Logs:**
```
[FILEWATCHER] Detected file changes: ["/tmp/claude-context-file-watch-test-<pid>/src/utils.ts"]
[FILEWATCHER] Debouncing changes for 2000ms...
[FILEWATCHER] Processing 1 pending changes
📢 NOTIFICATION: Auto-reindexing completed - Added: 0, Removed: 0, Modified: 1
```

#### Step 6: Verify Re-indexing

Search for the modified content:

**MCP Tool Call:**
```json
{
  "query": "multiply function"
}
```

**Expected Result:** The newly added `multiply` function should appear in search results.

#### Step 7: Test Debouncing with Multiple Changes

Make multiple rapid changes:

```bash
/tmp/modify-test-files.sh /tmp/claude-context-file-watch-test-<pid> multiple
```

This modifies 3 files in quick succession (within 1.5 seconds).

**Expected Behavior:**
- All 3 changes are detected
- They are batched together
- Only ONE re-indexing occurs after the debounce period

**Expected Logs:**
```
[FILEWATCHER] Detected file changes: ["file1.ts", "file2.ts", "file3.ts"]
[FILEWATCHER] Debouncing changes for 2000ms...
[FILEWATCHER] Processing 3 pending changes
📢 NOTIFICATION: Auto-reindexing completed - Added: 0, Removed: 0, Modified: 3
```

#### Step 8: Test File Deletion

```bash
/tmp/modify-test-files.sh /tmp/claude-context-file-watch-test-<pid> add
# Wait for re-indexing
/tmp/modify-test-files.sh /tmp/claude-context-file-watch-test-<pid> delete
```

**Expected Result:** Deleted file content should not appear in search results.

## Verification Checklist

After completing all test steps, verify:

- [ ] **File Detection**: File watcher starts successfully when codebase is indexed
- [ ] **Change Detection**: File changes are detected within 1 second
- [ ] **Debouncing**: Re-indexing triggers after 2-second debounce period
- [ ] **Correct Counts**: Log shows accurate file change counts (Added/Removed/Modified)
- [ ] **Search Results**: Modified content appears in search results
- [ ] **Deletion Handling**: Deleted content is removed from search results
- [ ] **Batch Processing**: Multiple rapid changes are batched into single re-index
- [ ] **No Duplicates**: No duplicate re-indexing occurs for the same changes
- [ ] **Non-blocking**: File watcher does not block search operations
- [ ] **Configurable**: Feature can be disabled with `ENABLE_FILE_WATCHER=false`

## Troubleshooting

### File watcher not starting

**Check:**
- Is `ENABLE_FILE_WATCHER=true` set?
- Is the codebase path valid?
- Check logs for errors

**Solution:**
```bash
export ENABLE_FILE_WATCHER=true
export FILE_WATCH_DEBOUNCE_MS=2000
pnpm --filter @dannyboy2042/claude-context-mcp dev
```

### Changes not detected

**Check:**
- Is the file within the watched directory?
- Is the file extension supported?
- Check if ignore patterns are matching the file

**Solution:**
- Verify the file path matches the indexed codebase path
- Check that the file type is supported (.ts, .js, .tsx, .jsx, etc.)
- Review ignore patterns in configuration

### Re-indexing not triggered

**Check:**
- Has the debounce period elapsed? (default 2000ms)
- Are there any errors in the logs?
- Is the file watcher still running?

**Solution:**
- Wait at least 3 seconds after modifying a file
- Check MCP server logs for errors
- Verify file watcher status with logs

### Search results not updated

**Check:**
- Did re-indexing complete successfully?
- Is the search query matching the new content?
- Check for indexing errors

**Solution:**
- Look for "NOTIFICATION: Auto-reindexing completed" message
- Try a more specific search query
- Check logs for re-indexing errors

## Test Results Template

Use this template to document test results:

```
Test Date: <DATE>
Tester: <NAME>
Environment: <OS, Node version>

Test Results:
[ ] File watcher starts on indexing
[ ] Single file change detected and re-indexed
[ ] Multiple changes batched correctly
[ ] Debounce period works (2000ms)
[ ] File additions detected
[ ] File deletions detected
[ ] Search results updated after re-indexing
[ ] No duplicate re-indexing
[ ] Feature can be disabled via env var

Issues Found:
- <Describe any issues>

Log Samples:
- <Attach relevant log snippets>

Overall Result: PASS / FAIL
```

## Cleanup

The test script automatically cleans up when you exit (Ctrl+C). To manually clean up:

```bash
# Remove test directory
rm -rf /tmp/claude-context-file-watch-test-*

# Remove helper scripts
rm /tmp/test-filewatch-mcp.js
rm /tmp/modify-test-files.sh
```

## Additional Test Scenarios

### Scenario 1: Rapid File Changes

**Purpose:** Verify debouncing batches rapid changes

**Steps:**
1. Create 10 files in quick succession
2. Wait for debounce period
3. Verify only one re-indexing occurred

**Expected:** Single re-index with 10 added files

### Scenario 2: Large File Modification

**Purpose:** Verify large files are handled correctly

**Steps:**
1. Create a file with 1000+ lines
2. Modify the file
3. Verify re-indexing completes without errors

**Expected:** Re-indexing completes successfully

### Scenario 3: Concurrent Indexing and File Watching

**Purpose:** Verify file watching doesn't interfere with initial indexing

**Steps:**
1. Start indexing a large codebase
2. While indexing is in progress, modify a file
3. Verify both operations complete without errors

**Expected:** Initial indexing completes, then file modification triggers re-index

### Scenario 4: Disable and Re-enable File Watching

**Purpose:** Verify configuration changes take effect

**Steps:**
1. Start server with `ENABLE_FILE_WATCHER=true`
2. Index a codebase
3. Stop server
4. Restart server with `ENABLE_FILE_WATCHER=false`
5. Modify a file
6. Verify no auto-reindex occurs

**Expected:** No auto-reindex when disabled

## References

- Implementation: `packages/core/src/watcher/file-watcher.ts`
- Integration: `packages/core/src/context.ts` (startWatching, stopWatching)
- MCP Server: `packages/mcp/src/index.ts`, `packages/mcp/src/handlers.ts`
- Configuration: `packages/mcp/src/config.ts`

# Integration Test: Verify Collection Persistence Across Server Restarts

## Test Case: Index and Verify Collection Persistence

**Subtask:** subtask-3-2
**Type:** End-to-End Manual Verification
**Purpose:** Verify that indexed collections persist across MCP server restarts and are correctly verified during startup.

## Prerequisites

1. **Environment Setup:**
   - Node.js >= 20.0.0
   - pnpm installed
   - OpenAI API key set in environment (or use mock embedding)
   - MCP server built: `pnpm build:mcp`

2. **Test Codebase:**
   - A simple test codebase directory (e.g., `/tmp/test-codebase`)

## Verification Steps

### Step 1: Index a Codebase Using MCP Server

**Action:** Index a test codebase through the MCP server

```bash
# Start the MCP server
cd packages/mcp
npm run dev

# From another terminal, use an MCP client to call index_codebase tool:
# {
#   "path": "/tmp/test-codebase",
#   "force": false
# }
```

**Expected Result:**
- Codebase is indexed successfully
- Collection is created in LanceDB
- No errors in server logs

**Verify:**
```bash
# Check that collection exists in LanceDB
# The collection name is a hash of the codebase path
ls -la ~/.claude-context/lancedb/
```

### Step 2: Verify Snapshot Contains the Codebase Path

**Action:** Read the snapshot file and verify the codebase path is present

```bash
cat ~/.context/mcp-codebase-snapshot.json
```

**Expected Result:**
```json
{
  "indexedCodebases": ["/tmp/test-codebase"],
  "indexingCodebases": [],
  "lastUpdated": "2025-01-21T..."
}
```

**Verify:**
- Codebase path appears in `indexedCodebases` array
- `lastUpdated` timestamp is recent

### Step 3: Restart MCP Server

**Action:** Stop and restart the MCP server

```bash
# Kill the MCP server (Ctrl+C)

# Restart the MCP server
cd packages/mcp
npm run dev
```

**Expected Result:**
- Server starts successfully
- Startup logs show:
  ```
  [SYNC-DEBUG] Loading codebase snapshot...
  [SNAPSHOT-DEBUG] Loaded snapshot with X indexed codebases
  [SYNC-DEBUG] Verifying collections...
  [SNAPSHOT-DEBUG] Verified collection for codebase: /tmp/test-codebase
  ```

**Verify:**
- No errors during startup
- Collection verification logs appear
- Codebase is verified successfully

### Step 4: Verify Collection Still Exists After Restart

**Action:** Check that the LanceDB collection still exists

```bash
# Check LanceDB directory
ls -la ~/.claude-context/lancedb/

# Or use the get_indexing_status tool via MCP client:
# {
#   "path": "/tmp/test-codebase"
# }
```

**Expected Result:**
- Collection files still exist in LanceDB directory
- `get_indexing_status` returns `indexed` status

### Step 5: Confirm Snapshot Still Contains the Codebase

**Action:** Read the snapshot file again

```bash
cat ~/.context/mcp-codebase-snapshot.json
```

**Expected Result:**
```json
{
  "indexedCodebases": ["/tmp/test-codebase"],
  "indexingCodebases": [],
  "lastUpdated": "2025-01-21T..."
}
```

**Verify:**
- Codebase path is still in `indexedCodebases`
- No entries were removed during verification
- Collection verification was successful

## Success Criteria

✅ **PASS:** All verification steps complete successfully
- Codebase indexed without errors
- Snapshot contains codebase path before restart
- Server restarts successfully
- Collection verification logs show success
- Snapshot still contains codebase path after restart
- No collections were removed

❌ **FAIL:** Any of the following occur
- Indexing fails with errors
- Snapshot doesn't contain codebase path
- Server crashes on restart
- Collection verification removes valid entries
- Errors in logs related to collection verification

## Test Cleanup

After verification:

```bash
# Clear the test index
# Use the clear_index tool via MCP client:
# {
#   "path": "/tmp/test-codebase"
# }

# Or manually:
rm -rf ~/.claude-context/lancedb/<collection-hash>
rm ~/.context/mcp-codebase-snapshot.json
```

## Additional Test Cases

### Test Case: Multiple Codebases

1. Index multiple different codebases
2. Verify all appear in snapshot
3. Restart server
4. Verify all collections still exist
5. Confirm snapshot still contains all codebases

### Test Case: Large Codebase

1. Index a larger codebase (e.g., packages/core)
2. Verify snapshot and collection
3. Restart server
4. Verify collection persistence
5. Check startup time impact of verification

## Notes

- This test verifies the integration between:
  - `SnapshotManager.loadCodebaseSnapshot()`
  - `SnapshotManager.verifyCollections()`
  - `Context.hasIndex()`
  - LanceDB vector database

- The verification happens in `packages/mcp/src/index.ts` during server startup (lines 337-343)

- Logs with `[SNAPSHOT-DEBUG]` prefix indicate collection verification in progress

# Integration Test: Verify Deleted Collection Detection

## Test Case: Manual Collection Deletion and Cleanup

**Subtask:** subtask-3-3
**Type:** End-to-End Manual Verification
**Purpose:** Verify that manually deleted collections are detected during server startup and removed from the snapshot.

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

### Step 3: Manually Delete the Collection from Vector DB

**Action:** Delete the LanceDB collection directly

```bash
# Get the collection name (it's a hash of the codebase path)
# You can find it by listing the collections
ls ~/.claude-context/lancedb/

# Delete the collection directory
rm -rf ~/.claude-context/lancedb/<collection-hash>
```

**Alternative (programmatic):**
```typescript
import { Context } from "@dexus1985/claude-context-core";

const context = new Context({ /* config */ });
const collectionName = context.getCollectionName("/tmp/test-codebase");
await context.vectorDatabase.dropCollection(collectionName);
```

**Expected Result:**
- Collection files are deleted
- Snapshot file still contains the codebase path (not yet cleaned up)

**Verify:**
```bash
# Collection directory no longer exists
ls ~/.claude-context/lancedb/  # Should NOT show <collection-hash>

# Snapshot still has the codebase (stale state)
cat ~/.context/mcp-codebase-snapshot.json  # Still shows the codebase
```

### Step 4: Restart MCP Server

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
  [SNAPSHOT-DEBUG] Loaded snapshot with 1 indexed codebases
  [SYNC-DEBUG] Verifying collections...
  [SNAPSHOT-DEBUG] Verifying collection for codebase: /tmp/test-codebase
  [SNAPSHOT-DEBUG] Collection missing for codebase: /tmp/test-codebase
  [SNAPSHOT-DEBUG] Removed codebase from snapshot: /tmp/test-codebase
  ```

**Verify:**
- No errors during startup
- Collection verification logs show missing collection detected
- Codebase is removed from snapshot
- Snapshot is saved after cleanup

### Step 5: Verify Snapshot No Longer Contains the Codebase

**Action:** Read the snapshot file after restart

```bash
cat ~/.context/mcp-codebase-snapshot.json
```

**Expected Result:**
```json
{
  "indexedCodebases": [],
  "indexingCodebases": [],
  "lastUpdated": "2025-01-21T..."
}
```

**Verify:**
- Codebase path is NOT in `indexedCodebases` array
- `lastUpdated` timestamp is recent (after the restart)
- Snapshot is now in sync with actual vector DB state

### Step 6: Confirm Search Returns 'Not Indexed' Error

**Action:** Attempt to search the deleted codebase

```bash
# Use an MCP client to call search_codebase tool:
# {
#   "path": "/tmp/test-codebase",
#   "query": "test query"
# }
```

**Expected Result:**
- Search returns empty results (not an error)
- Console shows warning message about missing collection
- No crash or error exception

**Example Warning Message:**
```
⚠️  Collection 'hybrid_code_chunks_...' does not exist. Please index the codebase first.
```

**Verify:**
- Search completes successfully but returns 0 results
- Warning message logged to console
- No false positive search results
- Error is handled gracefully (server doesn't crash)

**Verify:**
- Error message clearly indicates the codebase is not indexed
- No false positive search results
- Error is handled gracefully (server doesn't crash)

## Success Criteria

✅ **PASS:** All verification steps complete successfully
- Codebase indexed without errors
- Snapshot contains codebase path before deletion
- Collection successfully deleted from vector DB
- Server restarts successfully
- Collection verification detects missing collection
- Codebase is removed from snapshot after verification
- Snapshot file is updated and persisted
- Search fails with appropriate 'not indexed' error

❌ **FAIL:** Any of the following occur
- Indexing fails with errors
- Collection deletion fails
- Server crashes on restart after missing collection detected
- Collection verification doesn't detect missing collection
- Codebase remains in snapshot after verification
- Snapshot file not updated after cleanup
- Search returns false positives or crashes

## Test Cleanup

After verification:

```bash
# Clear any remaining test data
rm -rf ~/.claude-context/lancedb/*
rm ~/.context/mcp-codebase-snapshot.json
```

## Additional Test Cases

### Test Case: Multiple Codebases with One Deleted

1. Index two different codebases (e.g., `/tmp/test-codebase-1` and `/tmp/test-codebase-2`)
2. Verify both appear in snapshot
3. Manually delete collection for codebase-1 only
4. Restart server
5. Verify codebase-1 is removed from snapshot
6. Verify codebase-2 remains in snapshot
7. Confirm search works for codebase-2
8. Confirm search fails for codebase-1

### Test Case: All Collections Deleted

1. Index multiple codebases
2. Delete all collections from vector DB
3. Restart server
4. Verify all codebases removed from snapshot
5. Snapshot is empty but valid (no errors)
6. Server continues to run normally

### Test Case: Collection Deleted During Server Operation

1. Start MCP server with indexed codebase
2. Delete collection while server is running
3. Trigger a search operation
4. Verify search fails gracefully
5. Restart server
6. Verify cleanup happens on startup

## Notes

- This test verifies the integration between:
  - `SnapshotManager.loadCodebaseSnapshot()`
  - `SnapshotManager.verifyCollections()`
  - `Context.hasIndex()`
  - `LanceDBVectorDatabase.dropCollection()`
  - Snapshot persistence and cleanup

- The verification happens in `packages/mcp/src/index.ts` during server startup (lines 337-343)

- Logs with `[SNAPSHOT-DEBUG]` prefix indicate collection verification in progress

- The key difference from subtask 3-2 is that this tests the **cleanup** path when collections are missing, rather than the **persistence** path when collections exist

## Automated Test

For automated verification, run:

```bash
cd packages/mcp
npx tsx src/__tests__/verify-deleted-collection-test.ts /tmp/test-codebase
```

This automated script performs all verification steps programmatically and reports detailed results.

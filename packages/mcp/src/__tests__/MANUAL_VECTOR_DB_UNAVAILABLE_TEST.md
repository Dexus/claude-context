# Manual Integration Test: Vector DB Unavailable Handling

## Overview

This test verifies that the MCP server handles vector DB unavailability gracefully during startup. When the vector database (Milvus/Zilliz) is unavailable, the server should:

1. Start without crashing
2. Log appropriate warning messages
3. Keep the snapshot unchanged (treat codebases as valid to avoid data loss)
4. Continue operating normally

## Prerequisites

- MCP server installed and built
- A codebase directory (for testing)
- Access to stop/start vector DB service

## Test Steps

### Step 1: Prepare Test Environment

1. Create a temporary test codebase:
   ```bash
   mkdir -p /tmp/test-codebase-unavailable
   echo "console.log('test');" > /tmp/test-codebase-unavailable/test.js
   ```

2. Ensure vector DB is running:
   ```bash
   # For Milvus (if using Docker)
   docker ps | grep milvus

   # For Zilliz Cloud, verify network connectivity
   ping your-cluster.cloud.zilliz.com
   ```

### Step 2: Index a Codebase

1. Start MCP server:
   ```bash
   cd packages/mcp
   npm run dev
   ```

2. From another terminal, use the MCP client to index the test codebase:
   ```json
   {
     "tool": "index_codebase",
     "arguments": {
       "path": "/tmp/test-codebase-unavailable"
     }
   }
   ```

3. Verify indexing completed successfully:
   - Check response for success message
   - Verify snapshot file was created: `~/.context/mcp-codebase-snapshot.json`

4. Stop the MCP server (Ctrl+C)

### Step 3: Stop Vector DB Service

**For Milvus (Docker):**
```bash
docker stop <milvus-container-name>
# Verify it's stopped
docker ps | grep milvus
```

**For Zilliz Cloud:**
- Disconnect from internet or block the Zilliz Cloud endpoint
- Or temporarily invalidate your API token

### Step 4: Start MCP Server (Vector DB Unavailable)

1. Start MCP server:
   ```bash
   cd packages/mcp
   npm run dev
   ```

2. **Expected Outcome:**
   - Server should start without crashing
   - Server should display warning messages similar to:
     ```
     [SNAPSHOT-DEBUG] Verifying vector DB collections for indexed codebases...
     [SNAPSHOT-DEBUG] Error verifying collection for /tmp/test-codebase-unavailable: Error: Connection refused...
     [SNAPSHOT-DEBUG] Treating /tmp/test-codebase-unavailable as valid due to verification error
     [SNAPSHOT-DEBUG] Collection verification complete. All 1 collections verified.
     ```

3. **Success Criteria:**
   - ✅ Server process is running (did not exit)
   - ✅ Warning messages logged about vector DB unavailability
   - ✅ No crash/error that terminates the server
   - ✅ Server is responsive and ready to accept requests

### Step 5: Verify Snapshot Remains Unchanged

1. Check snapshot file content:
   ```bash
   cat ~/.context/mcp-codebase-snapshot.json
   ```

2. **Expected Outcome:**
   - The test codebase path should still be in `indexedCodebases` array
   - Example:
     ```json
     {
       "indexedCodebases": [
         "/tmp/test-codebase-unavailable"
       ],
       "indexingCodebases": {},
       "lastUpdated": "2026-01-21T..."
     }
     ```

3. **Success Criteria:**
   - ✅ Codebase path is still present in snapshot
   - ✅ Snapshot was not cleared or modified
   - ✅ Data loss did not occur

### Step 6: Verify Server Continues Operating

1. Try to use the server (even though vector DB is unavailable):
   ```json
   {
     "tool": "get_indexing_status",
     "arguments": {
       "path": "/tmp/test-codebase-unavailable"
     }
   }
   ```

2. **Expected Outcome:**
   - Server responds to the request
   - May return error about vector DB being unavailable, but server itself doesn't crash

3. **Success Criteria:**
   - ✅ Server handles the request
   - ✅ Server remains running after the request
   - ✅ No uncaught exceptions or crashes

## Cleanup

1. Stop MCP server (Ctrl+C)

2. Restart vector DB:
   ```bash
   # For Milvus Docker
   docker start <milvus-container-name>

   # For Zilliz Cloud, restore connectivity
   ```

3. Clean up test data:
   ```bash
   # Remove test codebase
   rm -rf /tmp/test-codebase-unavailable

   # Clear test index (optional)
   rm ~/.context/mcp-codebase-snapshot.json
   ```

## Success Criteria

The test passes when ALL of the following are true:

- [ ] Vector DB service successfully stopped
- [ ] MCP server starts successfully despite vector DB being unavailable
- [ ] Server logs warning messages about vector DB unavailability
- [ ] Server does not crash or exit unexpectedly
- [ ] Snapshot file remains unchanged (codebases still present)
- [ ] Server continues to respond to requests
- [ ] No data loss occurs

## Expected Behavior

### When Vector DB is Unavailable

**What SHOULD happen:**
- Server starts and initializes successfully
- Collection verification logs warnings for each codebase
- Each codebase is treated as valid (kept in snapshot)
- Snapshot is NOT modified
- Server continues normal operation

**What should NOT happen:**
- Server crashes or exits
- Snapshot is cleared or modified
- Codebases are removed from snapshot
- Uncaught exceptions are thrown

### Why This Behavior?

When the vector DB is unavailable (network issue, service down, etc.), we cannot verify if collections exist. However, we should:

1. **Avoid data loss**: We don't want to remove codebases from the snapshot just because we can't verify them right now. They might still exist in the vector DB.

2. **Keep server available**: The server should remain operational for other functions even if vector DB verification fails.

3. **Log warnings**: Users should be informed about the issue so they can investigate.

4. **Treat as valid**: By treating unverified codebases as valid, we err on the side of caution and preserve data.

## Additional Test Cases

### Test Case 1: Multiple Codebases

Repeat the test with multiple codebases in the snapshot:

1. Index multiple codebases
2. Stop vector DB
3. Start server
4. Verify all codebases remain in snapshot
5. Verify warnings logged for each codebase

### Test Case 2: Empty Snapshot

Test with empty snapshot:

1. Clear or remove snapshot file
2. Stop vector DB
3. Start server
4. Verify server starts without errors
5. Verify empty snapshot is handled gracefully

### Test Case 3: Intermittent Availability

Test recovery scenario:

1. Start server with vector DB down
2. Verify server starts with warnings
3. Start vector DB while server is running
4. Try search operation - should work now
5. Verify server can use vector DB after it becomes available

## Troubleshooting

### Server Crashes on Startup

**Problem**: Server exits when vector DB is unavailable

**Solution**: Check the `verifyCollections()` method in `packages/mcp/src/snapshot.ts`:
- Ensure errors are caught in try-catch block
- Verify codebases are added to `validCodebases` array on error
- Check that warning messages are logged but execution continues

### Snapshot is Modified

**Problem**: Snapshot file is changed when vector DB is unavailable

**Solution**: Verify the logic in `verifyCollections()`:
- Check that `validCodebases.length === this.indexedCodebases.length` when vector DB errors occur
- Ensure snapshot is only saved if collections are actually removed (not when verification fails)

### No Warning Messages

**Problem**: No warnings logged when vector DB is unavailable

**Solution**: Check console output:
- Look for `[SNAPSHOT-DEBUG]` log messages
- Verify `console.warn()` is called with appropriate messages
- Check that error details are included in warnings

## Automated Test

For automated testing, use:
```bash
npx tsx src/__tests__/verify-vector-db-unavailable-test.ts /tmp/test-codebase-unavailable
```

This will:
- Create a test codebase
- Index it with working vector DB
- Simulate vector DB unavailability
- Verify graceful handling
- Clean up test artifacts

#!/usr/bin/env tsx

/**
 * Integration Verification Script for Deleted Collection Detection
 *
 * This script verifies that:
 * 1. A codebase can be indexed
 * 2. The snapshot contains the codebase path
 * 3. When collection is manually deleted, the system detects it
 * 4. After restart (new SnapshotManager instance), the codebase is removed from snapshot
 * 5. Search operations return 'not indexed' error for that codebase
 *
 * Usage:
 *   npx tsx src/__tests__/verify-deleted-collection-test.ts <codebase-path>
 *
 * Example:
 *   npx tsx src/__tests__/verify-deleted-collection-test.ts /tmp/test-codebase
 */

import { Context } from "@dexus1985/claude-context-core";
import { LanceDBVectorDatabase } from "@dexus1985/claude-context-core";
import { SnapshotManager } from "../snapshot.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface TestResult {
    step: string;
    passed: boolean;
    details: string;
    error?: string;
}

const results: TestResult[] = [];

function logResult(step: string, passed: boolean, details: string, error?: string) {
    const result: TestResult = { step, passed, details, error };
    results.push(result);

    const icon = passed ? '✅' : '❌';
    console.log(`${icon} ${step}: ${passed ? 'PASSED' : 'FAILED'}`);
    console.log(`   ${details}`);
    if (error) {
        console.log(`   Error: ${error}`);
    }
    console.log('');
}

async function runIntegrationTest(codebasePath: string) {
    console.log('=== Integration Test: Deleted Collection Detection ===\n');
    console.log(`Testing codebase: ${codebasePath}\n`);

    // Verify codebase exists
    if (!fs.existsSync(codebasePath)) {
        logResult('Prerequisites', false, `Codebase path does not exist: ${codebasePath}`);
        printSummary();
        process.exit(1);
    }
    logResult('Prerequisites', true, `Codebase path exists: ${codebasePath}`);

    // Setup test environment
    const testDir = path.join(os.tmpdir(), `.context-deleted-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    const testSnapshotDir = path.join(testDir, 'snapshot');
    fs.mkdirSync(testSnapshotDir, { recursive: true });

    const testLancedbDir = path.join(testDir, 'lancedb');
    fs.mkdirSync(testLancedbDir, { recursive: true });

    const testSnapshotPath = path.join(testSnapshotDir, 'mcp-codebase-snapshot.json');

    try {
        // Step 1: Initialize Context and Index Codebase
        console.log('--- Step 1: Initialize Context and Index Codebase ---\n');

        const vectorDatabase = new LanceDBVectorDatabase({
            uri: testLancedbDir
        });

        const context = new Context({
            vectorDatabase
        });

        const snapshotManager = new SnapshotManager(context);
        (snapshotManager as any).snapshotFilePath = testSnapshotPath;

        try {
            await context.indexCodebase(codebasePath);
            logResult('Step 1: Index Codebase', true, `Successfully indexed ${codebasePath}`);
        } catch (error) {
            logResult('Step 1: Index Codebase', false, `Failed to index codebase`, (error as Error).message);
            printSummary();
            process.exit(1);
        }

        // Step 2: Verify Collection Exists
        console.log('--- Step 2: Verify Collection Created ---\n');

        const hasIndex = await context.hasIndex(codebasePath);
        if (hasIndex) {
            logResult('Step 2: Collection Created', true, 'Collection exists in vector DB');
        } else {
            logResult('Step 2: Collection Created', false, 'Collection does not exist in vector DB');
            printSummary();
            process.exit(1);
        }

        // Get collection name for later use
        const collectionName = (context as any).getCollectionName(codebasePath);
        console.log(`Collection name: ${collectionName}\n`);

        // Step 3: Add to Snapshot
        console.log('--- Step 3: Add to Snapshot ---\n');

        (snapshotManager as any).indexedCodebases = [codebasePath];
        await snapshotManager['saveCodebaseSnapshot']();

        const snapshotData1 = JSON.parse(fs.readFileSync(testSnapshotPath, 'utf8'));
        if (snapshotData1.indexedCodebases.includes(codebasePath)) {
            logResult('Step 3: Snapshot Updated', true, 'Codebase path added to snapshot');
        } else {
            logResult('Step 3: Snapshot Updated', false, 'Codebase path not found in snapshot');
            printSummary();
            process.exit(1);
        }

        // Step 4: Manually Delete Collection
        console.log('--- Step 4: Manually Delete Collection ---\n');

        try {
            await vectorDatabase.dropCollection(collectionName);
            logResult('Step 4: Collection Deleted', true, `Collection '${collectionName}' deleted from vector DB`);
        } catch (error) {
            logResult('Step 4: Collection Deleted', false, `Failed to delete collection`, (error as Error).message);
            printSummary();
            process.exit(1);
        }

        // Verify collection is gone
        const hasIndexAfterDeletion = await context.hasIndex(codebasePath);
        if (!hasIndexAfterDeletion) {
            logResult('Step 4: Collection Gone', true, 'Collection no longer exists in vector DB');
        } else {
            logResult('Step 4: Collection Gone', false, 'Collection still exists (deletion failed)');
            printSummary();
            process.exit(1);
        }

        // Step 5: Simulate Server Restart (New SnapshotManager Instance)
        console.log('--- Step 5: Simulate Server Restart ---\n');

        const restartedSnapshotManager = new SnapshotManager(context);
        (restartedSnapshotManager as any).snapshotFilePath = testSnapshotPath;

        await restartedSnapshotManager.loadCodebaseSnapshot();

        const loadedCodebases = restartedSnapshotManager.getIndexedCodebases();
        if (loadedCodebases.includes(codebasePath)) {
            logResult('Step 5: Load Snapshot on Restart', true, 'Snapshot loaded successfully, codebase found (before verification)');
        } else {
            logResult('Step 5: Load Snapshot on Restart', false, 'Snapshot loaded but codebase not found');
            printSummary();
            process.exit(1);
        }

        // Step 6: Verify Collections (Should Detect Missing Collection)
        console.log('--- Step 6: Verify Collections (Should Detect Missing) ---\n');

        await restartedSnapshotManager.verifyCollections();

        const finalCodebases = restartedSnapshotManager.getIndexedCodebases();
        if (!finalCodebases.includes(codebasePath)) {
            logResult('Step 6: Missing Collection Detected', true, 'Codebase removed from snapshot after verification');
        } else {
            logResult('Step 6: Missing Collection Detected', false, 'Codebase still in snapshot (should have been removed)');
            printSummary();
            process.exit(1);
        }

        // Step 7: Verify Snapshot File Updated
        console.log('--- Step 7: Verify Snapshot File Updated ---\n');

        const snapshotData2 = JSON.parse(fs.readFileSync(testSnapshotPath, 'utf8'));
        if (!snapshotData2.indexedCodebases.includes(codebasePath)) {
            logResult('Step 7: Snapshot File Updated', true, 'Snapshot file no longer contains codebase');
        } else {
            logResult('Step 7: Snapshot File Updated', false, 'Snapshot file still contains codebase');
            printSummary();
            process.exit(1);
        }

        // Step 8: Verify Search Returns Empty Results (Collection Not Found)
        console.log('--- Step 8: Verify Search Returns Empty Results ---\n');

        // Try to search - should return empty array since collection doesn't exist
        const searchResults = await context.semanticSearch(codebasePath, 'test query');
        if (searchResults.length === 0) {
            logResult('Step 8: Search Returns Empty', true, 'Search correctly returns empty results for deleted collection');
        } else {
            logResult('Step 8: Search Returns Empty', false, 'Search returned results when collection was deleted', `Got ${searchResults.length} results`);
            printSummary();
            process.exit(1);
        }

        // Print summary
        printSummary();

        // Cleanup
        console.log('\n--- Cleanup ---\n');
        fs.rmSync(testDir, { recursive: true, force: true });
        console.log('Test files cleaned up successfully.\n');

        // Exit with success
        const allPassed = results.every(r => r.passed);
        process.exit(allPassed ? 0 : 1);

    } catch (error) {
        logResult('Unexpected Error', false, 'An unexpected error occurred', (error as Error).message);
        console.error(error);
        printSummary();

        // Cleanup on error
        try {
            fs.rmSync(testDir, { recursive: true, force: true });
        } catch {
            // Ignore cleanup errors
        }

        process.exit(1);
    }
}

function printSummary() {
    console.log('=== Test Summary ===\n');

    const passed = results.filter(r => r.passed).length;
    const total = results.length;

    results.forEach(result => {
        const icon = result.passed ? '✅' : '❌';
        console.log(`${icon} ${result.step}: ${result.passed ? 'PASSED' : 'FAILED'}`);
    });

    console.log(`\nTotal: ${passed}/${total} tests passed`);

    if (passed === total) {
        console.log('\n🎉 All integration tests passed!');
        console.log('\nVerification confirms:');
        console.log('- Codebase indexing works correctly');
        console.log('- Collections can be manually deleted from vector DB');
        console.log('- Collection verification detects missing collections');
        console.log('- Missing collections are removed from snapshot');
        console.log('- Snapshot is updated and persisted after cleanup');
        console.log('- Search operations fail gracefully for removed collections');
    } else {
        console.log('\n❌ Some integration tests failed.');
        console.log('Please review the errors above and fix the issues.');
    }
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
    console.error('Usage: npx tsx src/__tests__/verify-deleted-collection-test.ts <codebase-path>');
    console.error('Example: npx tsx src/__tests__/verify-deleted-collection-test.ts /tmp/test-codebase');
    process.exit(1);
}

const codebasePath = args[0];

runIntegrationTest(codebasePath);

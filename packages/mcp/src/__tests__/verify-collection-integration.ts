#!/usr/bin/env tsx

/**
 * Integration Verification Script for Collection Persistence
 *
 * This script verifies that:
 * 1. A codebase can be indexed
 * 2. The snapshot contains the codebase path
 * 3. After restart (new SnapshotManager instance), the collection still exists
 * 4. The snapshot still contains the codebase after verification
 *
 * Usage:
 *   npx tsx src/__tests__/verify-collection-integration.ts <codebase-path>
 *
 * Example:
 *   npx tsx src/__tests__/verify-collection-integration.ts /tmp/test-codebase
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
    console.log('=== Integration Test: Collection Persistence ===\n');
    console.log(`Testing codebase: ${codebasePath}\n`);

    // Verify codebase exists
    if (!fs.existsSync(codebasePath)) {
        logResult('Prerequisites', false, `Codebase path does not exist: ${codebasePath}`);
        printSummary();
        process.exit(1);
    }
    logResult('Prerequisites', true, `Codebase path exists: ${codebasePath}`);

    // Setup test environment
    const testDir = path.join(os.tmpdir(), `.context-verify-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    const testSnapshotDir = path.join(testDir, 'snapshot');
    fs.mkdirSync(testSnapshotDir, { recursive: true });

    const testLancedbDir = path.join(testDir, 'lancedb');
    fs.mkdirSync(testLancedbDir, { recursive: true });

    const testSnapshotPath = path.join(testSnapshotDir, 'mcp-codebase-snapshot.json');

    try {
        // Step 1: Initialize Context and SnapshotManager
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

        // Step 4: Simulate Server Restart (New SnapshotManager Instance)
        console.log('--- Step 4: Simulate Server Restart ---\n');

        const restartedSnapshotManager = new SnapshotManager(context);
        (restartedSnapshotManager as any).snapshotFilePath = testSnapshotPath;

        await restartedSnapshotManager.loadCodebaseSnapshot();

        const loadedCodebases = restartedSnapshotManager.getIndexedCodebases();
        if (loadedCodebases.includes(codebasePath)) {
            logResult('Step 4: Load Snapshot on Restart', true, 'Snapshot loaded successfully, codebase found');
        } else {
            logResult('Step 4: Load Snapshot on Restart', false, 'Snapshot loaded but codebase not found');
            printSummary();
            process.exit(1);
        }

        // Step 5: Verify Collections After Restart
        console.log('--- Step 5: Verify Collections After Restart ---\n');

        await restartedSnapshotManager.verifyCollections();

        const hasIndexAfterRestart = await context.hasIndex(codebasePath);
        if (hasIndexAfterRestart) {
            logResult('Step 5: Collection Still Exists', true, 'Collection verified after restart');
        } else {
            logResult('Step 5: Collection Still Exists', false, 'Collection missing after restart');
            printSummary();
            process.exit(1);
        }

        // Step 6: Verify Snapshot After Verification
        console.log('--- Step 6: Verify Snapshot After Verification ---\n');

        const finalCodebases = restartedSnapshotManager.getIndexedCodebases();
        if (finalCodebases.includes(codebasePath)) {
            logResult('Step 6: Snapshot After Verification', true, 'Codebase still in snapshot after verification');
        } else {
            logResult('Step 6: Snapshot After Verification', false, 'Codebase removed from snapshot (should not happen)');
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
        console.log('- Collections are created in vector DB');
        console.log('- Snapshot persistence works across restarts');
        console.log('- Collection verification works correctly');
        console.log('- Valid collections are preserved after verification');
    } else {
        console.log('\n❌ Some integration tests failed.');
        console.log('Please review the errors above and fix the issues.');
    }
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
    console.error('Usage: npx tsx src/__tests__/verify-collection-integration.ts <codebase-path>');
    console.error('Example: npx tsx src/__tests__/verify-collection-integration.ts /tmp/test-codebase');
    process.exit(1);
}

const codebasePath = args[0];

runIntegrationTest(codebasePath);

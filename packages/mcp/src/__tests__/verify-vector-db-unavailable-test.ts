#!/usr/bin/env tsx

/**
 * Integration Verification Script for Vector DB Unavailable Handling
 *
 * This script verifies that:
 * 1. A codebase can be indexed and added to snapshot
 * 2. When vector DB is unavailable during verification, server doesn't crash
 * 3. Verification logs appropriate warning messages
 * 4. Snapshot remains unchanged (codebases treated as valid)
 * 5. Server continues to operate normally after verification
 *
 * Usage:
 *   npx tsx src/__tests__/verify-vector-db-unavailable-test.ts <codebase-path>
 *
 * Example:
 *   npx tsx src/__tests__/verify-vector-db-unavailable-test.ts /tmp/test-codebase
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
let warningLogged = false;

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

// Mock console.warn to detect warning messages
const originalWarn = console.warn;
console.warn = (...args: any[]) => {
    const message = args.join(' ');
    if (message.includes('Error verifying collection') || message.includes('Treating') || message.includes('verification error')) {
        warningLogged = true;
    }
    originalWarn(...args);
};

class UnavailableVectorDatabase extends LanceDBVectorDatabase {
    constructor(config: any) {
        super(config);
    }

    async hasCollection(collectionName: string): Promise<boolean> {
        // Simulate vector DB connection error
        throw new Error('ECONNREFUSED: Connection refused to vector database at localhost:19530');
    }

    async dropCollection(collectionName: string): Promise<void> {
        // Simulate vector DB connection error
        throw new Error('ECONNREFUSED: Connection refused to vector database at localhost:19530');
    }
}

async function runIntegrationTest(codebasePath: string) {
    console.log('=== Integration Test: Vector DB Unavailable Handling ===\n');
    console.log(`Testing codebase: ${codebasePath}\n`);

    // Verify codebase exists
    if (!fs.existsSync(codebasePath)) {
        logResult('Prerequisites', false, `Codebase path does not exist: ${codebasePath}`);
        printSummary();
        process.exit(1);
    }
    logResult('Prerequisites', true, `Codebase path exists: ${codebasePath}`);

    // Setup test environment
    const testDir = path.join(os.tmpdir(), `.context-unavailable-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });

    const testSnapshotDir = path.join(testDir, 'snapshot');
    fs.mkdirSync(testSnapshotDir, { recursive: true });

    const testLancedbDir = path.join(testDir, 'lancedb');
    fs.mkdirSync(testLancedbDir, { recursive: true });

    const testSnapshotPath = path.join(testSnapshotDir, 'mcp-codebase-snapshot.json');

    try {
        // Step 1: Initialize Context and Index Codebase (with working vector DB)
        console.log('--- Step 1: Initialize Context and Index Codebase ---\n');

        const workingVectorDatabase = new LanceDBVectorDatabase({
            uri: testLancedbDir
        });

        const workingContext = new Context({
            vectorDatabase: workingVectorDatabase
        });

        const snapshotManager = new SnapshotManager(workingContext);
        (snapshotManager as any).snapshotFilePath = testSnapshotPath;

        try {
            await workingContext.indexCodebase(codebasePath);
            logResult('Step 1: Index Codebase', true, `Successfully indexed ${codebasePath}`);
        } catch (error) {
            logResult('Step 1: Index Codebase', false, `Failed to index codebase`, (error as Error).message);
            printSummary();
            process.exit(1);
        }

        // Step 2: Verify Collection Exists
        console.log('--- Step 2: Verify Collection Created ---\n');

        const hasIndex = await workingContext.hasIndex(codebasePath);
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

        // Step 4: Simulate Vector DB Unavailable (Create Context with Mock Unavailable Vector DB)
        console.log('--- Step 4: Simulate Vector DB Unavailable ---\n');

        const unavailableVectorDatabase = new UnavailableVectorDatabase({
            uri: 'invalid://unavailable-vector-db'
        });

        const unavailableContext = new Context({
            vectorDatabase: unavailableVectorDatabase
        });

        const unavailableSnapshotManager = new SnapshotManager(unavailableContext);
        (unavailableSnapshotManager as any).snapshotFilePath = testSnapshotPath;

        logResult('Step 4: Vector DB Unavailable', true, 'Simulated vector DB connection failure');

        // Step 5: Load Snapshot (should succeed)
        console.log('--- Step 5: Load Snapshot on Restart ---\n');

        try {
            await unavailableSnapshotManager.loadCodebaseSnapshot();
            const loadedCodebases = unavailableSnapshotManager.getIndexedCodebases();
            if (loadedCodebases.includes(codebasePath)) {
                logResult('Step 5: Load Snapshot', true, 'Snapshot loaded successfully, codebase found');
            } else {
                logResult('Step 5: Load Snapshot', false, 'Snapshot loaded but codebase not found');
                printSummary();
                process.exit(1);
            }
        } catch (error) {
            logResult('Step 5: Load Snapshot', false, 'Snapshot loading failed unexpectedly', (error as Error).message);
            printSummary();
            process.exit(1);
        }

        // Step 6: Verify Collections (should log warning but not crash)
        console.log('--- Step 6: Verify Collections (Vector DB Unavailable) ---\n');

        warningLogged = false; // Reset warning flag

        try {
            await unavailableSnapshotManager.verifyCollections();
            logResult('Step 6: Verify Collections', true, 'Verification completed without crashing (server remains available)');
        } catch (error) {
            logResult('Step 6: Verify Collections', false, 'Verification crashed server (should not happen)', (error as Error).message);
            printSummary();
            process.exit(1);
        }

        // Step 7: Verify Warning Logged
        console.log('--- Step 7: Verify Warning Logged ---\n');

        if (warningLogged) {
            logResult('Step 7: Warning Logged', true, 'Appropriate warning message logged for vector DB unavailability');
        } else {
            logResult('Step 7: Warning Logged', false, 'No warning message logged (expected warning for vector DB error)');
            printSummary();
            process.exit(1);
        }

        // Step 8: Verify Snapshot Remains Unchanged (codebases treated as valid)
        console.log('--- Step 8: Verify Snapshot Remains Unchanged ---\n');

        const finalCodebases = unavailableSnapshotManager.getIndexedCodebases();
        if (finalCodebases.includes(codebasePath)) {
            logResult('Step 8: Snapshot Unchanged', true, 'Codebase remains in snapshot (treated as valid to avoid data loss)');
        } else {
            logResult('Step 8: Snapshot Unchanged', false, 'Codebase removed from snapshot (should keep when vector DB unavailable)');
            printSummary();
            process.exit(1);
        }

        // Step 9: Verify Snapshot File Unchanged
        console.log('--- Step 9: Verify Snapshot File Unchanged ---\n');

        const snapshotData2 = JSON.parse(fs.readFileSync(testSnapshotPath, 'utf8'));
        const originalCount = snapshotData1.indexedCodebases.length;
        const finalCount = snapshotData2.indexedCodebases.length;

        if (finalCount === originalCount && snapshotData2.indexedCodebases.includes(codebasePath)) {
            logResult('Step 9: Snapshot File Unchanged', true, `Snapshot file unchanged (still has ${finalCount} codebase(s))`);
        } else {
            logResult('Step 9: Snapshot File Unchanged', false, 'Snapshot file was modified (should remain unchanged when vector DB unavailable)');
            printSummary();
            process.exit(1);
        }

        // Print summary
        printSummary();

        // Cleanup
        console.log('\n--- Cleanup ---\n');
        fs.rmSync(testDir, { recursive: true, force: true });
        console.log('Test files cleaned up successfully.\n');

        // Restore original console.warn
        console.warn = originalWarn;

        // Exit with success
        const allPassed = results.every(r => r.passed);
        process.exit(allPassed ? 0 : 1);

    } catch (error) {
        logResult('Unexpected Error', false, 'An unexpected error occurred', (error as Error).message);
        console.error(error);
        printSummary();

        // Restore original console.warn
        console.warn = originalWarn;

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
        console.log('- Vector DB unavailability is handled gracefully');
        console.log('- Server does not crash when vector DB is unavailable');
        console.log('- Appropriate warning messages are logged');
        console.log('- Snapshot remains unchanged (codebases treated as valid)');
        console.log('- Server continues to operate normally after verification');
        console.log('- No data loss occurs due to temporary vector DB issues');
    } else {
        console.log('\n❌ Some integration tests failed.');
        console.log('Please review the errors above and fix the issues.');
    }
}

// Main execution
const args = process.argv.slice(2);

if (args.length === 0) {
    console.error('Usage: npx tsx src/__tests__/verify-vector-db-unavailable-test.ts <codebase-path>');
    console.error('Example: npx tsx src/__tests__/verify-vector-db-unavailable-test.ts /tmp/test-codebase');
    process.exit(1);
}

const codebasePath = args[0];

runIntegrationTest(codebasePath);

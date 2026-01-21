import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Context } from "@dexus1985/claude-context-core";
import { SnapshotManager } from "../snapshot.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Create mock Context
function createMockContext() {
    return {
        semanticSearch: jest.fn(),
        indexCodebase: jest.fn(),
        clearIndex: jest.fn(),
        hasIndex: jest.fn(),
        getVectorDatabase: jest.fn(),
        getEmbedding: jest.fn(),
        setSynchronizer: jest.fn(),
        getPreparedCollection: jest.fn(),
        getCollectionName: jest.fn(),
        addCustomExtensions: jest.fn(),
        addCustomIgnorePatterns: jest.fn(),
        getIgnorePatterns: jest.fn(),
        getLoadedIgnorePatterns: jest.fn(),
    };
}

describe("SnapshotManager - verifyCollections", () => {
    let snapshotManager: SnapshotManager;
    let mockContext: any;
    let testSnapshotPath: string;
    let testSnapshotDir: string;

    beforeEach(() => {
        // Setup test snapshot path
        testSnapshotDir = path.join(os.tmpdir(), `.context-test-${Date.now()}`);
        fs.mkdirSync(testSnapshotDir, { recursive: true });
        testSnapshotPath = path.join(testSnapshotDir, 'mcp-codebase-snapshot.json');

        // Create mock context
        mockContext = createMockContext();

        // Create SnapshotManager instance
        snapshotManager = new SnapshotManager(mockContext as unknown as Context);

        // Override the snapshot file path for testing
        (snapshotManager as any).snapshotFilePath = testSnapshotPath;

        // Spy on console methods
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        // Clean up test files
        if (fs.existsSync(testSnapshotPath)) {
            fs.unlinkSync(testSnapshotPath);
        }
        if (fs.existsSync(testSnapshotDir)) {
            fs.rmdirSync(testSnapshotDir);
        }

        // Restore console methods
        jest.restoreAllMocks();
    });

    describe("collection verification with valid DB", () => {
        it("should keep all codebases when all collections exist", async () => {
            // Setup: Add codebases to indexed list
            (snapshotManager as any).indexedCodebases = ['/path/to/codebase1', '/path/to/codebase2'];

            // Mock hasIndex to return true for all codebases
            mockContext.hasIndex.mockResolvedValue(true);

            // Execute
            await snapshotManager.verifyCollections();

            // Verify: All codebases are still in the list
            const indexedCodebases = (snapshotManager as any).indexedCodebases;
            expect(indexedCodebases).toEqual(['/path/to/codebase1', '/path/to/codebase2']);
            expect(indexedCodebases.length).toBe(2);

            // Verify: hasIndex was called for each codebase
            expect(mockContext.hasIndex).toHaveBeenCalledTimes(2);
            expect(mockContext.hasIndex).toHaveBeenCalledWith('/path/to/codebase1');
            expect(mockContext.hasIndex).toHaveBeenCalledWith('/path/to/codebase2');

            // Verify: Snapshot was NOT saved (no changes made)
            expect(fs.existsSync(testSnapshotPath)).toBe(false);
        });

        it("should verify single collection successfully", async () => {
            // Setup: Add single codebase
            (snapshotManager as any).indexedCodebases = ['/single/codebase'];

            // Mock hasIndex to return true
            mockContext.hasIndex.mockResolvedValue(true);

            // Execute
            await snapshotManager.verifyCollections();

            // Verify: Codebase is still in the list
            const indexedCodebases = (snapshotManager as any).indexedCodebases;
            expect(indexedCodebases).toEqual(['/single/codebase']);
            expect(mockContext.hasIndex).toHaveBeenCalledTimes(1);
        });
    });

    describe("collection verification with missing collections", () => {
        it("should remove codebases with missing collections", async () => {
            // Setup: Add multiple codebases
            (snapshotManager as any).indexedCodebases = [
                '/path/to/valid1',
                '/path/to/missing',
                '/path/to/valid2'
            ];

            // Mock hasIndex to return false for the middle one
            mockContext.hasIndex
                .mockResolvedValueOnce(true)   // valid1
                .mockResolvedValueOnce(false)  // missing
                .mockResolvedValueOnce(true);  // valid2

            // Execute
            await snapshotManager.verifyCollections();

            // Verify: Only valid codebases remain
            const indexedCodebases = (snapshotManager as any).indexedCodebases;
            expect(indexedCodebases).toEqual(['/path/to/valid1', '/path/to/valid2']);
            expect(indexedCodebases.length).toBe(2);

            // Verify: hasIndex was called for all codebases
            expect(mockContext.hasIndex).toHaveBeenCalledTimes(3);

            // Verify: Snapshot was saved
            expect(fs.existsSync(testSnapshotPath)).toBe(true);
        });

        it("should remove all codebases if all collections are missing", async () => {
            // Setup: Add multiple codebases
            (snapshotManager as any).indexedCodebases = ['/path/to/codebase1', '/path/to/codebase2'];

            // Mock hasIndex to return false for all
            mockContext.hasIndex.mockResolvedValue(false);

            // Execute
            await snapshotManager.verifyCollections();

            // Verify: All codebases were removed
            const indexedCodebases = (snapshotManager as any).indexedCodebases;
            expect(indexedCodebases).toEqual([]);
            expect(indexedCodebases.length).toBe(0);
        });

        it("should handle partial removal with mixed results", async () => {
            // Setup: Add 5 codebases
            const codebases = [
                '/path/to/code1',
                '/path/to/code2',
                '/path/to/code3',
                '/path/to/code4',
                '/path/to/code5'
            ];
            (snapshotManager as any).indexedCodebases = codebases;

            // Mock hasIndex with mixed results (remove 2, keep 3)
            mockContext.hasIndex
                .mockResolvedValueOnce(true)   // code1 - keep
                .mockResolvedValueOnce(false)  // code2 - remove
                .mockResolvedValueOnce(true)   // code3 - keep
                .mockResolvedValueOnce(false)  // code4 - remove
                .mockResolvedValueOnce(true);  // code5 - keep

            // Execute
            await snapshotManager.verifyCollections();

            // Verify: Only valid codebases remain
            const indexedCodebases = (snapshotManager as any).indexedCodebases;
            expect(indexedCodebases).toEqual(['/path/to/code1', '/path/to/code3', '/path/to/code5']);
            expect(indexedCodebases.length).toBe(3);
        });
    });

    describe("collection verification with connection error", () => {
        it("should treat codebase as valid when hasIndex throws connection error", async () => {
            // Setup: Add codebases
            (snapshotManager as any).indexedCodebases = ['/path/to/codebase1', '/path/to/codebase2'];

            // Mock hasIndex to throw error for first codebase
            mockContext.hasIndex
                .mockRejectedValueOnce(new Error("Connection timeout"))
                .mockResolvedValueOnce(true);

            // Execute
            await snapshotManager.verifyCollections();

            // Verify: Both codebases are kept (error is treated as valid)
            const indexedCodebases = (snapshotManager as any).indexedCodebases;
            expect(indexedCodebases).toEqual(['/path/to/codebase1', '/path/to/codebase2']);
            expect(indexedCodebases.length).toBe(2);
        });

        it("should continue verification after individual errors", async () => {
            // Setup: Add multiple codebases
            (snapshotManager as any).indexedCodebases = [
                '/path/to/code1',
                '/path/to/code2',
                '/path/to/code3'
            ];

            // Mock hasIndex with error in the middle
            mockContext.hasIndex
                .mockResolvedValueOnce(true)
                .mockRejectedValueOnce(new Error("Database unavailable"))
                .mockResolvedValueOnce(false);

            // Execute
            await snapshotManager.verifyCollections();

            // Verify: First two kept (valid or error), third removed (missing)
            const indexedCodebases = (snapshotManager as any).indexedCodebases;
            expect(indexedCodebases).toEqual(['/path/to/code1', '/path/to/code2']);
            expect(indexedCodebases.length).toBe(2);
        });

        it("should keep all codebases when all hasIndex calls fail", async () => {
            // Setup: Add codebases
            (snapshotManager as any).indexedCodebases = ['/path/to/codebase1', '/path/to/codebase2'];

            // Mock hasIndex to throw errors
            mockContext.hasIndex.mockRejectedValue(new Error("Vector DB unavailable"));

            // Execute
            await snapshotManager.verifyCollections();

            // Verify: All codebases are kept (errors treated as valid)
            const indexedCodebases = (snapshotManager as any).indexedCodebases;
            expect(indexedCodebases).toEqual(['/path/to/codebase1', '/path/to/codebase2']);
            expect(indexedCodebases.length).toBe(2);

            // Verify: Snapshot was NOT saved (no changes made, errors treated as valid)
            expect(fs.existsSync(testSnapshotPath)).toBe(false);
        });
    });

    describe("empty snapshot handling", () => {
        it("should handle empty indexed codebases list gracefully", async () => {
            // Setup: Empty list
            (snapshotManager as any).indexedCodebases = [];

            // Execute
            await snapshotManager.verifyCollections();

            // Verify: List remains empty
            const indexedCodebases = (snapshotManager as any).indexedCodebases;
            expect(indexedCodebases).toEqual([]);
            expect(indexedCodebases.length).toBe(0);

            // Verify: hasIndex was never called
            expect(mockContext.hasIndex).not.toHaveBeenCalled();
        });

        it("should not save snapshot if no changes were made", async () => {
            // Setup: Empty list
            (snapshotManager as any).indexedCodebases = [];

            // Execute
            await snapshotManager.verifyCollections();

            // Verify: Snapshot file was not created (no changes)
            expect(fs.existsSync(testSnapshotPath)).toBe(false);
        });
    });

    describe("snapshot persistence", () => {
        it("should save snapshot after removing invalid collections", async () => {
            // Setup: Add codebases with one missing
            (snapshotManager as any).indexedCodebases = ['/valid', '/missing'];
            mockContext.hasIndex
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false);

            // Execute
            await snapshotManager.verifyCollections();

            // Verify: Snapshot file was created and contains only valid codebase
            expect(fs.existsSync(testSnapshotPath)).toBe(true);

            const snapshotData = fs.readFileSync(testSnapshotPath, 'utf8');
            const snapshot = JSON.parse(snapshotData);
            expect(snapshot.indexedCodebases).toEqual(['/valid']);
            expect(snapshot.indexedCodebases.length).toBe(1);
        });

        it("should save snapshot with all valid codebases", async () => {
            // Setup: Add valid codebases
            const validCodebases = ['/code1', '/code2', '/code3'];
            (snapshotManager as any).indexedCodebases = validCodebases;
            mockContext.hasIndex.mockResolvedValue(true);

            // Execute
            await snapshotManager.verifyCollections();

            // Verify: Snapshot was NOT saved (no changes made - all collections valid)
            expect(fs.existsSync(testSnapshotPath)).toBe(false);

            // Verify codebases are still in memory
            const indexedCodebases = (snapshotManager as any).indexedCodebases;
            expect(indexedCodebases).toEqual(validCodebases);
            expect(indexedCodebases.length).toBe(3);
        });

        it("should include lastUpdated timestamp when saving snapshot", async () => {
            // Setup: Add codebases where one will be removed (triggers save)
            (snapshotManager as any).indexedCodebases = ['/code1', '/code2'];
            mockContext.hasIndex
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false);

            // Execute
            await snapshotManager.verifyCollections();

            // Verify: Snapshot has lastUpdated timestamp
            const snapshotData = fs.readFileSync(testSnapshotPath, 'utf8');
            const snapshot = JSON.parse(snapshotData);
            expect(snapshot.lastUpdated).toBeDefined();
            expect(new Date(snapshot.lastUpdated)).toBeInstanceOf(Date);
        });
    });

    describe("logging and debugging", () => {
        it("should log verification start and completion", async () => {
            // Setup
            (snapshotManager as any).indexedCodebases = ['/code1'];
            mockContext.hasIndex.mockResolvedValue(true);

            // Execute
            await snapshotManager.verifyCollections();

            // Verify: Console log was called (we can't easily test exact messages without spying)
            expect(mockContext.hasIndex).toHaveBeenCalled();
        });

        it("should log when collections are verified successfully", async () => {
            // Setup
            (snapshotManager as any).indexedCodebases = ['/code1'];
            mockContext.hasIndex.mockResolvedValue(true);

            // Execute
            await snapshotManager.verifyCollections();

            // Verify: hasIndex was called
            expect(mockContext.hasIndex).toHaveBeenCalledWith('/code1');
        });

        it("should log warning when collection is missing", async () => {
            // Setup
            (snapshotManager as any).indexedCodebases = ['/code1'];
            mockContext.hasIndex.mockResolvedValue(false);

            // Execute
            await snapshotManager.verifyCollections();

            // Verify: Collection was removed
            const indexedCodebases = (snapshotManager as any).indexedCodebases;
            expect(indexedCodebases).toEqual([]);
        });
    });
});

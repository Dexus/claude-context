/**
 * Integration Tests for File Watching and Auto Re-indexing Workflow
 *
 * These tests verify the end-to-end functionality of file watching,
 * change detection, and automatic re-indexing in the Context class.
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { CodeChunk } from '../../splitter';

// Mock langchain-splitter before any imports that use it
jest.mock('../../splitter/langchain-splitter', () => ({
    LangChainCodeSplitter: class MockLangChainCodeSplitter {
        private chunkSize: number = 1000;
        private chunkOverlap: number = 200;

        constructor(chunkSize?: number, chunkOverlap?: number) {
            if (chunkSize) this.chunkSize = chunkSize;
            if (chunkOverlap) this.chunkOverlap = chunkOverlap;
        }

        async split(code: string, language: string, filePath?: string): Promise<CodeChunk[]> {
            const lines = code.split('\n');
            return [{
                content: code,
                metadata: {
                    startLine: 1,
                    endLine: lines.length,
                    language,
                    filePath,
                }
            }];
        }

        setChunkSize(chunkSize: number): void {
            this.chunkSize = chunkSize;
        }

        setChunkOverlap(chunkOverlap: number): void {
            this.chunkOverlap = chunkOverlap;
        }
    }
}));

// Mock the ast-splitter module to add the getSupportedLanguages static method
jest.mock('../../splitter/ast-splitter', () => {
    const actual = jest.requireActual('../../splitter/ast-splitter');
    actual.AstCodeSplitter.getSupportedLanguages = () => ['typescript', 'javascript', 'python', 'java', 'cpp', 'c', 'go', 'rust'];
    return actual;
});

// Mock chokidar for integration tests
jest.mock('chokidar', () => {
    return jest.createMockFromModule('chokidar');
});

import { LanceDBVectorDatabase } from '../../vectordb/lancedb-vectordb';
import { Embedding, EmbeddingVector } from '../../embedding/base-embedding';
import { Context } from '../../context';
import { AstCodeSplitter } from '../../splitter/ast-splitter';
import * as chokidar from 'chokidar';

// Mock environment manager to control settings
jest.mock('../../utils/env-manager', () => ({
    envManager: {
        get: jest.fn((key: string) => {
            const envMap: Record<string, string> = {
                'OPENAI_API_KEY': 'test-api-key',
                'HYBRID_MODE': 'false',
                'EMBEDDING_BATCH_SIZE': '10'
            };
            return envMap[key];
        })
    }
}));

/**
 * Mock Embedding class that generates deterministic vectors
 */
class MockEmbedding extends Embedding {
    private embeddingDimension: number;
    protected maxTokens: number = 8000;

    constructor(dimension: number = 128) {
        super();
        this.embeddingDimension = dimension;
    }

    private generateVector(text: string): number[] {
        const vector = new Array(this.embeddingDimension).fill(0);

        for (let i = 0; i < text.length && i < this.embeddingDimension; i++) {
            const charCode = text.charCodeAt(i);
            vector[i % this.embeddingDimension] += charCode / 1000;
        }

        const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        if (magnitude > 0) {
            for (let i = 0; i < vector.length; i++) {
                vector[i] = vector[i] / magnitude;
            }
        }

        return vector;
    }

    async embed(text: string): Promise<EmbeddingVector> {
        return {
            vector: this.generateVector(text),
            dimension: this.embeddingDimension
        };
    }

    async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
        return texts.map(text => ({
            vector: this.generateVector(text),
            dimension: this.embeddingDimension
        }));
    }

    getDimension(): number {
        return this.embeddingDimension;
    }

    getProvider(): string {
        return 'MockEmbedding';
    }

    async detectDimension(): Promise<number> {
        return this.embeddingDimension;
    }
}

describe('Integration: File Watching and Auto Re-indexing', () => {
    let tempDir: string;
    let codebaseDir: string;
    let dbDir: string;
    let context: Context;
    let vectorDb: LanceDBVectorDatabase;
    let mockEmbedding: MockEmbedding;

    // Suppress console output during tests
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;

    beforeAll(() => {
        console.log = jest.fn();
        console.warn = jest.fn();
        console.error = jest.fn();
    });

    afterAll(() => {
        console.log = originalConsoleLog;
        console.warn = originalConsoleWarn;
        console.error = originalConsoleError;
    });

    const createTempDir = async (): Promise<string> => {
        const dir = path.join(
            os.tmpdir(),
            `integration-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
        );
        await fs.ensureDir(dir);
        return dir;
    };

    const createTestCodebase = async (baseDir: string): Promise<void> => {
        await fs.ensureDir(path.join(baseDir, 'src'));

        await fs.writeFile(
            path.join(baseDir, 'src', 'index.ts'),
            `/**
 * Main entry point
 */
export function main(): void {
    console.log('Hello, World!');
}

export function calculateSum(a: number, b: number): number {
    return a + b;
}
`
        );

        await fs.writeFile(
            path.join(baseDir, 'src', 'utils.ts'),
            `/**
 * Utility functions
 */
export function formatDate(date: Date): string {
    return date.toISOString();
}
`
        );
    };

    beforeEach(async () => {
        // Setup chokidar mock
        const mockWatcher = {
            on: jest.fn(function(this: any, event: string, callback: any) {
                if (!this.handlers) {
                    this.handlers = {};
                }
                this.handlers[event] = callback;
                return this;
            }),
            close: jest.fn(async function(this: any) {
                this.closed = true;
            }),
            getWatched: jest.fn(function() {
                return {};
            }),
            handlers: {} as any,
            closed: false
        };

        (chokidar.watch as jest.Mock).mockReturnValue(mockWatcher);

        tempDir = await createTempDir();
        codebaseDir = path.join(tempDir, 'codebase');
        dbDir = path.join(tempDir, 'db');

        await fs.ensureDir(codebaseDir);
        await fs.ensureDir(dbDir);

        await createTestCodebase(codebaseDir);

        mockEmbedding = new MockEmbedding(128);
        vectorDb = new LanceDBVectorDatabase({ uri: dbDir });

        await (vectorDb as any).initializationPromise;

        context = new Context({
            embedding: mockEmbedding,
            vectorDatabase: vectorDb,
            codeSplitter: new AstCodeSplitter(500, 50),
            supportedExtensions: ['.ts', '.tsx', '.js', '.jsx'],
            ignorePatterns: ['node_modules/**', 'dist/**']
        });
    });

    afterEach(async () => {
        if (context.isWatching()) {
            await context.stopWatching();
        }
        if (tempDir) {
            await fs.remove(tempDir).catch(() => {});
        }
        jest.clearAllMocks();
    });

    /**
     * Helper to trigger a file change event through the mock watcher
     */
    const triggerFileEvent = async (eventType: string, filePath: string) => {
        const watchMock = chokidar.watch as jest.Mock;
        const mockWatcher = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
        if (mockWatcher && mockWatcher.handlers[eventType]) {
            mockWatcher.handlers[eventType](filePath);
        }
    };

    /**
     * Helper to trigger the ready event on the mock watcher
     */
    const triggerReadyEvent = async () => {
        const watchMock = chokidar.watch as jest.Mock;
        const mockWatcher = watchMock.mock.results[watchMock.mock.results.length - 1]?.value;
        if (mockWatcher && mockWatcher.handlers['ready']) {
            mockWatcher.handlers['ready']();
        }
    };

    describe('File Watching Workflow', () => {
        it('should start watching for file changes', async () => {
            await context.indexCodebase(codebaseDir);
            await context.startWatching(codebaseDir, undefined, 100);

            expect(context.isWatching()).toBe(true);

            await context.stopWatching();
        });

        it('should stop watching for file changes', async () => {
            await context.indexCodebase(codebaseDir);
            await context.startWatching(codebaseDir, undefined, 100);

            expect(context.isWatching()).toBe(true);

            await context.stopWatching();
            expect(context.isWatching()).toBe(false);
        });

        it('should not allow starting watcher twice without stopping', async () => {
            await context.indexCodebase(codebaseDir);
            await context.startWatching(codebaseDir, undefined, 100);

            expect(context.isWatching()).toBe(true);

            // Try to start again (should warn and return early)
            await context.startWatching(codebaseDir, undefined, 100);

            // Should still be watching (second start was ignored)
            expect(context.isWatching()).toBe(true);

            await context.stopWatching();
        });

        it('should handle stopping watcher when not watching', async () => {
            // Should not throw
            await expect(context.stopWatching()).resolves.not.toThrow();
        });

        it('should return watcher statistics', async () => {
            await context.indexCodebase(codebaseDir);
            await context.startWatching(codebaseDir, undefined, 100);

            const stats = context.getWatcherStats();

            expect(stats).not.toBeNull();
            expect(stats?.watchedFiles).toBeGreaterThanOrEqual(0);
            expect(stats?.startedAt).toBeGreaterThan(0);

            await context.stopWatching();
        });

        it('should return null stats when watcher is not running', () => {
            const stats = context.getWatcherStats();
            expect(stats).toBeNull();
        });
    });

    describe('Auto Re-indexing on File Changes', () => {
        it('should detect and reindex added files', async () => {
            // Initial indexing
            const initialResult = await context.indexCodebase(codebaseDir);
            expect(initialResult.indexedFiles).toBe(2); // index.ts and utils.ts

            // Start watching with short debounce
            await context.startWatching(codebaseDir, undefined, 100);

            // Wait for watcher to be ready
            await new Promise(resolve => setTimeout(resolve, 200));

            // Add a new file
            const newFilePath = path.join(codebaseDir, 'src', 'newFile.ts');
            await fs.writeFile(
                newFilePath,
                `/**
 * Newly added file
 */
export function newFunction(): void {
    console.log('New function');
}
`
            );

            // Trigger the add event manually
            await triggerFileEvent('add', newFilePath);

            // Wait for debounce and re-indexing
            await new Promise(resolve => setTimeout(resolve, 300));

            // Verify the new file was indexed
            const results = await context.semanticSearch(codebaseDir, 'new function', 5);
            expect(results.length).toBeGreaterThan(0);

            await context.stopWatching();
        });

        it('should detect and reindex modified files', async () => {
            // Initial indexing
            await context.indexCodebase(codebaseDir);

            // Start watching
            await context.startWatching(codebaseDir, undefined, 100);
            await triggerReadyEvent();
            await new Promise(resolve => setTimeout(resolve, 200));

            // Modify the file
            const filePath = path.join(codebaseDir, 'src', 'index.ts');
            await fs.writeFile(
                filePath,
                `/**
 * Modified entry point
 */
export function main(): void {
    console.log('Modified Hello, World!');
}

export function calculateSum(a: number, b: number): number {
    return a + b;
}

export function calculateDifference(a: number, b: number): number {
    return a - b;
}
`
            );

            // Trigger the change event manually
            await triggerFileEvent('change', filePath);

            // Wait for debounce and re-indexing
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify the watcher is still running and tracking events
            expect(context.isWatching()).toBe(true);
            const stats = context.getWatcherStats();
            expect(stats).not.toBeNull();
            expect(stats!.totalEvents).toBeGreaterThan(0);

            await context.stopWatching();
        });

        it('should detect and reindex deleted files', async () => {
            // Initial indexing
            await context.indexCodebase(codebaseDir);

            // Start watching
            await context.startWatching(codebaseDir, undefined, 100);
            await triggerReadyEvent();
            await new Promise(resolve => setTimeout(resolve, 200));

            // Delete a file
            const filePath = path.join(codebaseDir, 'src', 'utils.ts');
            await fs.remove(filePath);

            // Trigger the unlink event manually
            await triggerFileEvent('unlink', filePath);

            // Wait for debounce
            await new Promise(resolve => setTimeout(resolve, 500));

            // Verify the event was tracked
            const stats = context.getWatcherStats();
            expect(stats).not.toBeNull();
            expect(stats!.totalEvents).toBeGreaterThan(0);

            await context.stopWatching();
        });

        it('should handle multiple rapid file changes', async () => {
            // Initial indexing
            await context.indexCodebase(codebaseDir);

            // Start watching
            await context.startWatching(codebaseDir, undefined, 100);
            await new Promise(resolve => setTimeout(resolve, 200));

            // Make multiple rapid changes
            const file1Path = path.join(codebaseDir, 'src', 'file1.ts');
            const file2Path = path.join(codebaseDir, 'src', 'file2.ts');
            const file3Path = path.join(codebaseDir, 'src', 'file3.ts');

            await fs.writeFile(file1Path, `export function func1() { return 1; }`);
            await fs.writeFile(file2Path, `export function func2() { return 2; }`);
            await fs.writeFile(file3Path, `export function func3() { return 3; }`);

            // Trigger the add events manually
            await triggerFileEvent('add', file1Path);
            await triggerFileEvent('add', file2Path);
            await triggerFileEvent('add', file3Path);

            // Wait for debounce and re-indexing (should batch all changes)
            await new Promise(resolve => setTimeout(resolve, 300));

            // Search for all new functions
            const results1 = await context.semanticSearch(codebaseDir, 'func1', 5);
            const results2 = await context.semanticSearch(codebaseDir, 'func2', 5);
            const results3 = await context.semanticSearch(codebaseDir, 'func3', 5);

            expect(results1.length).toBeGreaterThan(0);
            expect(results2.length).toBeGreaterThan(0);
            expect(results3.length).toBeGreaterThan(0);

            await context.stopWatching();
        });
    });

    describe('Custom Change Callbacks', () => {
        it('should invoke custom callback on file changes', async () => {
            await context.indexCodebase(codebaseDir);

            const callback = jest.fn();
            await context.startWatching(codebaseDir, callback, 100);

            await new Promise(resolve => setTimeout(resolve, 200));

            // Create and trigger a file change
            const filePath = path.join(codebaseDir, 'src', 'changed.ts');
            await fs.writeFile(filePath, `export function changed() { return true; }`);
            await triggerFileEvent('add', filePath);

            // Wait for debounce
            await new Promise(resolve => setTimeout(resolve, 300));

            expect(callback).toHaveBeenCalled();

            await context.stopWatching();
        });

        it('should pass changed files and events to callback', async () => {
            await context.indexCodebase(codebaseDir);

            const callback = jest.fn();
            await context.startWatching(codebaseDir, callback, 100);

            await new Promise(resolve => setTimeout(resolve, 200));

            // Trigger changes
            const test1Path = path.join(codebaseDir, 'src', 'test1.ts');
            const test2Path = path.join(codebaseDir, 'src', 'test2.ts');

            await fs.writeFile(test1Path, `export function test1() { return 1; }`);
            await fs.writeFile(test2Path, `export function test2() { return 2; }`);

            await triggerFileEvent('add', test1Path);
            await triggerFileEvent('add', test2Path);

            await new Promise(resolve => setTimeout(resolve, 300));

            expect(callback).toHaveBeenCalledWith(
                expect.any(Set),
                expect.any(Array)
            );

            const changedFiles = callback.mock.calls[0][0] as Set<string>;
            expect(changedFiles.size).toBeGreaterThan(0);

            await context.stopWatching();
        });
    });

    describe('Ignore Patterns', () => {
        it('should ignore files matching ignore patterns', async () => {
            await context.indexCodebase(codebaseDir);
            await context.startWatching(codebaseDir, undefined, 100);
            await triggerReadyEvent();

            await new Promise(resolve => setTimeout(resolve, 200));

            // Create a file in node_modules (should be ignored)
            await fs.ensureDir(path.join(codebaseDir, 'node_modules', 'test'));
            const ignoredPath = path.join(codebaseDir, 'node_modules', 'test', 'ignored.ts');
            await fs.writeFile(ignoredPath, `export function specialIgnoredFunction() { return true; }`);

            // Trigger an event for the ignored file
            await triggerFileEvent('add', ignoredPath);

            // Wait for debounce (file should be ignored, so no reindexing)
            await new Promise(resolve => setTimeout(resolve, 500));

            // The watcher should still be running
            expect(context.isWatching()).toBe(true);

            await context.stopWatching();
        });
    });

    describe('Error Handling', () => {
        it('should handle errors during auto reindexing gracefully', async () => {
            await context.indexCodebase(codebaseDir);

            // Create a callback that throws an error
            await context.startWatching(
                codebaseDir,
                async () => {
                    throw new Error('Reindexing error');
                },
                100
            );

            await new Promise(resolve => setTimeout(resolve, 200));

            // Trigger a change
            const errorPath = path.join(codebaseDir, 'src', 'error.ts');
            await fs.writeFile(errorPath, `export function error() { throw new Error(); }`);
            await triggerFileEvent('add', errorPath);

            // Wait for error to be handled
            await new Promise(resolve => setTimeout(resolve, 300));

            // Watcher should still be running despite error
            expect(context.isWatching()).toBe(true);

            await context.stopWatching();
        });
    });

    describe('End-to-End Workflow', () => {
        it('should complete full watch-change-reindex cycle', async () => {
            // 1. Initial indexing
            const indexResult = await context.indexCodebase(codebaseDir);
            expect(indexResult.indexedFiles).toBe(2);

            // 2. Start watching
            await context.startWatching(codebaseDir, undefined, 100);
            expect(context.isWatching()).toBe(true);

            await new Promise(resolve => setTimeout(resolve, 200));

            // 3. Make changes
            const modifiedPath = path.join(codebaseDir, 'src', 'modified.ts');
            await fs.writeFile(modifiedPath, `export function modified() { return true; }`);
            await triggerFileEvent('add', modifiedPath);

            // 4. Wait for auto reindexing
            await new Promise(resolve => setTimeout(resolve, 300));

            // 5. Verify changes are indexed
            const results = await context.semanticSearch(codebaseDir, 'modified', 5);
            expect(results.length).toBeGreaterThan(0);

            // 6. Stop watching
            await context.stopWatching();
            expect(context.isWatching()).toBe(false);
        });

        it('should handle multiple watch cycles', async () => {
            // First cycle
            await context.indexCodebase(codebaseDir);
            await context.startWatching(codebaseDir, undefined, 100);
            await new Promise(resolve => setTimeout(resolve, 200));
            await context.stopWatching();
            expect(context.isWatching()).toBe(false);

            // Second cycle
            await context.startWatching(codebaseDir, undefined, 100);
            expect(context.isWatching()).toBe(true);
            await context.stopWatching();
            expect(context.isWatching()).toBe(false);
        });
    });

    describe('Watcher Statistics', () => {
        it('should track total events', async () => {
            await context.indexCodebase(codebaseDir);
            await context.startWatching(codebaseDir, undefined, 100);

            await new Promise(resolve => setTimeout(resolve, 200));

            // Trigger multiple changes
            const file1Path = path.join(codebaseDir, 'src', 'file1.ts');
            const file2Path = path.join(codebaseDir, 'src', 'file2.ts');
            const file3Path = path.join(codebaseDir, 'src', 'file3.ts');

            await fs.writeFile(file1Path, 'export const a = 1;');
            await fs.writeFile(file2Path, 'export const b = 2;');
            await fs.writeFile(file3Path, 'export const c = 3;');

            await triggerFileEvent('add', file1Path);
            await triggerFileEvent('add', file2Path);
            await triggerFileEvent('add', file3Path);

            await new Promise(resolve => setTimeout(resolve, 300));

            const stats = context.getWatcherStats();
            expect(stats).not.toBeNull();
            expect(stats!.totalEvents).toBeGreaterThan(0);

            await context.stopWatching();
        });

        it('should track processed events', async () => {
            await context.indexCodebase(codebaseDir);
            await context.startWatching(codebaseDir, undefined, 100);

            await new Promise(resolve => setTimeout(resolve, 200));

            const testPath = path.join(codebaseDir, 'src', 'test.ts');
            await fs.writeFile(testPath, 'export const test = 1;');
            await triggerFileEvent('add', testPath);

            await new Promise(resolve => setTimeout(resolve, 300));

            const stats = context.getWatcherStats();
            expect(stats).not.toBeNull();
            expect(stats!.processedEvents).toBeGreaterThan(0);

            await context.stopWatching();
        });
    });
});

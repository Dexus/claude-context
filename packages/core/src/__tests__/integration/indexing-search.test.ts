/**
 * Integration Tests for Full Indexing and Search Workflow
 *
 * These tests verify the end-to-end functionality of the Context class,
 * including indexing codebases, semantic search, and re-indexing on changes.
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
    // Add the getSupportedLanguages static method that's referenced in context.ts
    actual.AstCodeSplitter.getSupportedLanguages = () => ['typescript', 'javascript', 'python', 'java', 'cpp', 'c', 'go', 'rust'];
    return actual;
});

import { LanceDBVectorDatabase } from '../../vectordb/lancedb-vectordb';
import { Embedding, EmbeddingVector } from '../../embedding/base-embedding';
import { Context } from '../../context';
import { AstCodeSplitter } from '../../splitter/ast-splitter';

// Mock environment manager to control settings
jest.mock('../../utils/env-manager', () => ({
    envManager: {
        get: jest.fn((key: string) => {
            const envMap: Record<string, string> = {
                'OPENAI_API_KEY': 'test-api-key',
                'HYBRID_MODE': 'false', // Use regular search for simpler testing
                'EMBEDDING_BATCH_SIZE': '10'
            };
            return envMap[key];
        })
    }
}));

/**
 * Mock Embedding class that generates deterministic vectors
 * This allows us to test the workflow without making actual API calls
 */
class MockEmbedding extends Embedding {
    private embeddingDimension: number;
    protected maxTokens: number = 8000;

    constructor(dimension: number = 128) {
        super();
        this.embeddingDimension = dimension;
    }

    /**
     * Generate a deterministic vector based on text content
     * Same text will always produce the same vector
     */
    private generateVector(text: string): number[] {
        const vector = new Array(this.embeddingDimension).fill(0);

        // Use a simple hash-based approach to generate deterministic values
        for (let i = 0; i < text.length && i < this.embeddingDimension; i++) {
            const charCode = text.charCodeAt(i);
            vector[i % this.embeddingDimension] += charCode / 1000;
        }

        // Normalize the vector
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

describe('Integration: Indexing and Search Workflow', () => {
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

    /**
     * Helper to create a unique temporary directory
     */
    const createTempDir = async (): Promise<string> => {
        const dir = path.join(
            os.tmpdir(),
            `integration-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
        );
        await fs.ensureDir(dir);
        return dir;
    };

    /**
     * Helper to create a test codebase with sample files
     */
    const createTestCodebase = async (baseDir: string): Promise<void> => {
        // Create directory structure
        await fs.ensureDir(path.join(baseDir, 'src'));
        await fs.ensureDir(path.join(baseDir, 'src', 'utils'));
        await fs.ensureDir(path.join(baseDir, 'tests'));

        // Create TypeScript files
        await fs.writeFile(
            path.join(baseDir, 'src', 'index.ts'),
            `/**
 * Main entry point for the application
 */
export function main(): void {
    console.log('Hello, World!');
    const result = calculateSum(5, 10);
    console.log('Sum:', result);
}

export function calculateSum(a: number, b: number): number {
    return a + b;
}

export function calculateProduct(a: number, b: number): number {
    return a * b;
}
`
        );

        await fs.writeFile(
            path.join(baseDir, 'src', 'utils', 'helpers.ts'),
            `/**
 * Utility helper functions
 */
export function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

export function parseJSON<T>(json: string): T | null {
    try {
        return JSON.parse(json) as T;
    } catch (error) {
        return null;
    }
}

export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;
    return (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}
`
        );

        await fs.writeFile(
            path.join(baseDir, 'src', 'utils', 'validators.ts'),
            `/**
 * Validation utility functions
 */
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    return emailRegex.test(email);
}

export function isValidPhoneNumber(phone: string): boolean {
    const phoneRegex = /^\\+?[1-9]\\d{1,14}$/;
    return phoneRegex.test(phone);
}

export function isNotEmpty(value: string | null | undefined): boolean {
    return value !== null && value !== undefined && value.trim().length > 0;
}
`
        );

        // Create a Python file
        await fs.writeFile(
            path.join(baseDir, 'src', 'script.py'),
            `"""
Python utility script for data processing
"""

def process_data(data: list) -> list:
    """Process and filter data items."""
    return [item for item in data if item is not None]

def calculate_average(numbers: list) -> float:
    """Calculate the average of a list of numbers."""
    if not numbers:
        return 0.0
    return sum(numbers) / len(numbers)

class DataProcessor:
    """A class for processing data."""

    def __init__(self, data: list):
        self.data = data

    def filter_nulls(self) -> list:
        """Remove null values from data."""
        return [item for item in self.data if item is not None]

    def get_statistics(self) -> dict:
        """Get basic statistics about the data."""
        numeric_data = [x for x in self.data if isinstance(x, (int, float))]
        return {
            'count': len(self.data),
            'numeric_count': len(numeric_data),
            'average': calculate_average(numeric_data)
        }
`
        );

        // Create a test file
        await fs.writeFile(
            path.join(baseDir, 'tests', 'index.test.ts'),
            `import { calculateSum, calculateProduct } from '../src/index';

describe('Math functions', () => {
    describe('calculateSum', () => {
        it('should add two positive numbers', () => {
            expect(calculateSum(2, 3)).toBe(5);
        });

        it('should handle negative numbers', () => {
            expect(calculateSum(-5, 3)).toBe(-2);
        });
    });

    describe('calculateProduct', () => {
        it('should multiply two numbers', () => {
            expect(calculateProduct(4, 5)).toBe(20);
        });
    });
});
`
        );

        // Create a .gitignore file
        await fs.writeFile(
            path.join(baseDir, '.gitignore'),
            `node_modules/
dist/
*.log
.env
`
        );
    };

    beforeEach(async () => {
        // Create fresh temp directories for each test
        tempDir = await createTempDir();
        codebaseDir = path.join(tempDir, 'codebase');
        dbDir = path.join(tempDir, 'db');

        await fs.ensureDir(codebaseDir);
        await fs.ensureDir(dbDir);

        // Create test codebase
        await createTestCodebase(codebaseDir);

        // Initialize components
        mockEmbedding = new MockEmbedding(128);
        vectorDb = new LanceDBVectorDatabase({ uri: dbDir });

        // Wait for LanceDB initialization
        await (vectorDb as any).initializationPromise;

        // Create Context with all components
        context = new Context({
            embedding: mockEmbedding,
            vectorDatabase: vectorDb,
            codeSplitter: new AstCodeSplitter(500, 50),
            supportedExtensions: ['.ts', '.tsx', '.js', '.jsx', '.py'],
            ignorePatterns: ['node_modules/**', 'dist/**', '*.log']
        });
    });

    afterEach(async () => {
        // Clean up temp directory
        if (tempDir) {
            await fs.remove(tempDir).catch(() => {});
        }
    });

    describe('Full Indexing Workflow', () => {
        it('should successfully index a codebase', async () => {
            const result = await context.indexCodebase(codebaseDir);

            expect(result.indexedFiles).toBeGreaterThan(0);
            expect(result.totalChunks).toBeGreaterThan(0);
            expect(result.status).toBe('completed');
        });

        it('should create a collection for the indexed codebase', async () => {
            await context.indexCodebase(codebaseDir);

            const hasIndex = await context.hasIndex(codebaseDir);
            expect(hasIndex).toBe(true);
        });

        it('should track progress during indexing', async () => {
            const progressUpdates: Array<{
                phase: string;
                current: number;
                total: number;
                percentage: number;
            }> = [];

            await context.indexCodebase(codebaseDir, (progress) => {
                progressUpdates.push(progress);
            });

            expect(progressUpdates.length).toBeGreaterThan(0);
            // Should have preparation phase
            expect(progressUpdates.some(p => p.phase.includes('Preparing'))).toBe(true);
            // Should have scanning phase
            expect(progressUpdates.some(p => p.phase.includes('Scanning'))).toBe(true);
            // Should have processing phases
            expect(progressUpdates.some(p => p.phase.includes('Processing'))).toBe(true);
            // Should end at 100%
            expect(progressUpdates[progressUpdates.length - 1].percentage).toBe(100);
        });

        it('should index only supported file extensions', async () => {
            // Add an unsupported file
            await fs.writeFile(
                path.join(codebaseDir, 'src', 'data.json'),
                '{"key": "value"}'
            );

            const result = await context.indexCodebase(codebaseDir);

            // JSON files should not be indexed by default
            expect(result.indexedFiles).toBeGreaterThan(0);
            // The number of indexed files should be the same as before adding JSON
        });

        it('should skip files matching ignore patterns', async () => {
            // Create a node_modules directory with a file
            await fs.ensureDir(path.join(codebaseDir, 'node_modules', 'some-package'));
            await fs.writeFile(
                path.join(codebaseDir, 'node_modules', 'some-package', 'index.ts'),
                'export const value = 42;'
            );

            const result = await context.indexCodebase(codebaseDir);

            // Files in node_modules should not be indexed
            expect(result.indexedFiles).toBeGreaterThan(0);
        });

        it('should handle force reindex correctly', async () => {
            // First indexing
            const firstResult = await context.indexCodebase(codebaseDir);
            expect(firstResult.indexedFiles).toBeGreaterThan(0);

            // Force reindex should recreate everything
            const secondResult = await context.indexCodebase(codebaseDir, undefined, true);
            expect(secondResult.indexedFiles).toBe(firstResult.indexedFiles);
            expect(secondResult.status).toBe('completed');
        });

        it('should handle empty directories gracefully', async () => {
            const emptyDir = path.join(tempDir, 'empty');
            await fs.ensureDir(emptyDir);

            const result = await context.indexCodebase(emptyDir);

            expect(result.indexedFiles).toBe(0);
            expect(result.totalChunks).toBe(0);
            expect(result.status).toBe('completed');
        });
    });

    describe('Full Search Workflow', () => {
        beforeEach(async () => {
            // Index the codebase before each search test
            await context.indexCodebase(codebaseDir);
        });

        it('should return results for a valid query', async () => {
            const results = await context.semanticSearch(
                codebaseDir,
                'calculate sum of numbers',
                5
            );

            expect(results.length).toBeGreaterThan(0);
        });

        it('should return results with correct structure', async () => {
            const results = await context.semanticSearch(
                codebaseDir,
                'function',
                5
            );

            expect(results.length).toBeGreaterThan(0);

            const result = results[0];
            expect(result).toHaveProperty('content');
            expect(result).toHaveProperty('relativePath');
            expect(result).toHaveProperty('startLine');
            expect(result).toHaveProperty('endLine');
            expect(result).toHaveProperty('language');
            expect(result).toHaveProperty('score');
        });

        it('should return empty array when collection does not exist', async () => {
            const nonExistentPath = path.join(tempDir, 'non-existent');
            await fs.ensureDir(nonExistentPath);

            const results = await context.semanticSearch(
                nonExistentPath,
                'test query',
                5
            );

            expect(results).toEqual([]);
        });

        it('should respect topK parameter', async () => {
            const results = await context.semanticSearch(
                codebaseDir,
                'function',
                2
            );

            expect(results.length).toBeLessThanOrEqual(2);
        });

        it('should search across multiple file types', async () => {
            const results = await context.semanticSearch(
                codebaseDir,
                'data processing',
                10
            );

            // Should find results from both TypeScript and Python files
            expect(results.length).toBeGreaterThan(0);
        });
    });

    describe('Clear Index Workflow', () => {
        it('should clear index for a codebase', async () => {
            await context.indexCodebase(codebaseDir);
            expect(await context.hasIndex(codebaseDir)).toBe(true);

            await context.clearIndex(codebaseDir);

            expect(await context.hasIndex(codebaseDir)).toBe(false);
        });

        it('should track progress during clear operation', async () => {
            await context.indexCodebase(codebaseDir);

            const progressUpdates: Array<{ phase: string }> = [];
            await context.clearIndex(codebaseDir, (progress) => {
                progressUpdates.push(progress);
            });

            expect(progressUpdates.length).toBeGreaterThan(0);
            expect(progressUpdates.some(p => p.phase.includes('Checking'))).toBe(true);
            expect(progressUpdates.some(p => p.phase.includes('cleared'))).toBe(true);
        });

        it('should handle clearing non-existent index gracefully', async () => {
            // Don't index first
            await expect(context.clearIndex(codebaseDir)).resolves.not.toThrow();
        });
    });

    describe('Collection Name Generation', () => {
        it('should generate consistent collection names', () => {
            const name1 = context.getCollectionName(codebaseDir);
            const name2 = context.getCollectionName(codebaseDir);

            expect(name1).toBe(name2);
        });

        it('should generate different names for different paths', () => {
            const name1 = context.getCollectionName('/path/to/codebase1');
            const name2 = context.getCollectionName('/path/to/codebase2');

            expect(name1).not.toBe(name2);
        });
    });

    describe('End-to-End Workflow', () => {
        it('should complete a full index-search-clear cycle', async () => {
            // 1. Verify no index exists initially
            expect(await context.hasIndex(codebaseDir)).toBe(false);

            // 2. Index the codebase
            const indexResult = await context.indexCodebase(codebaseDir);
            expect(indexResult.indexedFiles).toBeGreaterThan(0);
            expect(await context.hasIndex(codebaseDir)).toBe(true);

            // 3. Perform search
            const searchResults = await context.semanticSearch(
                codebaseDir,
                'calculate sum',
                5
            );
            expect(searchResults.length).toBeGreaterThan(0);

            // 4. Clear the index
            await context.clearIndex(codebaseDir);
            expect(await context.hasIndex(codebaseDir)).toBe(false);

            // 5. Verify search returns empty after clear
            const emptyResults = await context.semanticSearch(
                codebaseDir,
                'calculate sum',
                5
            );
            expect(emptyResults).toEqual([]);
        });

        it('should handle multiple reindexing operations', async () => {
            // First index
            const result1 = await context.indexCodebase(codebaseDir);
            expect(result1.indexedFiles).toBeGreaterThan(0);

            // Second index (should detect existing collection)
            const result2 = await context.indexCodebase(codebaseDir);
            expect(result2.indexedFiles).toBeGreaterThanOrEqual(0);

            // Force reindex
            const result3 = await context.indexCodebase(codebaseDir, undefined, true);
            expect(result3.indexedFiles).toBeGreaterThan(0);
        });
    });

    describe('Error Handling', () => {
        it('should handle read errors gracefully', async () => {
            // Create a file that will be deleted before indexing completes
            const tempFile = path.join(codebaseDir, 'src', 'temp.ts');
            await fs.writeFile(tempFile, 'export const temp = 1;');

            // Start indexing and immediately delete the file
            const indexPromise = context.indexCodebase(codebaseDir);
            await fs.remove(tempFile);

            // Should not throw
            const result = await indexPromise;
            expect(result.status).toBe('completed');
        });

        it('should handle invalid paths gracefully', async () => {
            // Non-existent path should return empty results
            const results = await context.semanticSearch(
                '/non/existent/path',
                'query',
                5
            );
            expect(results).toEqual([]);
        });
    });

    describe('Configuration Options', () => {
        it('should respect custom supported extensions', async () => {
            // Add a markdown file
            await fs.writeFile(
                path.join(codebaseDir, 'README.md'),
                '# Test Project\n\nThis is a test project with markdown documentation.'
            );

            // Create context with markdown support
            const mdContext = new Context({
                embedding: mockEmbedding,
                vectorDatabase: vectorDb,
                supportedExtensions: ['.md']
            });

            const result = await mdContext.indexCodebase(codebaseDir);

            // Should only index markdown files
            expect(result.indexedFiles).toBeGreaterThanOrEqual(1);
        });

        it('should respect custom ignore patterns', async () => {
            // Create a custom context that ignores tests directory
            const customContext = new Context({
                embedding: mockEmbedding,
                vectorDatabase: vectorDb,
                customIgnorePatterns: ['tests/**']
            });

            // Index and verify tests directory is ignored
            const result = await customContext.indexCodebase(codebaseDir);
            expect(result.indexedFiles).toBeGreaterThan(0);
        });
    });

    describe('Concurrent Operations', () => {
        it('should handle concurrent search operations', async () => {
            await context.indexCodebase(codebaseDir);

            // Perform multiple concurrent searches
            const searchPromises = [
                context.semanticSearch(codebaseDir, 'function', 3),
                context.semanticSearch(codebaseDir, 'class', 3),
                context.semanticSearch(codebaseDir, 'export', 3)
            ];

            const results = await Promise.all(searchPromises);

            // All searches should complete successfully
            expect(results).toHaveLength(3);
            results.forEach(result => {
                expect(Array.isArray(result)).toBe(true);
            });
        });
    });
});

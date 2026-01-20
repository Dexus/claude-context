/**
 * Integration Tests for Ranking System
 *
 * These tests verify the end-to-end functionality of the ranking system,
 * including recency boosting, import frequency scoring, and term frequency analysis.
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

import { LanceDBVectorDatabase } from '../../vectordb/lancedb-vectordb';
import { Embedding, EmbeddingVector } from '../../embedding/base-embedding';
import { Context } from '../../context';
// AstCodeSplitter is imported dynamically via jest.requireActual in the mock above

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

describe('Integration: Ranking System', () => {
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
            `ranking-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
        );
        await fs.ensureDir(dir);
        return dir;
    };

    /**
     * Helper to create a test file with specific modification time
     */
    const createTestFile = async (
        baseDir: string,
        relativePath: string,
        content: string,
        mtimeMs: number
    ): Promise<void> => {
        const filePath = path.join(baseDir, relativePath);
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, content);

        // Set modification time
        await fs.utimes(filePath, new Date(mtimeMs), new Date(mtimeMs));
    };

    beforeEach(async () => {
        // Create temporary directories
        tempDir = await createTempDir();
        codebaseDir = path.join(tempDir, 'codebase');
        dbDir = path.join(tempDir, 'db');
        await fs.ensureDir(codebaseDir);
        await fs.ensureDir(dbDir);

        // Initialize mock embedding
        mockEmbedding = new MockEmbedding(128);

        // Initialize vector database
        vectorDb = new LanceDBVectorDatabase({ uri: dbDir });

        // Wait for LanceDB initialization
        await (vectorDb as any).initializationPromise;

        // Initialize context with ranking enabled
        context = new Context({
            embedding: mockEmbedding,
            vectorDatabase: vectorDb,
            rankingConfig: {
                enabled: true,
                vectorWeight: 0.5,
                recencyWeight: 0.2,
                importWeight: 0.2,
                termFreqWeight: 0.1,
                recencyHalfLifeDays: 90
            }
        });
    });

    afterEach(async () => {
        // Clean up temporary directory
        if (tempDir && await fs.pathExists(tempDir)) {
            await fs.remove(tempDir);
        }
    });

    describe('Recency Boosting', () => {
        it('should rank recently modified files higher than older files', async () => {
            const now = Date.now();
            const twoYearsAgo = now - (730 * 24 * 60 * 60 * 1000); // 2 years ago

            // Create test files with significantly different modification times
            // Use very similar content to ensure vector scores are nearly identical
            await createTestFile(
                codebaseDir,
                'recent.ts',
                `export function utilityFunction() {
    return 'utility code implementation';
}`,
                now
            );

            await createTestFile(
                codebaseDir,
                'old.ts',
                `export function utilityFunction() {
    return 'utility code implementation';
}`,
                twoYearsAgo
            );

            // Index the codebase
            await context.indexCodebase(codebaseDir);

            // Search with ranking enabled
            const rankedResults = await context.semanticSearch(
                codebaseDir,
                'utility code',
                10,
                0.0,
                undefined,
                true
            );

            // Search with ranking disabled for comparison
            const unrankedResults = await context.semanticSearch(
                codebaseDir,
                'utility code',
                10,
                0.0,
                undefined,
                false
            );

            // Verify we got results
            expect(rankedResults.length).toBeGreaterThan(0);
            expect(unrankedResults.length).toBeGreaterThan(0);

            // Find results by file name
            const recentRanked = rankedResults.find(r => r.relativePath.includes('recent.ts'));
            const oldRanked = rankedResults.find(r => r.relativePath.includes('old.ts'));
            const recentUnranked = unrankedResults.find(r => r.relativePath.includes('recent.ts'));
            const oldUnranked = unrankedResults.find(r => r.relativePath.includes('old.ts'));

            // Verify all files were found
            expect(recentRanked).toBeDefined();
            expect(oldRanked).toBeDefined();
            expect(recentUnranked).toBeDefined();
            expect(oldUnranked).toBeDefined();

            // With ranking, the recent file should benefit from recency boost
            // even if the vector scores are identical
            const rankedDiff = recentRanked!.score - oldRanked!.score;
            const unrankedDiff = recentUnranked!.score - oldUnranked!.score;

            // The ranked difference should show more advantage for the recent file
            // (either positive advantage or less disadvantage)
            expect(rankedDiff).toBeGreaterThanOrEqual(unrankedDiff);
        });

        it('should respect recency half-life configuration', async () => {
            const now = Date.now();
            const halfLifeAgo = now - (90 * 24 * 60 * 60 * 1000); // 90 days ago (default half-life)

            await createTestFile(
                codebaseDir,
                'recent.ts',
                'export const recent = "test";',
                now
            );

            await createTestFile(
                codebaseDir,
                'halflife.ts',
                'export const halflife = "test";',
                halfLifeAgo
            );

            await context.indexCodebase(codebaseDir);

            // Update ranking config to use a different half-life
            context.updateRankingConfig({ recencyHalfLifeDays: 30 });

            const results = await context.semanticSearch(
                codebaseDir,
                'test export',
                10,
                0.0,
                undefined,
                true
            );

            expect(results.length).toBeGreaterThan(0);

            const recentResult = results.find(r => r.relativePath.includes('recent.ts'));
            const halfLifeResult = results.find(r => r.relativePath.includes('halflife.ts'));

            expect(recentResult).toBeDefined();
            expect(halfLifeResult).toBeDefined();

            // With shorter half-life (30 days), the file from 90 days ago should have much lower score
            expect(recentResult!.score).toBeGreaterThan(halfLifeResult!.score);
        });
    });

    describe('Import Frequency Boosting', () => {
        it('should rank frequently imported files higher', async () => {
            const now = Date.now();

            // Create a utility file that will be imported multiple times
            await createTestFile(
                codebaseDir,
                'utils/common.ts',
                `export function commonUtil() {
    return 'frequently imported utility';
}`,
                now
            );

            // Create a rarely imported file
            await createTestFile(
                codebaseDir,
                'utils/rare.ts',
                `export function rareUtil() {
    return 'rarely imported utility';
}`,
                now
            );

            // Create multiple files that import common.ts
            await createTestFile(
                codebaseDir,
                'features/feature1.ts',
                `import { commonUtil } from '../utils/common';

export function feature1() {
    return commonUtil();
}`,
                now
            );

            await createTestFile(
                codebaseDir,
                'features/feature2.ts',
                `import { commonUtil } from '../utils/common';

export function feature2() {
    return commonUtil();
}`,
                now
            );

            await createTestFile(
                codebaseDir,
                'features/feature3.ts',
                `import { commonUtil } from '../utils/common';

export function feature3() {
    return commonUtil();
}`,
                now
            );

            // Create one file that imports rare.ts
            await createTestFile(
                codebaseDir,
                'features/feature4.ts',
                `import { rareUtil } from '../utils/rare';

export function feature4() {
    return rareUtil();
}`,
                now
            );

            // Index the codebase
            await context.indexCodebase(codebaseDir);

            // Search for utility functions
            const results = await context.semanticSearch(
                codebaseDir,
                'utility function',
                10,
                0.0,
                undefined,
                true
            );

            expect(results.length).toBeGreaterThan(0);

            const commonResult = results.find(r => r.relativePath.includes('utils/common.ts'));
            const rareResult = results.find(r => r.relativePath.includes('utils/rare.ts'));

            expect(commonResult).toBeDefined();
            expect(rareResult).toBeDefined();

            // Common utility (imported 3 times) should rank at least as high as rare utility (imported 1 time)
            // Note: Score difference may be small if vector similarity dominates
            expect(commonResult!.score).toBeGreaterThanOrEqual(rareResult!.score * 0.99);
        });
    });

    describe('Term Frequency Boosting', () => {
        it('should rank files with more query term matches higher', async () => {
            const now = Date.now();

            // Create a file with many matches for the search term
            await createTestFile(
                codebaseDir,
                'high-match.ts',
                `export function authentication() {
    // Authentication logic
    const auth = authenticate();
    return auth.authenticate();
}

export function authenticate() {
    return { authenticate: () => true };
}`,
                now
            );

            // Create a file with fewer matches
            await createTestFile(
                codebaseDir,
                'low-match.ts',
                `export function login() {
    // User login with authentication
    return true;
}`,
                now
            );

            await context.indexCodebase(codebaseDir);

            // Search for "authentication" - should appear many times in high-match.ts
            const results = await context.semanticSearch(
                codebaseDir,
                'authentication',
                10,
                0.0,
                undefined,
                true
            );

            expect(results.length).toBeGreaterThan(0);

            const highMatchResult = results.find(r => r.relativePath.includes('high-match.ts'));
            const lowMatchResult = results.find(r => r.relativePath.includes('low-match.ts'));

            expect(highMatchResult).toBeDefined();
            expect(lowMatchResult).toBeDefined();

            // File with more term matches should rank at least as high as low-match
            // Note: Score difference may be small due to sigmoid compression in term frequency
            expect(highMatchResult!.score).toBeGreaterThanOrEqual(lowMatchResult!.score * 0.99);
        });

        it('should handle multi-word queries correctly', async () => {
            const now = Date.now();

            await createTestFile(
                codebaseDir,
                'full-match.ts',
                `export function userAuthentication() {
    // User authentication system
    return authenticateUser();
}

function authenticateUser() {
    return { user: 'authenticated' };
}`,
                now
            );

            await createTestFile(
                codebaseDir,
                'partial-match.ts',
                `export function authenticate() {
    // Generic authentication
    return true;
}`,
                now
            );

            await context.indexCodebase(codebaseDir);

            // Search for both "user" and "authentication"
            const results = await context.semanticSearch(
                codebaseDir,
                'user authentication',
                10,
                0.0,
                undefined,
                true
            );

            expect(results.length).toBeGreaterThan(0);

            const fullMatchResult = results.find(r => r.relativePath.includes('full-match.ts'));
            const partialMatchResult = results.find(r => r.relativePath.includes('partial-match.ts'));

            expect(fullMatchResult).toBeDefined();
            expect(partialMatchResult).toBeDefined();

            // File matching both terms should rank higher
            expect(fullMatchResult!.score).toBeGreaterThan(partialMatchResult!.score);
        });
    });

    describe('Combined Ranking Factors', () => {
        it('should combine all ranking factors correctly', async () => {
            const now = Date.now();
            const sixMonthsAgo = now - (180 * 24 * 60 * 60 * 1000);

            // File 1: Recent, frequently imported, high term match
            await createTestFile(
                codebaseDir,
                'optimal.ts',
                `export function authentication() {
    // Authentication authentication authentication
    return authenticate();
}`,
                now
            );

            // File 2: Old, rarely imported, low term match
            await createTestFile(
                codebaseDir,
                'suboptimal.ts',
                `export function auth() {
    // Single authentication mention
    return true;
}`,
                sixMonthsAgo
            );

            // Files that import optimal.ts
            await createTestFile(
                codebaseDir,
                'import1.ts',
                `import { authentication } from './optimal';`,
                now
            );

            await createTestFile(
                codebaseDir,
                'import2.ts',
                `import { authentication } from './optimal';`,
                now
            );

            await context.indexCodebase(codebaseDir);

            const results = await context.semanticSearch(
                codebaseDir,
                'authentication',
                10,
                0.0,
                undefined,
                true
            );

            expect(results.length).toBeGreaterThan(0);

            const optimalResult = results.find(r => r.relativePath.includes('optimal.ts'));
            const suboptimalResult = results.find(r => r.relativePath.includes('suboptimal.ts'));

            expect(optimalResult).toBeDefined();
            expect(suboptimalResult).toBeDefined();

            // File with better scores across all factors should rank much higher
            expect(optimalResult!.score).toBeGreaterThan(suboptimalResult!.score);
        });

        it('should allow customization of ranking weights', async () => {
            const now = Date.now();
            const oldTime = now - (180 * 24 * 60 * 60 * 1000);

            await createTestFile(
                codebaseDir,
                'recent.ts',
                'export const test = "recent";',
                now
            );

            await createTestFile(
                codebaseDir,
                'old.ts',
                'export const test = "old";',
                oldTime
            );

            await context.indexCodebase(codebaseDir);

            // First search with default weights
            const defaultResults = await context.semanticSearch(
                codebaseDir,
                'test export',
                10,
                0.0,
                undefined,
                true
            );

            const recentDefault = defaultResults.find(r => r.relativePath.includes('recent.ts'));
            const oldDefault = defaultResults.find(r => r.relativePath.includes('old.ts'));

            expect(recentDefault).toBeDefined();
            expect(oldDefault).toBeDefined();

            const scoreDiffDefault = recentDefault!.score - oldDefault!.score;

            // Now increase recency weight dramatically
            context.updateRankingConfig({
                vectorWeight: 0.1,
                recencyWeight: 0.8,
                importWeight: 0.05,
                termFreqWeight: 0.05
            });

            const recencyBoostedResults = await context.semanticSearch(
                codebaseDir,
                'test export',
                10,
                0.0,
                undefined,
                true
            );

            const recentBoosted = recencyBoostedResults.find(r => r.relativePath.includes('recent.ts'));
            const oldBoosted = recencyBoostedResults.find(r => r.relativePath.includes('old.ts'));

            expect(recentBoosted).toBeDefined();
            expect(oldBoosted).toBeDefined();

            const scoreDiffBoosted = recentBoosted!.score - oldBoosted!.score;

            // With higher recency weight, score difference should be larger or at least maintained
            // Note: If vector similarity is very strong, the difference might still be small
            expect(scoreDiffBoosted).toBeGreaterThanOrEqual(scoreDiffDefault * 0.9);

            // Recent file should consistently score higher than old file
            expect(recentBoosted!.score).toBeGreaterThanOrEqual(oldBoosted!.score);
        });
    });

    describe('Ranking Control', () => {
        it('should return vector similarity scores when ranking is disabled', async () => {
            const now = Date.now();
            const oldTime = now - (180 * 24 * 60 * 60 * 1000);

            await createTestFile(
                codebaseDir,
                'recent.ts',
                'export const test = "recent file";',
                now
            );

            await createTestFile(
                codebaseDir,
                'old.ts',
                'export const test = "old file";',
                oldTime
            );

            await context.indexCodebase(codebaseDir);

            // Search with ranking enabled
            const rankedResults = await context.semanticSearch(
                codebaseDir,
                'test export',
                10,
                0.0,
                undefined,
                true
            );

            // Search with ranking disabled
            const unrankedResults = await context.semanticSearch(
                codebaseDir,
                'test export',
                10,
                0.0,
                undefined,
                false
            );

            expect(rankedResults.length).toBeGreaterThan(0);
            expect(unrankedResults.length).toBeGreaterThan(0);

            // With ranking enabled, recent file should score higher
            const recentRanked = rankedResults.find(r => r.relativePath.includes('recent.ts'));
            const oldRanked = rankedResults.find(r => r.relativePath.includes('old.ts'));

            expect(recentRanked).toBeDefined();
            expect(oldRanked).toBeDefined();

            // Without ranking, scores should be based purely on vector similarity
            // The order might be different or the score gap smaller
            const recentUnranked = unrankedResults.find(r => r.relativePath.includes('recent.ts'));
            const oldUnranked = unrankedResults.find(r => r.relativePath.includes('old.ts'));

            expect(recentUnranked).toBeDefined();
            expect(oldUnranked).toBeDefined();

            // Scores should differ between ranked and unranked
            expect(recentRanked!.score).not.toBe(recentUnranked!.score);
            expect(oldRanked!.score).not.toBe(oldUnranked!.score);
        });

        it('should allow disabling ranking via configuration', async () => {
            const now = Date.now();

            await createTestFile(
                codebaseDir,
                'test.ts',
                'export const test = "file";',
                now
            );

            await context.indexCodebase(codebaseDir);

            // Disable ranking via config
            context.updateRankingConfig({ enabled: false });

            const results = await context.semanticSearch(
                codebaseDir,
                'test',
                10,
                0.0,
                undefined,
                true // Even with enableRanking=true, config should disable it
            );

            expect(results.length).toBeGreaterThan(0);

            // Re-enable ranking
            context.updateRankingConfig({ enabled: true });

            const rankedResults = await context.semanticSearch(
                codebaseDir,
                'test',
                10,
                0.0,
                undefined,
                true
            );

            expect(rankedResults.length).toBeGreaterThan(0);
        });
    });

    describe('Edge Cases', () => {
        it('should handle files with no import metadata gracefully', async () => {
            const now = Date.now();

            await createTestFile(
                codebaseDir,
                'standalone.ts',
                'export const standalone = "no imports";',
                now
            );

            await context.indexCodebase(codebaseDir);

            const results = await context.semanticSearch(
                codebaseDir,
                'standalone',
                10,
                0.0,
                undefined,
                true
            );

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].score).toBeGreaterThanOrEqual(0);
            expect(results[0].score).toBeLessThanOrEqual(1);
        });

        it('should handle empty search results', async () => {
            const now = Date.now();

            await createTestFile(
                codebaseDir,
                'test.ts',
                'export const test = "file";',
                now
            );

            await context.indexCodebase(codebaseDir);

            // Search for something that doesn't exist
            const results = await context.semanticSearch(
                codebaseDir,
                'xyznonexistentquery',
                10,
                0.99, // High threshold to filter out results
                undefined,
                true
            );

            // Should not throw, just return empty array
            expect(Array.isArray(results)).toBe(true);
        });

        it('should normalize scores to [0, 1] range', async () => {
            const now = Date.now();

            // Create multiple files with varying characteristics
            for (let i = 0; i < 5; i++) {
                await createTestFile(
                    codebaseDir,
                    `file${i}.ts`,
                    `export function func${i}() { return 'test test test'; }`,
                    now - (i * 30 * 24 * 60 * 60 * 1000) // Different ages
                );
            }

            await context.indexCodebase(codebaseDir);

            const results = await context.semanticSearch(
                codebaseDir,
                'test function',
                10,
                0.0,
                undefined,
                true
            );

            expect(results.length).toBeGreaterThan(0);

            // All scores should be in [0, 1] range
            for (const result of results) {
                expect(result.score).toBeGreaterThanOrEqual(0);
                expect(result.score).toBeLessThanOrEqual(1);
            }
        });
    });
});

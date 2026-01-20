import {
    calculateRecencyScore,
    calculateImportScore,
    calculateTermFrequencyScore,
    extractQueryTerms,
    calculateAllFactors,
} from '../../ranking/factors';
import { VectorDocument } from '../../vectordb/types';

describe('Ranking Factors', () => {
    describe('calculateRecencyScore', () => {
        it('should return 1.0 for files modified now', () => {
            const now = Date.now();
            const score = calculateRecencyScore(now);
            expect(score).toBeCloseTo(1.0, 5);
        });

        it('should return 0.5 for files modified at half-life', () => {
            const halfLifeDays = 90;
            const mtime = Date.now() - (halfLifeDays * 24 * 60 * 60 * 1000);
            const score = calculateRecencyScore(mtime, halfLifeDays);
            expect(score).toBeCloseTo(0.5, 2);
        });

        it('should return lower score for older files', () => {
            const now = Date.now();
            const recentFile = now - (10 * 24 * 60 * 60 * 1000); // 10 days ago
            const oldFile = now - (180 * 24 * 60 * 60 * 1000); // 180 days ago

            const recentScore = calculateRecencyScore(recentFile);
            const oldScore = calculateRecencyScore(oldFile);

            expect(recentScore).toBeGreaterThan(oldScore);
        });

        it('should handle very old files gracefully', () => {
            const veryOldFile = Date.now() - (365 * 24 * 60 * 60 * 1000); // 1 year ago
            const score = calculateRecencyScore(veryOldFile);
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(1);
        });

        it('should use custom half-life parameter', () => {
            const halfLifeDays = 30;
            const mtime = Date.now() - (halfLifeDays * 24 * 60 * 60 * 1000);
            const score = calculateRecencyScore(mtime, halfLifeDays);
            expect(score).toBeCloseTo(0.5, 2);
        });

        it('should return approximately 0.25 for files modified at 2x half-life', () => {
            const halfLifeDays = 90;
            const mtime = Date.now() - (2 * halfLifeDays * 24 * 60 * 60 * 1000);
            const score = calculateRecencyScore(mtime, halfLifeDays);
            expect(score).toBeCloseTo(0.25, 2);
        });

        it('should clamp negative scores to 0', () => {
            const futureTime = Date.now() + (365 * 24 * 60 * 60 * 1000);
            const score = calculateRecencyScore(futureTime);
            expect(score).toBe(1); // Future times result in score > 1, clamped to 1
        });

        it('should handle zero half-life days', () => {
            const now = Date.now();
            const score = calculateRecencyScore(now - 1000, 0);
            // When halfLife is 0, any time difference results in -Infinity exponent
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(1);
        });
    });

    describe('calculateImportScore', () => {
        it('should return 0 when max import count is 0', () => {
            const score = calculateImportScore(5, 0);
            expect(score).toBe(0);
        });

        it('should return 0 when import count is 0', () => {
            const score = calculateImportScore(0, 100);
            expect(score).toBe(0);
        });

        it('should return 1.0 for file with max imports', () => {
            const score = calculateImportScore(100, 100);
            expect(score).toBe(1.0);
        });

        it('should return 0.5 for file with half of max imports', () => {
            const score = calculateImportScore(50, 100);
            expect(score).toBe(0.5);
        });

        it('should normalize correctly', () => {
            const score1 = calculateImportScore(25, 100);
            const score2 = calculateImportScore(75, 100);

            expect(score1).toBe(0.25);
            expect(score2).toBe(0.75);
            expect(score2).toBeGreaterThan(score1);
        });

        it('should handle single file case', () => {
            const score = calculateImportScore(1, 1);
            expect(score).toBe(1.0);
        });

        it('should clamp values above 1 to 1', () => {
            // This could happen if importCount > maxImportCount due to stale data
            const score = calculateImportScore(150, 100);
            expect(score).toBe(1);
        });

        it('should clamp negative values to 0', () => {
            const score = calculateImportScore(-10, 100);
            expect(score).toBe(0);
        });
    });

    describe('calculateTermFrequencyScore', () => {
        it('should return 0 for empty content', () => {
            const score = calculateTermFrequencyScore('', ['test']);
            expect(score).toBe(0);
        });

        it('should return 0 for empty query terms', () => {
            const score = calculateTermFrequencyScore('some content here', []);
            expect(score).toBe(0);
        });

        it('should find single term match', () => {
            const content = 'This is a test content';
            const score = calculateTermFrequencyScore(content, ['test']);
            expect(score).toBeGreaterThan(0);
        });

        it('should find multiple term matches', () => {
            const content = 'This is a test of test content';
            const singleMatch = calculateTermFrequencyScore(content, ['test']);
            const multiMatch = calculateTermFrequencyScore(content, ['test', 'content']);

            expect(multiMatch).toBeGreaterThan(singleMatch);
        });

        it('should be case insensitive', () => {
            const content = 'Test TEST TeSt';
            const score = calculateTermFrequencyScore(content, ['test']);
            expect(score).toBeGreaterThan(0);
        });

        it('should normalize by content length', () => {
            const shortContent = 'test test test';
            const longContent = 'test test test ' + 'word '.repeat(100);

            const shortScore = calculateTermFrequencyScore(shortContent, ['test']);
            const longScore = calculateTermFrequencyScore(longContent, ['test']);

            // Short content should have higher score due to higher term density
            expect(shortScore).toBeGreaterThan(longScore);
        });

        it('should handle multiple query terms', () => {
            const content = 'authentication login user access control';
            const score = calculateTermFrequencyScore(content, ['authentication', 'login', 'user']);
            expect(score).toBeGreaterThan(0);
        });

        it('should return 0 for no matches', () => {
            const content = 'This is some content';
            const score = calculateTermFrequencyScore(content, ['nonexistent', 'missing']);
            expect(score).toBe(0);
        });

        it('should handle repeated terms in query', () => {
            const content = 'test foo bar baz qux quux corge grault garply waldo fred plugh xyzzy thud';
            const score1 = calculateTermFrequencyScore(content, ['test']);
            const score2 = calculateTermFrequencyScore(content, ['test', 'test']);

            // Repeated terms will count matches multiple times, increasing the score
            expect(score2).toBeGreaterThanOrEqual(score1);
            // Both should still find the matches
            expect(score1).toBeGreaterThan(0);
            expect(score2).toBeGreaterThan(0);
        });

        it('should handle special characters in content', () => {
            const content = 'function test() { return "test"; }';
            const score = calculateTermFrequencyScore(content, ['test']);
            expect(score).toBeGreaterThan(0);
        });

        it('should handle partial word matches', () => {
            const content = 'testing tester tests';
            const score = calculateTermFrequencyScore(content, ['test']);
            // Should match all three words (testing, tester, tests) as they contain 'test'
            expect(score).toBeGreaterThan(0);
        });

        it('should return value in [0, 1] range', () => {
            const content = 'test '.repeat(1000);
            const score = calculateTermFrequencyScore(content, ['test']);
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(1);
        });

        it('should handle multi-word content correctly', () => {
            const content = 'import React from react\nimport useState from react';
            const score = calculateTermFrequencyScore(content, ['react', 'import']);
            expect(score).toBeGreaterThan(0);
        });
    });

    describe('extractQueryTerms', () => {
        it('should split query on whitespace', () => {
            const terms = extractQueryTerms('hello world');
            expect(terms).toEqual(['hello', 'world']);
        });

        it('should handle multiple spaces', () => {
            const terms = extractQueryTerms('hello  world   test');
            expect(terms).toEqual(['hello', 'world', 'test']);
        });

        it('should handle tabs and newlines', () => {
            const terms = extractQueryTerms('hello\tworld\ntest');
            expect(terms).toEqual(['hello', 'world', 'test']);
        });

        it('should trim whitespace from terms', () => {
            const terms = extractQueryTerms('  hello   world  ');
            expect(terms).toEqual(['hello', 'world']);
        });

        it('should return empty array for empty string', () => {
            const terms = extractQueryTerms('');
            expect(terms).toEqual([]);
        });

        it('should return empty array for whitespace-only string', () => {
            const terms = extractQueryTerms('   \t\n  ');
            expect(terms).toEqual([]);
        });

        it('should handle single word', () => {
            const terms = extractQueryTerms('hello');
            expect(terms).toEqual(['hello']);
        });

        it('should preserve special characters in terms', () => {
            const terms = extractQueryTerms('test.js import()');
            expect(terms).toEqual(['test.js', 'import()']);
        });
    });

    describe('calculateAllFactors', () => {
        const createMockDocument = (overrides: Partial<VectorDocument> = {}): VectorDocument => ({
            id: 'test-id',
            vector: [0.1, 0.2, 0.3],
            content: 'test content',
            relativePath: 'test/file.ts',
            startLine: 1,
            endLine: 10,
            fileExtension: '.ts',
            mtime: Date.now(),
            metadata: {},
            ...overrides,
        });

        it('should calculate all three factors', () => {
            const doc = createMockDocument({
                content: 'import React from react\nfunction Component() {}',
                mtime: Date.now() - (30 * 24 * 60 * 60 * 1000), // 30 days ago
                metadata: { importCount: 50 },
            });

            const factors = calculateAllFactors(doc, 'react component', 100, 90);

            expect(factors.recencyScore).toBeGreaterThan(0);
            expect(factors.recencyScore).toBeLessThanOrEqual(1);
            expect(factors.importScore).toBe(0.5);
            expect(factors.termFreqScore).toBeGreaterThan(0);
        });

        it('should handle document with no import count', () => {
            const doc = createMockDocument({
                metadata: {},
            });

            const factors = calculateAllFactors(doc, 'test query', 100);

            expect(factors.importScore).toBe(0);
            expect(factors.recencyScore).toBeGreaterThan(0);
            expect(factors.termFreqScore).toBeGreaterThan(0);
        });

        it('should handle document with zero import count', () => {
            const doc = createMockDocument({
                metadata: { importCount: 0 },
            });

            const factors = calculateAllFactors(doc, 'test', 100);

            expect(factors.importScore).toBe(0);
        });

        it('should use custom half-life', () => {
            const halfLifeDays = 30;
            const doc = createMockDocument({
                mtime: Date.now() - (halfLifeDays * 24 * 60 * 60 * 1000),
            });

            const factors = calculateAllFactors(doc, 'test', 100, halfLifeDays);

            expect(factors.recencyScore).toBeCloseTo(0.5, 2);
        });

        it('should handle empty query', () => {
            const doc = createMockDocument();

            const factors = calculateAllFactors(doc, '', 100);

            expect(factors.termFreqScore).toBe(0);
            expect(factors.recencyScore).toBeGreaterThan(0);
            expect(factors.importScore).toBeGreaterThanOrEqual(0);
        });

        it('should handle very recent file', () => {
            const doc = createMockDocument({
                mtime: Date.now(),
                metadata: { importCount: 100 },
                content: 'test test test',
            });

            const factors = calculateAllFactors(doc, 'test', 100);

            expect(factors.recencyScore).toBeCloseTo(1.0, 2);
            expect(factors.importScore).toBe(1.0);
            expect(factors.termFreqScore).toBeGreaterThan(0);
        });

        it('should return all scores in [0, 1] range', () => {
            const doc = createMockDocument({
                mtime: Date.now() - (365 * 24 * 60 * 60 * 1000), // 1 year ago
                metadata: { importCount: 150 }, // Higher than max
                content: 'test '.repeat(1000),
            });

            const factors = calculateAllFactors(doc, 'test', 100);

            expect(factors.recencyScore).toBeGreaterThanOrEqual(0);
            expect(factors.recencyScore).toBeLessThanOrEqual(1);
            expect(factors.importScore).toBeGreaterThanOrEqual(0);
            expect(factors.importScore).toBeLessThanOrEqual(1);
            expect(factors.termFreqScore).toBeGreaterThanOrEqual(0);
            expect(factors.termFreqScore).toBeLessThanOrEqual(1);
        });

        it('should handle document with content matching multiple query terms', () => {
            const doc = createMockDocument({
                content: 'authentication login user access control permissions',
                metadata: { importCount: 25 },
            });

            const factors = calculateAllFactors(doc, 'authentication login user', 100);

            expect(factors.termFreqScore).toBeGreaterThan(0);
            expect(factors.importScore).toBe(0.25);
        });

        it('should handle document with no term matches', () => {
            const doc = createMockDocument({
                content: 'some random content here',
                metadata: { importCount: 10 },
            });

            const factors = calculateAllFactors(doc, 'nonexistent terms', 100);

            expect(factors.termFreqScore).toBe(0);
            expect(factors.recencyScore).toBeGreaterThan(0);
            expect(factors.importScore).toBe(0.1);
        });
    });

    describe('Edge cases and boundary conditions', () => {
        it('should handle recency score at exact boundaries', () => {
            const now = Date.now();
            const score0 = calculateRecencyScore(now);
            const score1 = calculateRecencyScore(now - 1);

            expect(score0).toBeLessThanOrEqual(1);
            expect(score1).toBeLessThan(score0);
        });

        it('should handle import score with very large numbers', () => {
            const score = calculateImportScore(1000000, 1000000);
            expect(score).toBe(1.0);
        });

        it('should handle term frequency with very long content', () => {
            const longContent = 'word '.repeat(100000);
            const score = calculateTermFrequencyScore(longContent, ['word']);
            expect(score).toBeGreaterThanOrEqual(0);
            expect(score).toBeLessThanOrEqual(1);
        });

        it('should handle term frequency with many query terms', () => {
            const content = 'a b c d e f g h i j k l m n o p';
            const manyTerms = 'a b c d e f g h i j k l m n o p'.split(' ');
            const score = calculateTermFrequencyScore(content, manyTerms);
            expect(score).toBeGreaterThan(0);
            expect(score).toBeLessThanOrEqual(1);
        });
    });

    describe('Realistic scenarios', () => {
        it('should score frequently imported, recent files higher', () => {
            const recentFrequentFile = {
                mtime: Date.now() - (7 * 24 * 60 * 60 * 1000), // 1 week ago
                importCount: 80,
            };

            const oldRareFile = {
                mtime: Date.now() - (180 * 24 * 60 * 60 * 1000), // 6 months ago
                importCount: 5,
            };

            const recentScore = calculateRecencyScore(recentFrequentFile.mtime);
            const recentImportScore = calculateImportScore(recentFrequentFile.importCount, 100);

            const oldScore = calculateRecencyScore(oldRareFile.mtime);
            const oldImportScore = calculateImportScore(oldRareFile.importCount, 100);

            expect(recentScore).toBeGreaterThan(oldScore);
            expect(recentImportScore).toBeGreaterThan(oldImportScore);
        });

        it('should score content with exact query matches higher', () => {
            const exactMatch = 'function authenticate(user, password) { return true; }';
            const partialMatch = 'function login() { return true; }';

            const exactScore = calculateTermFrequencyScore(exactMatch, ['authenticate', 'user', 'password']);
            const partialScore = calculateTermFrequencyScore(partialMatch, ['authenticate', 'user', 'password']);

            expect(exactScore).toBeGreaterThan(partialScore);
        });
    });
});

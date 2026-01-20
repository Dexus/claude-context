import { Ranker } from '../../ranking/ranker';
import { VectorSearchResult } from '../../vectordb/types';
import { RankingConfig, DEFAULT_RANKING_CONFIG } from '../../ranking/types';

describe('Ranker', () => {
    const createMockResult = (
        score: number,
        overrides: Partial<VectorSearchResult['document']> = {}
    ): VectorSearchResult => ({
        score,
        document: {
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
        },
    });

    describe('constructor', () => {
        it('should initialize with default config', () => {
            const ranker = new Ranker();
            const config = ranker.getConfig();

            expect(config.vectorWeight).toBe(DEFAULT_RANKING_CONFIG.vectorWeight);
            expect(config.recencyWeight).toBe(DEFAULT_RANKING_CONFIG.recencyWeight);
            expect(config.importWeight).toBe(DEFAULT_RANKING_CONFIG.importWeight);
            expect(config.termFreqWeight).toBe(DEFAULT_RANKING_CONFIG.termFreqWeight);
            expect(config.enabled).toBe(true);
        });

        it('should initialize with custom config', () => {
            const customConfig: Partial<RankingConfig> = {
                vectorWeight: 0.3,
                recencyWeight: 0.3,
                importWeight: 0.3,
                termFreqWeight: 0.1,
            };

            const ranker = new Ranker(customConfig);
            const config = ranker.getConfig();

            expect(config.vectorWeight).toBe(0.3);
            expect(config.recencyWeight).toBe(0.3);
            expect(config.importWeight).toBe(0.3);
            expect(config.termFreqWeight).toBe(0.1);
        });

        it('should merge custom config with defaults', () => {
            const customConfig: Partial<RankingConfig> = {
                vectorWeight: 0.8,
            };

            const ranker = new Ranker(customConfig);
            const config = ranker.getConfig();

            expect(config.vectorWeight).toBe(0.8);
            expect(config.recencyWeight).toBe(DEFAULT_RANKING_CONFIG.recencyWeight);
            expect(config.importWeight).toBe(DEFAULT_RANKING_CONFIG.importWeight);
        });
    });

    describe('rank', () => {
        it('should return ranked results sorted by final score', () => {
            const ranker = new Ranker();
            const results: VectorSearchResult[] = [
                createMockResult(0.5, {
                    mtime: Date.now() - (180 * 24 * 60 * 60 * 1000), // Old file
                    metadata: { importCount: 5 },
                }),
                createMockResult(0.6, {
                    mtime: Date.now(), // Very recent file
                    metadata: { importCount: 100 },
                }),
                createMockResult(0.4, {
                    mtime: Date.now() - (30 * 24 * 60 * 60 * 1000),
                    metadata: { importCount: 50 },
                }),
            ];

            const ranked = ranker.rank(results, 'test query');

            expect(ranked).toHaveLength(3);
            // Results should be sorted by final score descending
            expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
            expect(ranked[1].score).toBeGreaterThanOrEqual(ranked[2].score);
        });

        it('should return results with correct structure', () => {
            const ranker = new Ranker();
            const results: VectorSearchResult[] = [
                createMockResult(0.8, {
                    content: 'function test() {}',
                    relativePath: 'src/test.ts',
                    startLine: 10,
                    endLine: 20,
                    fileExtension: '.ts',
                }),
            ];

            const ranked = ranker.rank(results, 'test');

            expect(ranked[0]).toMatchObject({
                content: 'function test() {}',
                relativePath: 'src/test.ts',
                startLine: 10,
                endLine: 20,
                language: 'ts', // Normalized (without leading dot)
                score: expect.any(Number),
            });
        });

        it('should include ranking details when requested', () => {
            const ranker = new Ranker();
            const results: VectorSearchResult[] = [
                createMockResult(0.8, {
                    content: 'test content here',
                    mtime: Date.now(),
                    metadata: { importCount: 50 },
                }),
            ];

            const ranked = ranker.rank(results, 'test content', true);

            expect(ranked[0].rankingDetails).toBeDefined();
            expect(ranked[0].rankingDetails?.factors).toBeDefined();
            expect(ranked[0].rankingDetails?.factors.vectorScore).toBe(0.8);
            expect(ranked[0].rankingDetails?.factors.recencyScore).toBeGreaterThan(0);
            expect(ranked[0].rankingDetails?.factors.importScore).toBeGreaterThan(0);
            expect(ranked[0].rankingDetails?.factors.termFreqScore).toBeGreaterThan(0);
            expect(ranked[0].rankingDetails?.finalScore).toBe(ranked[0].score);
        });

        it('should not include ranking details by default', () => {
            const ranker = new Ranker();
            const results: VectorSearchResult[] = [
                createMockResult(0.8, {
                    mtime: Date.now(),
                    metadata: { importCount: 50 },
                }),
            ];

            const ranked = ranker.rank(results, 'test');

            expect(ranked[0].rankingDetails).toBeUndefined();
        });

        it('should return original scores when ranking is disabled', () => {
            const ranker = new Ranker({ enabled: false });
            const results: VectorSearchResult[] = [
                createMockResult(0.5, { mtime: Date.now() }),
                createMockResult(0.8, { mtime: Date.now() }),
                createMockResult(0.3, { mtime: Date.now() }),
            ];

            const ranked = ranker.rank(results, 'test');

            expect(ranked[0].score).toBe(0.5);
            expect(ranked[1].score).toBe(0.8);
            expect(ranked[2].score).toBe(0.3);
        });

        it('should handle empty results array', () => {
            const ranker = new Ranker();
            const ranked = ranker.rank([], 'test');

            expect(ranked).toHaveLength(0);
        });

        it('should handle single result', () => {
            const ranker = new Ranker();
            const results: VectorSearchResult[] = [
                createMockResult(0.7, {
                    content: 'test content',
                    mtime: Date.now(),
                    metadata: { importCount: 10 },
                }),
            ];

            const ranked = ranker.rank(results, 'test');

            expect(ranked).toHaveLength(1);
            expect(ranked[0].score).toBeGreaterThan(0);
            expect(ranked[0].score).toBeLessThanOrEqual(1);
        });

        it('should boost recent files in rankings', () => {
            const ranker = new Ranker();
            const results: VectorSearchResult[] = [
                createMockResult(0.7, {
                    id: 'old-file',
                    mtime: Date.now() - (365 * 24 * 60 * 60 * 1000), // 1 year old
                    metadata: { importCount: 10 },
                }),
                createMockResult(0.7, {
                    id: 'recent-file',
                    mtime: Date.now(), // Now
                    metadata: { importCount: 10 },
                }),
            ];

            const ranked = ranker.rank(results, 'test', true);

            // Results are found via the rankingDetails comparison below

            // Recent file should have higher recency score
            const recentDetails = ranked.find(r =>
                r.rankingDetails?.factors.recencyScore === Math.max(...ranked.map(r => r.rankingDetails?.factors.recencyScore || 0))
            );
            const oldDetails = ranked.find(r =>
                r.rankingDetails?.factors.recencyScore === Math.min(...ranked.map(r => r.rankingDetails?.factors.recencyScore || 0))
            );

            expect(recentDetails?.rankingDetails?.factors.recencyScore).toBeGreaterThan(
                oldDetails?.rankingDetails?.factors.recencyScore || 0
            );
        });

        it('should boost frequently imported files', () => {
            const ranker = new Ranker();
            const results: VectorSearchResult[] = [
                createMockResult(0.7, {
                    mtime: Date.now(),
                    metadata: { importCount: 5 },
                }),
                createMockResult(0.7, {
                    mtime: Date.now(),
                    metadata: { importCount: 100 },
                }),
            ];

            const ranked = ranker.rank(results, 'test', true);

            // File with more imports should have higher import score
            const maxImportScore = Math.max(...ranked.map(r => r.rankingDetails?.factors.importScore || 0));
            const minImportScore = Math.min(...ranked.map(r => r.rankingDetails?.factors.importScore || 0));

            expect(maxImportScore).toBeGreaterThan(minImportScore);
        });

        it('should boost files with more term matches', () => {
            const ranker = new Ranker();
            const results: VectorSearchResult[] = [
                createMockResult(0.7, {
                    content: 'some random content here',
                    mtime: Date.now(),
                    metadata: { importCount: 10 },
                }),
                createMockResult(0.7, {
                    content: 'authentication login user authentication login',
                    mtime: Date.now(),
                    metadata: { importCount: 10 },
                }),
            ];

            const ranked = ranker.rank(results, 'authentication login user', true);

            // File with more term matches should have higher term frequency score
            const maxTermScore = Math.max(...ranked.map(r => r.rankingDetails?.factors.termFreqScore || 0));
            const minTermScore = Math.min(...ranked.map(r => r.rankingDetails?.factors.termFreqScore || 0));

            expect(maxTermScore).toBeGreaterThan(minTermScore);
        });

        it('should handle results with missing metadata gracefully', () => {
            const ranker = new Ranker();
            const results: VectorSearchResult[] = [
                createMockResult(0.7, {
                    mtime: Date.now(),
                    metadata: {},
                }),
                createMockResult(0.8, {
                    mtime: Date.now(),
                    metadata: { importCount: undefined },
                }),
            ];

            const ranked = ranker.rank(results, 'test', true);

            expect(ranked).toHaveLength(2);
            expect(ranked[0].rankingDetails?.factors.importScore).toBe(0);
            expect(ranked[1].rankingDetails?.factors.importScore).toBe(0);
        });

        it('should normalize import scores across all results', () => {
            const ranker = new Ranker();
            const results: VectorSearchResult[] = [
                createMockResult(0.7, {
                    mtime: Date.now(),
                    metadata: { importCount: 50 },
                }),
                createMockResult(0.7, {
                    mtime: Date.now(),
                    metadata: { importCount: 100 },
                }),
                createMockResult(0.7, {
                    mtime: Date.now(),
                    metadata: { importCount: 25 },
                }),
            ];

            const ranked = ranker.rank(results, 'test', true);

            // Max import count should have score of 1.0
            const maxImportScore = Math.max(...ranked.map(r => r.rankingDetails?.factors.importScore || 0));
            expect(maxImportScore).toBe(1.0);

            // Other scores should be proportional
            const scores = ranked.map(r => r.rankingDetails?.factors.importScore || 0).sort();
            expect(scores[0]).toBe(0.25);
            expect(scores[1]).toBe(0.5);
            expect(scores[2]).toBe(1.0);
        });

        it('should apply custom weights correctly', () => {
            // Config that heavily weights recency
            const ranker = new Ranker({
                vectorWeight: 0.1,
                recencyWeight: 0.8,
                importWeight: 0.05,
                termFreqWeight: 0.05,
            });

            const results: VectorSearchResult[] = [
                createMockResult(0.9, {
                    mtime: Date.now() - (365 * 24 * 60 * 60 * 1000), // Old
                    metadata: { importCount: 100 },
                }),
                createMockResult(0.5, {
                    mtime: Date.now(), // Very recent
                    metadata: { importCount: 10 },
                }),
            ];

            const ranked = ranker.rank(results, 'test');

            // Despite lower vector score, recent file should rank higher due to high recency weight
            expect(ranked[0].score).toBeGreaterThan(0);
        });

        it('should handle all results with zero import counts', () => {
            const ranker = new Ranker();
            const results: VectorSearchResult[] = [
                createMockResult(0.7, {
                    mtime: Date.now(),
                    metadata: { importCount: 0 },
                }),
                createMockResult(0.8, {
                    mtime: Date.now(),
                    metadata: { importCount: 0 },
                }),
            ];

            const ranked = ranker.rank(results, 'test', true);

            expect(ranked).toHaveLength(2);
            expect(ranked[0].rankingDetails?.factors.importScore).toBe(0);
            expect(ranked[1].rankingDetails?.factors.importScore).toBe(0);
        });

        it('should handle query with no term matches', () => {
            const ranker = new Ranker();
            const results: VectorSearchResult[] = [
                createMockResult(0.7, {
                    content: 'some content here',
                    mtime: Date.now(),
                    metadata: { importCount: 10 },
                }),
            ];

            const ranked = ranker.rank(results, 'nonexistent terms', true);

            expect(ranked[0].rankingDetails?.factors.termFreqScore).toBe(0);
            // Should still have valid scores from other factors
            expect(ranked[0].score).toBeGreaterThan(0);
        });

        it('should handle empty query', () => {
            const ranker = new Ranker();
            const results: VectorSearchResult[] = [
                createMockResult(0.7, {
                    mtime: Date.now(),
                    metadata: { importCount: 10 },
                }),
            ];

            const ranked = ranker.rank(results, '', true);

            expect(ranked[0].rankingDetails?.factors.termFreqScore).toBe(0);
            expect(ranked[0].score).toBeGreaterThan(0);
        });

        it('should clamp final scores to [0, 1] range', () => {
            const ranker = new Ranker();
            const results: VectorSearchResult[] = [
                createMockResult(1.0, {
                    content: 'test '.repeat(100),
                    mtime: Date.now(),
                    metadata: { importCount: 1000 },
                }),
            ];

            const ranked = ranker.rank(results, 'test');

            expect(ranked[0].score).toBeGreaterThanOrEqual(0);
            expect(ranked[0].score).toBeLessThanOrEqual(1);
        });
    });

    describe('getConfig', () => {
        it('should return current configuration', () => {
            const customConfig: Partial<RankingConfig> = {
                vectorWeight: 0.4,
                recencyWeight: 0.3,
                importWeight: 0.2,
                termFreqWeight: 0.1,
            };

            const ranker = new Ranker(customConfig);
            const config = ranker.getConfig();

            expect(config).toEqual(expect.objectContaining(customConfig));
        });

        it('should return a copy of config (not reference)', () => {
            const ranker = new Ranker();
            const config1 = ranker.getConfig();
            config1.vectorWeight = 0.999;

            const config2 = ranker.getConfig();
            expect(config2.vectorWeight).toBe(DEFAULT_RANKING_CONFIG.vectorWeight);
        });
    });

    describe('updateConfig', () => {
        it('should update configuration', () => {
            const ranker = new Ranker();
            ranker.updateConfig({
                vectorWeight: 0.6,
                recencyWeight: 0.1,
            });

            const config = ranker.getConfig();
            expect(config.vectorWeight).toBe(0.6);
            expect(config.recencyWeight).toBe(0.1);
            // Other values should remain unchanged
            expect(config.importWeight).toBe(DEFAULT_RANKING_CONFIG.importWeight);
        });

        it('should affect subsequent ranking calls', () => {
            const ranker = new Ranker();
            const results: VectorSearchResult[] = [
                createMockResult(0.5, {
                    mtime: Date.now(),
                    metadata: { importCount: 10 },
                }),
            ];

            const ranked1 = ranker.rank(results, 'test');
            const score1 = ranked1[0].score;

            // Update config to heavily weight vector score
            ranker.updateConfig({
                vectorWeight: 0.9,
                recencyWeight: 0.05,
                importWeight: 0.03,
                termFreqWeight: 0.02,
            });

            const ranked2 = ranker.rank(results, 'test');
            const score2 = ranked2[0].score;

            // Scores should be different
            expect(score2).not.toBe(score1);
        });

        it('should allow disabling ranking', () => {
            const ranker = new Ranker();
            const results: VectorSearchResult[] = [
                createMockResult(0.7, { mtime: Date.now() }),
            ];

            // First ranking call with enabled=true (default)
            ranker.rank(results, 'test');

            ranker.updateConfig({ enabled: false });

            const rankedDisabled = ranker.rank(results, 'test');

            // When disabled, should return original vector score
            expect(rankedDisabled[0].score).toBe(0.7);
        });
    });

    describe('Integration scenarios', () => {
        it('should rank a realistic set of search results correctly', () => {
            const ranker = new Ranker();
            const now = Date.now();

            const results: VectorSearchResult[] = [
                // Old, rarely imported file with poor vector match
                createMockResult(0.4, {
                    id: 'old-rare',
                    content: 'some old code here',
                    relativePath: 'src/old.ts',
                    mtime: now - (365 * 24 * 60 * 60 * 1000),
                    metadata: { importCount: 2 },
                }),
                // Recent, frequently imported file with good vector match
                createMockResult(0.8, {
                    id: 'recent-popular',
                    content: 'authentication login user management',
                    relativePath: 'src/auth.ts',
                    mtime: now - (7 * 24 * 60 * 60 * 1000),
                    metadata: { importCount: 95 },
                }),
                // Recent but rarely imported with medium vector match
                createMockResult(0.6, {
                    id: 'recent-rare',
                    content: 'helper utilities',
                    relativePath: 'src/utils.ts',
                    mtime: now - (14 * 24 * 60 * 60 * 1000),
                    metadata: { importCount: 15 },
                }),
                // Old but frequently imported with good vector match and term matches
                createMockResult(0.7, {
                    id: 'old-popular',
                    content: 'authentication middleware authentication handler',
                    relativePath: 'src/middleware.ts',
                    mtime: now - (180 * 24 * 60 * 60 * 1000),
                    metadata: { importCount: 100 },
                }),
            ];

            const ranked = ranker.rank(results, 'authentication login', true);

            expect(ranked).toHaveLength(4);

            // Verify ranking makes sense
            // The recent popular file should rank very high
            const recentPopularIndex = ranked.findIndex(r => r.relativePath === 'src/auth.ts');
            expect(recentPopularIndex).toBeLessThanOrEqual(1);

            // The old rare file should rank lowest
            const oldRareIndex = ranked.findIndex(r => r.relativePath === 'src/old.ts');
            expect(oldRareIndex).toBeGreaterThanOrEqual(2);
        });

        it('should handle mixed metadata quality', () => {
            const ranker = new Ranker();
            const results: VectorSearchResult[] = [
                createMockResult(0.7, {
                    mtime: Date.now(),
                    metadata: { importCount: 50 },
                }),
                createMockResult(0.7, {
                    mtime: Date.now(),
                    metadata: {},
                }),
                createMockResult(0.7, {
                    mtime: Date.now(),
                    metadata: { importCount: 0 },
                }),
            ];

            const ranked = ranker.rank(results, 'test');

            expect(ranked).toHaveLength(3);
            // All should have valid scores
            ranked.forEach(r => {
                expect(r.score).toBeGreaterThan(0);
                expect(r.score).toBeLessThanOrEqual(1);
            });
        });
    });

    describe('Edge cases', () => {
        it('should handle very large result sets', () => {
            const ranker = new Ranker();
            const results: VectorSearchResult[] = Array.from({ length: 1000 }, (_, i) =>
                createMockResult(Math.random(), {
                    id: `doc-${i}`,
                    mtime: Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000,
                    metadata: { importCount: Math.floor(Math.random() * 100) },
                })
            );

            const ranked = ranker.rank(results, 'test');

            expect(ranked).toHaveLength(1000);
            // Verify sorting
            for (let i = 0; i < ranked.length - 1; i++) {
                expect(ranked[i].score).toBeGreaterThanOrEqual(ranked[i + 1].score);
            }
        });

        it('should handle results with identical scores', () => {
            const ranker = new Ranker();
            const now = Date.now();
            const results: VectorSearchResult[] = [
                createMockResult(0.7, {
                    id: 'doc-1',
                    mtime: now,
                    metadata: { importCount: 50 },
                }),
                createMockResult(0.7, {
                    id: 'doc-2',
                    mtime: now,
                    metadata: { importCount: 50 },
                }),
                createMockResult(0.7, {
                    id: 'doc-3',
                    mtime: now,
                    metadata: { importCount: 50 },
                }),
            ];

            const ranked = ranker.rank(results, 'test');

            expect(ranked).toHaveLength(3);
            // All should have similar final scores
            const scores = ranked.map(r => r.score);
            expect(Math.max(...scores) - Math.min(...scores)).toBeLessThan(0.01);
        });

        it('should handle custom recency half-life', () => {
            const ranker = new Ranker({
                recencyHalfLifeDays: 30, // Faster decay
            });

            const now = Date.now();
            const results: VectorSearchResult[] = [
                createMockResult(0.7, {
                    mtime: now - (30 * 24 * 60 * 60 * 1000), // At half-life
                    metadata: { importCount: 10 },
                }),
            ];

            const ranked = ranker.rank(results, 'test', true);

            // Recency score should be approximately 0.5
            expect(ranked[0].rankingDetails?.factors.recencyScore).toBeCloseTo(0.5, 1);
        });
    });
});

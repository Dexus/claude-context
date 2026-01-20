/**
 * A/B Testing Framework for Ranking Comparison
 *
 * This module provides tools to compare two ranking configurations
 * and measure ranking quality improvements using standard IR metrics:
 * - NDCG (Normalized Discounted Cumulative Gain)
 * - MRR (Mean Reciprocal Rank)
 * - Precision@k
 */

import { Ranker } from './ranker';
import { RankingConfig, RankedSearchResult } from './types';
import { VectorSearchResult } from '../vectordb/types';

/**
 * Test query with expected relevant document IDs
 */
export interface TestQuery {
    /** The search query text */
    query: string;
    /** List of document IDs considered relevant (in order of decreasing relevance) */
    relevantDocIds: string[];
}

/**
 * Relevance judgment for a document
 * Maps document ID to relevance score (typically 0-3 or 0-5)
 */
export interface RelevanceJudgment {
    /** Document ID */
    docId: string;
    /** Relevance score (higher is more relevant) */
    relevance: number;
}

/**
 * A/B test comparison results
 */
export interface ABTestResult {
    /** Test configuration summary */
    summary: {
        /** Total number of queries tested */
        totalQueries: number;
        /** Total number of documents across all queries */
        totalDocuments: number;
        /** Timestamp when test was run */
        timestamp: string;
    };
    /** Metrics for configuration A */
    configA: {
        name: string;
        config: RankingConfig;
        metrics: RankingMetrics;
    };
    /** Metrics for configuration B */
    configB: {
        name: string;
        config: RankingConfig;
        metrics: RankingMetrics;
    };
    /** Comparison analysis */
    comparison: {
        /** Which config performed better overall */
        winner: 'A' | 'B' | 'tie';
        /** Detailed per-metric improvements (positive means B is better) */
        improvements: {
            ndcg: number;
            mrr: number;
            precisionAt5: number;
            precisionAt10: number;
        };
    };
    /** Per-query detailed results (optional) */
    queryResults?: QueryComparisonResult[];
}

/**
 * Ranking quality metrics
 */
export interface RankingMetrics {
    /** Normalized Discounted Cumulative Gain (0-1, higher is better) */
    ndcg: number;
    /** Mean Reciprocal Rank (0-1, higher is better) */
    mrr: number;
    /** Precision at 5 (0-1, higher is better) */
    precisionAt5: number;
    /** Precision at 10 (0-1, higher is better) */
    precisionAt10: number;
}

/**
 * Per-query comparison result
 */
export interface QueryComparisonResult {
    query: string;
    configAMetrics: RankingMetrics;
    configBMetrics: RankingMetrics;
    rankingDifferences: {
        /** Documents that changed position significantly */
        movers: Array<{
            docId: string;
            positionA: number;
            positionB: number;
            positionChange: number;
        }>;
    };
}

/**
 * A/B Test Framework
 *
 * Compare two ranking configurations and measure quality improvements
 */
export class ABTest {
    /**
     * Run an A/B test comparing two ranking configurations
     *
     * @param testQueries Array of test queries with relevance judgments
     * @param mockResults Mock vector search results to rank
     * @param configA First ranking configuration
     * @param configB Second ranking configuration
     * @param options Test options
     * @returns A/B test results with detailed metrics
     */
    static runTest(
        testQueries: TestQuery[],
        mockResults: Map<string, VectorSearchResult[]>,
        configA: { name: string; config: Partial<RankingConfig> },
        configB: { name: string; config: Partial<RankingConfig> },
        options: {
            /** Include per-query detailed results */
            includeQueryResults?: boolean;
            /** Log progress to console */
            verbose?: boolean;
        } = {}
    ): ABTestResult {
        const rankerA = new Ranker(configA.config);
        const rankerB = new Ranker(configB.config);

        const metricsA: RankingMetrics[] = [];
        const metricsB: RankingMetrics[] = [];
        const queryResults: QueryComparisonResult[] = [];

        let totalDocuments = 0;

        // Process each test query
        for (const testQuery of testQueries) {
            const results = mockResults.get(testQuery.query);
            if (!results || results.length === 0) {
                if (options.verbose) {
                    // Log skipped query
                }
                continue;
            }

            totalDocuments += results.length;

            // Rank with both configurations
            const rankedA = rankerA.rank(results, testQuery.query, false);
            const rankedB = rankerB.rank(results, testQuery.query, false);

            // Calculate metrics for both
            const queryMetricsA = this.calculateMetrics(rankedA, testQuery.relevantDocIds);
            const queryMetricsB = this.calculateMetrics(rankedB, testQuery.relevantDocIds);

            metricsA.push(queryMetricsA);
            metricsB.push(queryMetricsB);

            // Track per-query results if requested
            if (options.includeQueryResults) {
                queryResults.push({
                    query: testQuery.query,
                    configAMetrics: queryMetricsA,
                    configBMetrics: queryMetricsB,
                    rankingDifferences: this.findRankingDifferences(rankedA, rankedB),
                });
            }

            if (options.verbose) {
                // Log progress
            }
        }

        // Aggregate metrics
        const avgMetricsA = this.averageMetrics(metricsA);
        const avgMetricsB = this.averageMetrics(metricsB);

        // Compare and determine winner
        const improvements = {
            ndcg: avgMetricsB.ndcg - avgMetricsA.ndcg,
            mrr: avgMetricsB.mrr - avgMetricsA.mrr,
            precisionAt5: avgMetricsB.precisionAt5 - avgMetricsA.precisionAt5,
            precisionAt10: avgMetricsB.precisionAt10 - avgMetricsA.precisionAt10,
        };

        // Calculate overall winner (simple majority vote)
        let scoreDiff = 0;
        if (improvements.ndcg > 0.01) scoreDiff++;
        else if (improvements.ndcg < -0.01) scoreDiff--;
        if (improvements.mrr > 0.01) scoreDiff++;
        else if (improvements.mrr < -0.01) scoreDiff--;
        if (improvements.precisionAt5 > 0.01) scoreDiff++;
        else if (improvements.precisionAt5 < -0.01) scoreDiff--;
        if (improvements.precisionAt10 > 0.01) scoreDiff++;
        else if (improvements.precisionAt10 < -0.01) scoreDiff--;

        const winner: 'A' | 'B' | 'tie' = scoreDiff > 0 ? 'B' : scoreDiff < 0 ? 'A' : 'tie';

        const result: ABTestResult = {
            summary: {
                totalQueries: testQueries.length,
                totalDocuments,
                timestamp: new Date().toISOString(),
            },
            configA: {
                name: configA.name,
                config: rankerA.getConfig(),
                metrics: avgMetricsA,
            },
            configB: {
                name: configB.name,
                config: rankerB.getConfig(),
                metrics: avgMetricsB,
            },
            comparison: {
                winner,
                improvements,
            },
        };

        if (options.includeQueryResults) {
            result.queryResults = queryResults;
        }

        return result;
    }

    /**
     * Calculate ranking quality metrics for a single query
     *
     * @param rankedResults Ranked search results
     * @param relevantDocIds List of relevant document IDs (in order of decreasing relevance)
     * @returns Ranking metrics
     */
    private static calculateMetrics(
        rankedResults: RankedSearchResult[],
        relevantDocIds: string[]
    ): RankingMetrics {
        // Extract document IDs from ranked results
        const rankedDocIds = rankedResults.map(r => this.getDocId(r));

        // Calculate NDCG
        const ndcg = this.calculateNDCG(rankedDocIds, relevantDocIds);

        // Calculate MRR
        const mrr = this.calculateMRR(rankedDocIds, relevantDocIds);

        // Calculate Precision@k
        const precisionAt5 = this.calculatePrecisionAtK(rankedDocIds, relevantDocIds, 5);
        const precisionAt10 = this.calculatePrecisionAtK(rankedDocIds, relevantDocIds, 10);

        return {
            ndcg,
            mrr,
            precisionAt5,
            precisionAt10,
        };
    }

    /**
     * Calculate NDCG (Normalized Discounted Cumulative Gain)
     *
     * @param rankedDocIds Ranked document IDs
     * @param relevantDocIds Relevant document IDs (in order of decreasing relevance)
     * @returns NDCG score (0-1)
     */
    private static calculateNDCG(rankedDocIds: string[], relevantDocIds: string[]): number {
        if (relevantDocIds.length === 0) return 0;

        // Calculate DCG (Discounted Cumulative Gain)
        let dcg = 0;
        for (let i = 0; i < rankedDocIds.length; i++) {
            const docId = rankedDocIds[i];
            const relevanceIndex = relevantDocIds.indexOf(docId);
            if (relevanceIndex !== -1) {
                // Relevance score decreases with position in relevantDocIds
                const relevance = relevantDocIds.length - relevanceIndex;
                // Discount by position (1-based indexing)
                dcg += relevance / Math.log2(i + 2);
            }
        }

        // Calculate IDCG (Ideal DCG) - best possible ordering
        let idcg = 0;
        for (let i = 0; i < Math.min(rankedDocIds.length, relevantDocIds.length); i++) {
            const relevance = relevantDocIds.length - i;
            idcg += relevance / Math.log2(i + 2);
        }

        return idcg === 0 ? 0 : dcg / idcg;
    }

    /**
     * Calculate MRR (Mean Reciprocal Rank)
     *
     * @param rankedDocIds Ranked document IDs
     * @param relevantDocIds Relevant document IDs
     * @returns MRR score (0-1)
     */
    private static calculateMRR(rankedDocIds: string[], relevantDocIds: string[]): number {
        if (relevantDocIds.length === 0) return 0;

        // Find first relevant document
        for (let i = 0; i < rankedDocIds.length; i++) {
            if (relevantDocIds.includes(rankedDocIds[i])) {
                return 1 / (i + 1);
            }
        }

        return 0;
    }

    /**
     * Calculate Precision@k
     *
     * @param rankedDocIds Ranked document IDs
     * @param relevantDocIds Relevant document IDs
     * @param k Number of top results to consider
     * @returns Precision@k score (0-1)
     */
    private static calculatePrecisionAtK(
        rankedDocIds: string[],
        relevantDocIds: string[],
        k: number
    ): number {
        if (relevantDocIds.length === 0 || k === 0) return 0;

        const topK = rankedDocIds.slice(0, k);
        const relevantInTopK = topK.filter(docId => relevantDocIds.includes(docId)).length;

        return relevantInTopK / Math.min(k, rankedDocIds.length);
    }

    /**
     * Average metrics across multiple queries
     *
     * @param metrics Array of metrics from different queries
     * @returns Averaged metrics
     */
    private static averageMetrics(metrics: RankingMetrics[]): RankingMetrics {
        if (metrics.length === 0) {
            return {
                ndcg: 0,
                mrr: 0,
                precisionAt5: 0,
                precisionAt10: 0,
            };
        }

        const sum = metrics.reduce(
            (acc, m) => ({
                ndcg: acc.ndcg + m.ndcg,
                mrr: acc.mrr + m.mrr,
                precisionAt5: acc.precisionAt5 + m.precisionAt5,
                precisionAt10: acc.precisionAt10 + m.precisionAt10,
            }),
            { ndcg: 0, mrr: 0, precisionAt5: 0, precisionAt10: 0 }
        );

        return {
            ndcg: sum.ndcg / metrics.length,
            mrr: sum.mrr / metrics.length,
            precisionAt5: sum.precisionAt5 / metrics.length,
            precisionAt10: sum.precisionAt10 / metrics.length,
        };
    }

    /**
     * Find ranking differences between two result sets
     *
     * @param rankedA Results from configuration A
     * @param rankedB Results from configuration B
     * @returns Ranking differences analysis
     */
    private static findRankingDifferences(
        rankedA: RankedSearchResult[],
        rankedB: RankedSearchResult[]
    ): QueryComparisonResult['rankingDifferences'] {
        const movers: QueryComparisonResult['rankingDifferences']['movers'] = [];

        // Build position maps
        const positionsA = new Map<string, number>();
        const positionsB = new Map<string, number>();

        rankedA.forEach((result, index) => {
            positionsA.set(this.getDocId(result), index);
        });

        rankedB.forEach((result, index) => {
            positionsB.set(this.getDocId(result), index);
        });

        // Find documents with significant position changes (>= 3 positions)
        for (const [docId, posA] of positionsA) {
            const posB = positionsB.get(docId);
            if (posB !== undefined) {
                const change = posA - posB;
                if (Math.abs(change) >= 3) {
                    movers.push({
                        docId,
                        positionA: posA,
                        positionB: posB,
                        positionChange: change,
                    });
                }
            }
        }

        // Sort by absolute position change (largest first)
        movers.sort((a, b) => Math.abs(b.positionChange) - Math.abs(a.positionChange));

        return { movers };
    }

    /**
     * Extract document ID from a ranked result
     * Uses relativePath as the document ID for matching
     *
     * @param result Ranked search result
     * @returns Document ID
     */
    private static getDocId(result: RankedSearchResult): string {
        return `${result.relativePath}:${result.startLine}-${result.endLine}`;
    }

    /**
     * Format test results as a human-readable report
     *
     * @param result A/B test result
     * @returns Formatted report string
     */
    static formatReport(result: ABTestResult): string {
        const lines: string[] = [];

        lines.push('=== A/B Test Results ===');
        lines.push('');
        lines.push(`Total Queries: ${result.summary.totalQueries}`);
        lines.push(`Total Documents: ${result.summary.totalDocuments}`);
        lines.push(`Timestamp: ${result.summary.timestamp}`);
        lines.push('');

        lines.push(`Configuration A: ${result.configA.name}`);
        lines.push(`  NDCG: ${result.configA.metrics.ndcg.toFixed(4)}`);
        lines.push(`  MRR: ${result.configA.metrics.mrr.toFixed(4)}`);
        lines.push(`  Precision@5: ${result.configA.metrics.precisionAt5.toFixed(4)}`);
        lines.push(`  Precision@10: ${result.configA.metrics.precisionAt10.toFixed(4)}`);
        lines.push('');

        lines.push(`Configuration B: ${result.configB.name}`);
        lines.push(`  NDCG: ${result.configB.metrics.ndcg.toFixed(4)}`);
        lines.push(`  MRR: ${result.configB.metrics.mrr.toFixed(4)}`);
        lines.push(`  Precision@5: ${result.configB.metrics.precisionAt5.toFixed(4)}`);
        lines.push(`  Precision@10: ${result.configB.metrics.precisionAt10.toFixed(4)}`);
        lines.push('');

        lines.push(`Winner: ${result.comparison.winner.toUpperCase()}`);
        lines.push('');

        lines.push('Improvements (B vs A):');
        const sign = (n: number) => (n >= 0 ? '+' : '');
        lines.push(`  NDCG: ${sign(result.comparison.improvements.ndcg)}${result.comparison.improvements.ndcg.toFixed(4)}`);
        lines.push(`  MRR: ${sign(result.comparison.improvements.mrr)}${result.comparison.improvements.mrr.toFixed(4)}`);
        lines.push(`  Precision@5: ${sign(result.comparison.improvements.precisionAt5)}${result.comparison.improvements.precisionAt5.toFixed(4)}`);
        lines.push(`  Precision@10: ${sign(result.comparison.improvements.precisionAt10)}${result.comparison.improvements.precisionAt10.toFixed(4)}`);

        return lines.join('\n');
    }
}

/**
 * Ranker class that combines all ranking factors into a final score
 * Applies configurable weights to vector similarity, recency, import frequency, and term frequency
 */

import { VectorSearchResult } from '../vectordb/types';
import { RankingConfig, RankedSearchResult, RankingFactors, DEFAULT_RANKING_CONFIG } from './types';
import { calculateAllFactors } from './factors';

export class Ranker {
    private config: RankingConfig;

    constructor(config: Partial<RankingConfig> = {}) {
        // Merge provided config with defaults
        this.config = {
            ...DEFAULT_RANKING_CONFIG,
            ...config,
        };
    }

    /**
     * Rank search results by combining all ranking factors
     *
     * @param results Vector search results to rank
     * @param query Original search query for term frequency scoring
     * @param includeDetails Whether to include detailed ranking breakdown (default: false)
     * @returns Ranked search results sorted by final score
     */
    rank(
        results: VectorSearchResult[],
        query: string,
        includeDetails: boolean = false
    ): RankedSearchResult[] {
        // If ranking is disabled, return results as-is with original scores
        if (this.config.enabled === false) {
            return results.map(result => ({
                content: result.document.content,
                relativePath: result.document.relativePath,
                startLine: result.document.startLine,
                endLine: result.document.endLine,
                language: result.document.fileExtension,
                score: result.score,
            }));
        }

        // Calculate max import count across all results for normalization
        const maxImportCount = this.calculateMaxImportCount(results);

        // Calculate final scores for each result
        const rankedResults = results.map(result => {
            const vectorScore = result.score;

            // Calculate other ranking factors
            const factors = calculateAllFactors(
                result.document,
                query,
                maxImportCount,
                this.config.recencyHalfLifeDays
            );

            // Combine all factors with weights
            const finalScore = this.combineFactors({
                vectorScore,
                ...factors,
            });

            const rankedResult: RankedSearchResult = {
                content: result.document.content,
                relativePath: result.document.relativePath,
                startLine: result.document.startLine,
                endLine: result.document.endLine,
                language: result.document.fileExtension,
                score: finalScore,
            };

            // Include ranking details if requested
            if (includeDetails) {
                rankedResult.rankingDetails = {
                    factors: {
                        vectorScore,
                        ...factors,
                    },
                    finalScore,
                };
            }

            return rankedResult;
        });

        // Sort by final score descending
        rankedResults.sort((a, b) => b.score - a.score);

        return rankedResults;
    }

    /**
     * Combine all ranking factors into a final score using configured weights
     *
     * @param factors Individual ranking factor scores
     * @returns Final combined score
     */
    private combineFactors(factors: RankingFactors): number {
        const score =
            this.config.vectorWeight * factors.vectorScore +
            this.config.recencyWeight * factors.recencyScore +
            this.config.importWeight * factors.importScore +
            this.config.termFreqWeight * factors.termFreqScore;

        // Clamp to [0, 1] range
        return Math.max(0, Math.min(1, score));
    }

    /**
     * Calculate the maximum import count across all search results
     * Used for normalizing import scores
     *
     * @param results Vector search results
     * @returns Maximum import count
     */
    private calculateMaxImportCount(results: VectorSearchResult[]): number {
        let maxCount = 0;
        for (const result of results) {
            const importCount = result.document.metadata?.importCount ?? 0;
            maxCount = Math.max(maxCount, importCount);
        }
        return maxCount;
    }

    /**
     * Get current ranking configuration
     *
     * @returns Current ranking config
     */
    getConfig(): RankingConfig {
        return { ...this.config };
    }

    /**
     * Update ranking configuration
     *
     * @param config Partial config to merge with current config
     */
    updateConfig(config: Partial<RankingConfig>): void {
        this.config = {
            ...this.config,
            ...config,
        };
    }
}

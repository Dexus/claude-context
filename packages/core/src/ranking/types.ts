/**
 * Individual ranking factor scores
 * Each score should be normalized to [0, 1] range
 */
export interface RankingFactors {
    /** Vector similarity score from semantic search */
    vectorScore: number;
    /** Recency score based on file modification time */
    recencyScore: number;
    /** Import frequency score based on how often the file is imported */
    importScore: number;
    /** Term frequency score based on query term matches in content */
    termFreqScore: number;
}

/**
 * Configuration for the ranking system
 * Weights determine the relative importance of each ranking factor
 */
export interface RankingConfig {
    /** Weight for vector similarity score (default: 0.5) */
    vectorWeight: number;
    /** Weight for recency score (default: 0.2) */
    recencyWeight: number;
    /** Weight for import frequency score (default: 0.2) */
    importWeight: number;
    /** Weight for term frequency score (default: 0.1) */
    termFreqWeight: number;
    /** Half-life in days for recency decay (default: 90) */
    recencyHalfLifeDays?: number;
    /** Enable ranking system (default: true) */
    enabled?: boolean;
}

/**
 * Search result with ranking details
 * Extends the base search result with detailed ranking information
 */
export interface RankedSearchResult {
    /** Document content */
    content: string;
    /** File path relative to repository root */
    relativePath: string;
    /** Starting line number in the file */
    startLine: number;
    /** Ending line number in the file */
    endLine: number;
    /** Programming language */
    language: string;
    /** Final combined score */
    score: number;
    /** Detailed breakdown of ranking factors (optional, useful for debugging) */
    rankingDetails?: {
        /** Individual factor scores */
        factors: RankingFactors;
        /** Final combined score after applying weights */
        finalScore: number;
    };
}

/**
 * Default ranking configuration
 */
export const DEFAULT_RANKING_CONFIG: RankingConfig = {
    vectorWeight: 0.5,
    recencyWeight: 0.2,
    importWeight: 0.2,
    termFreqWeight: 0.1,
    recencyHalfLifeDays: 90,
    enabled: true,
};

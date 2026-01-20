export interface SearchQuery {
    term: string;
    includeContent?: boolean;
    limit?: number;
}

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

export interface SemanticSearchResult {
    content: string;
    relativePath: string;
    startLine: number;
    endLine: number;
    language: string;
    score: number;
    /** Detailed breakdown of ranking factors (optional, useful for debugging and A/B testing) */
    rankingDetails?: {
        /** Individual factor scores */
        factors: RankingFactors;
        /** Final combined score after applying weights */
        finalScore: number;
    };
}

export type AgentSearchStrategy = 'iterative' | 'breadth-first' | 'focused';

export interface AgentSearchStep {
    stepNumber: number;
    query: string;
    explanation: string;
    results: SemanticSearchResult[];
    timestamp: number;
}

export interface AgentSearchResult {
    originalQuery: string;
    strategy: AgentSearchStrategy;
    steps: AgentSearchStep[];
    combinedResults: SemanticSearchResult[];
    totalIterations: number;
    completed: boolean;
    summary: string;
}

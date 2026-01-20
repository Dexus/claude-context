export interface SearchQuery {
    term: string;
    includeContent?: boolean;
    limit?: number;
}

export interface SemanticSearchResult {
    content: string;
    relativePath: string;
    startLine: number;
    endLine: number;
    language: string;
    score: number;
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

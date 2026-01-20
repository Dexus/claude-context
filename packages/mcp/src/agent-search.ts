import { Context, AgentSearchStrategy, AgentSearchResult, AgentSearchStep, SemanticSearchResult } from "@dannyboy2042/claude-context-core";

/**
 * AgentSearch - Orchestrates multi-step, iterative code searches
 *
 * This class implements an agent that can perform complex searches by:
 * - Breaking down queries into multiple search steps
 * - Refining searches based on initial results
 * - Combining and deduplicating results across iterations
 * - Explaining its search strategy to users
 *
 * Search strategies:
 * - iterative: Start broad, refine based on results (default)
 * - breadth-first: Search multiple related queries in parallel
 * - focused: Deep dive into specific areas based on initial findings
 */
export class AgentSearch {
    private context: Context;
    private maxIterations: number;
    private currentIteration: number;
    private steps: AgentSearchStep[];
    private allResults: SemanticSearchResult[];

    constructor(context: Context, maxIterations: number = 5) {
        this.context = context;
        this.maxIterations = Math.max(1, Math.min(maxIterations, 10)); // Clamp between 1-10
        this.currentIteration = 0;
        this.steps = [];
        this.allResults = [];
    }

    /**
     * Execute an agent-based search with the specified strategy
     * @param codebasePath Path to the codebase to search
     * @param query Initial search query
     * @param strategy Search strategy to use
     * @param limit Maximum results per search step
     * @param filterExpr Optional filter expression for file extensions
     * @returns AgentSearchResult with all steps and combined results
     */
    public async execute(
        codebasePath: string,
        query: string,
        strategy: AgentSearchStrategy = 'iterative',
        limit: number = 10,
        filterExpr?: string
    ): Promise<AgentSearchResult> {
        console.log(`[AGENT-SEARCH] 🤖 Starting agent search with strategy: ${strategy}`);
        console.log(`[AGENT-SEARCH] 📝 Query: "${query}"`);
        console.log(`[AGENT-SEARCH] 🎯 Max iterations: ${this.maxIterations}`);

        // Reset state for new search
        this.currentIteration = 0;
        this.steps = [];
        this.allResults = [];

        // Execute search based on strategy
        let completed = false;
        try {
            switch (strategy) {
                case 'iterative':
                    completed = await this.executeIterativeSearch(codebasePath, query, limit, filterExpr);
                    break;
                case 'breadth-first':
                    completed = await this.executeBreadthFirstSearch(codebasePath, query, limit, filterExpr);
                    break;
                case 'focused':
                    completed = await this.executeFocusedSearch(codebasePath, query, limit, filterExpr);
                    break;
                default:
                    throw new Error(`Unknown strategy: ${strategy}`);
            }
        } catch (error: any) {
            console.error(`[AGENT-SEARCH] ❌ Error during search:`, error.message || error);
            // Return partial results on error
            completed = false;
        }

        // Combine and deduplicate results (will be enhanced in subtask-1-4)
        const combinedResults = this.combineResults();

        // Generate summary
        const summary = this.generateSummary(query, strategy, completed);

        console.log(`[AGENT-SEARCH] ✅ Search completed: ${this.steps.length} steps, ${combinedResults.length} unique results`);

        return {
            originalQuery: query,
            strategy,
            steps: this.steps,
            combinedResults,
            totalIterations: this.currentIteration,
            completed,
            summary
        };
    }

    /**
     * Iterative search: Start with initial query, refine based on results
     * This is the default strategy for most use cases
     */
    private async executeIterativeSearch(
        codebasePath: string,
        query: string,
        limit: number,
        filterExpr?: string
    ): Promise<boolean> {
        console.log(`[AGENT-SEARCH] 🔄 Executing iterative search strategy`);

        let currentQuery = query;
        let shouldContinue = true;

        while (this.currentIteration < this.maxIterations && shouldContinue) {
            this.currentIteration++;

            const explanation = this.currentIteration === 1
                ? `Initial search for: "${currentQuery}"`
                : `Refined search (iteration ${this.currentIteration}): "${currentQuery}"`;

            console.log(`[AGENT-SEARCH] 📍 Step ${this.currentIteration}: ${explanation}`);

            // Perform search
            const results = await this.performSearch(
                codebasePath,
                currentQuery,
                limit,
                filterExpr
            );

            // Record step
            this.recordStep(currentQuery, explanation, results);

            // Check if we should continue (will be enhanced in subtask-1-3)
            shouldContinue = this.shouldRefineSearch(results);

            if (shouldContinue && this.currentIteration < this.maxIterations) {
                // Generate refined query (will be enhanced in subtask-1-3)
                currentQuery = this.generateRefinedQuery(query, results);
                console.log(`[AGENT-SEARCH] 🎯 Refining search to: "${currentQuery}"`);
            }
        }

        const completed = !shouldContinue || this.currentIteration < this.maxIterations;
        if (!completed) {
            console.log(`[AGENT-SEARCH] ⚠️  Reached maximum iteration limit (${this.maxIterations})`);
        }

        return completed;
    }

    /**
     * Breadth-first search: Search multiple related queries in parallel
     * Useful for exploring different aspects of a feature
     */
    private async executeBreadthFirstSearch(
        codebasePath: string,
        query: string,
        limit: number,
        filterExpr?: string
    ): Promise<boolean> {
        console.log(`[AGENT-SEARCH] 🌊 Executing breadth-first search strategy`);

        // Generate related queries (will be enhanced in subtask-1-3)
        const relatedQueries = this.generateRelatedQueries(query);
        console.log(`[AGENT-SEARCH] 📋 Generated ${relatedQueries.length} related queries`);

        // Search each query (respecting iteration limit)
        for (const relatedQuery of relatedQueries) {
            if (this.currentIteration >= this.maxIterations) {
                console.log(`[AGENT-SEARCH] ⚠️  Reached maximum iteration limit (${this.maxIterations})`);
                return false;
            }

            this.currentIteration++;

            const explanation = `Breadth-first exploration (${this.currentIteration}/${relatedQueries.length}): "${relatedQuery}"`;
            console.log(`[AGENT-SEARCH] 📍 Step ${this.currentIteration}: ${explanation}`);

            const results = await this.performSearch(
                codebasePath,
                relatedQuery,
                limit,
                filterExpr
            );

            this.recordStep(relatedQuery, explanation, results);
        }

        return true;
    }

    /**
     * Focused search: Deep dive into specific areas based on initial findings
     * Useful for tracing call chains or understanding implementation details
     */
    private async executeFocusedSearch(
        codebasePath: string,
        query: string,
        limit: number,
        filterExpr?: string
    ): Promise<boolean> {
        console.log(`[AGENT-SEARCH] 🎯 Executing focused search strategy`);

        // Initial broad search
        this.currentIteration++;
        const explanation = `Initial broad search: "${query}"`;
        console.log(`[AGENT-SEARCH] 📍 Step ${this.currentIteration}: ${explanation}`);

        const initialResults = await this.performSearch(
            codebasePath,
            query,
            limit,
            filterExpr
        );

        this.recordStep(query, explanation, initialResults);

        // If we have results, perform focused deep dives (will be enhanced in subtask-1-3)
        if (initialResults.length > 0 && this.currentIteration < this.maxIterations) {
            const focusAreas = this.identifyFocusAreas(initialResults);
            console.log(`[AGENT-SEARCH] 🔍 Identified ${focusAreas.length} focus areas for deep dive`);

            for (const focusQuery of focusAreas) {
                if (this.currentIteration >= this.maxIterations) {
                    console.log(`[AGENT-SEARCH] ⚠️  Reached maximum iteration limit (${this.maxIterations})`);
                    return false;
                }

                this.currentIteration++;

                const focusExplanation = `Deep dive (${this.currentIteration}): "${focusQuery}"`;
                console.log(`[AGENT-SEARCH] 📍 Step ${this.currentIteration}: ${focusExplanation}`);

                const focusResults = await this.performSearch(
                    codebasePath,
                    focusQuery,
                    limit,
                    filterExpr
                );

                this.recordStep(focusQuery, focusExplanation, focusResults);
            }
        }

        return true;
    }

    /**
     * Perform a single search step using the Context
     */
    private async performSearch(
        codebasePath: string,
        query: string,
        limit: number,
        filterExpr?: string
    ): Promise<SemanticSearchResult[]> {
        try {
            const results = await this.context.semanticSearch(
                codebasePath,
                query,
                Math.min(limit, 50), // Cap at 50
                0.3, // Similarity threshold
                filterExpr
            );

            console.log(`[AGENT-SEARCH] ✅ Found ${results.length} results for: "${query}"`);
            return results;
        } catch (error: any) {
            console.error(`[AGENT-SEARCH] ❌ Search error for query "${query}":`, error.message || error);
            return [];
        }
    }

    /**
     * Record a search step with results
     */
    private recordStep(query: string, explanation: string, results: SemanticSearchResult[]): void {
        const step: AgentSearchStep = {
            stepNumber: this.currentIteration,
            query,
            explanation,
            results,
            timestamp: Date.now()
        };

        this.steps.push(step);
        this.allResults.push(...results);
    }

    /**
     * Determine if we should refine the search based on current results
     * This is a placeholder that will be enhanced in subtask-1-3
     */
    private shouldRefineSearch(results: SemanticSearchResult[]): boolean {
        // Simple heuristic for now: continue if we have results but not too many
        // Will be enhanced with more sophisticated logic in subtask-1-3
        if (results.length === 0) {
            console.log(`[AGENT-SEARCH] 🛑 No results found, stopping refinement`);
            return false;
        }

        if (results.length >= 10) {
            console.log(`[AGENT-SEARCH] 🛑 Sufficient results found (${results.length}), stopping refinement`);
            return false;
        }

        // Only refine once for now
        if (this.currentIteration > 1) {
            return false;
        }

        return true;
    }

    /**
     * Generate a refined query based on initial results
     * This is a placeholder that will be enhanced in subtask-1-3
     */
    private generateRefinedQuery(originalQuery: string, results: SemanticSearchResult[]): string {
        // Simple implementation for now: just return original query
        // Will be enhanced with semantic analysis in subtask-1-3
        return originalQuery;
    }

    /**
     * Generate related queries for breadth-first search
     * This is a placeholder that will be enhanced in subtask-1-3
     */
    private generateRelatedQueries(query: string): string[] {
        // Simple implementation: return variations of the query
        // Will be enhanced in subtask-1-3
        const queries = [query];

        // Add some basic variations
        if (!query.toLowerCase().includes('test')) {
            queries.push(`${query} tests`);
        }
        if (!query.toLowerCase().includes('implementation')) {
            queries.push(`${query} implementation`);
        }

        return queries.slice(0, 3); // Limit to 3 queries for now
    }

    /**
     * Identify focus areas for deep dive based on initial results
     * This is a placeholder that will be enhanced in subtask-1-3
     */
    private identifyFocusAreas(results: SemanticSearchResult[]): string[] {
        // Simple implementation: extract key terms from top results
        // Will be enhanced in subtask-1-3
        const focusAreas: string[] = [];

        if (results.length > 0) {
            // For now, just use the file paths as focus areas
            const topResult = results[0];
            const fileName = topResult.relativePath.split('/').pop() || '';
            if (fileName) {
                focusAreas.push(`functions in ${fileName}`);
            }
        }

        return focusAreas.slice(0, 2); // Limit to 2 focus areas
    }

    /**
     * Combine and deduplicate results from all steps
     * This is a basic implementation that will be enhanced in subtask-1-4
     */
    private combineResults(): SemanticSearchResult[] {
        // Simple deduplication by file path and line numbers
        // Will be enhanced with smarter merging in subtask-1-4
        const seen = new Set<string>();
        const combined: SemanticSearchResult[] = [];

        for (const result of this.allResults) {
            const key = `${result.relativePath}:${result.startLine}-${result.endLine}`;
            if (!seen.has(key)) {
                seen.add(key);
                combined.push(result);
            }
        }

        // Sort by score (highest first)
        combined.sort((a, b) => b.score - a.score);

        return combined;
    }

    /**
     * Generate a human-readable summary of the search
     */
    private generateSummary(query: string, strategy: AgentSearchStrategy, completed: boolean): string {
        const lines: string[] = [];

        lines.push(`🤖 Agent Search Summary`);
        lines.push(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        lines.push(`📝 Original Query: "${query}"`);
        lines.push(`🎯 Strategy: ${strategy}`);
        lines.push(`🔢 Total Steps: ${this.steps.length}`);
        lines.push(`📊 Unique Results: ${this.combineResults().length}`);
        lines.push(`✅ Completed: ${completed ? 'Yes' : 'No (reached iteration limit)'}`);
        lines.push('');

        lines.push(`🔍 Search Steps:`);
        for (const step of this.steps) {
            lines.push(`  ${step.stepNumber}. ${step.explanation}`);
            lines.push(`     └─ Found ${step.results.length} results`);
        }

        if (!completed) {
            lines.push('');
            lines.push(`⚠️  Note: Search stopped at maximum iteration limit (${this.maxIterations})`);
            lines.push(`    You may want to refine your query or increase maxIterations.`);
        }

        return lines.join('\n');
    }
}

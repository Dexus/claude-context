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
     * Uses heuristics like result count, score quality, and diversity
     */
    private shouldRefineSearch(results: SemanticSearchResult[]): boolean {
        // No results - try refining to broaden search
        if (results.length === 0) {
            if (this.currentIteration === 1) {
                console.log(`[AGENT-SEARCH] 🔄 No results found, will try refined query`);
                return true;
            } else {
                console.log(`[AGENT-SEARCH] 🛑 No results found after refinement, stopping`);
                return false;
            }
        }

        // Too many results with high scores - we found what we need
        if (results.length >= 10) {
            const highScoreCount = results.filter(r => r.score > 0.8).length;
            if (highScoreCount >= 5) {
                console.log(`[AGENT-SEARCH] 🛑 Found ${highScoreCount} high-quality results, stopping refinement`);
                return false;
            }
        }

        // Very few results - might benefit from refinement
        if (results.length < 3 && this.currentIteration === 1) {
            console.log(`[AGENT-SEARCH] 🔄 Only ${results.length} results, will try refinement`);
            return true;
        }

        // Check result diversity - if all results are from same file, try to diversify
        if (results.length > 0 && this.currentIteration === 1) {
            const uniqueFiles = new Set(results.map(r => r.relativePath));
            if (uniqueFiles.size === 1 && results.length < 5) {
                console.log(`[AGENT-SEARCH] 🔄 All results from same file, will try to diversify`);
                return true;
            }
        }

        // Low average score - results might not be relevant enough
        if (results.length > 0) {
            const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
            if (avgScore < 0.5 && this.currentIteration < 2) {
                console.log(`[AGENT-SEARCH] 🔄 Low average score (${avgScore.toFixed(2)}), will try refinement`);
                return true;
            }
        }

        // Limit refinement iterations to prevent excessive searches
        if (this.currentIteration >= 2) {
            console.log(`[AGENT-SEARCH] 🛑 Already refined ${this.currentIteration} times, stopping`);
            return false;
        }

        // Default: don't refine if we have decent results
        console.log(`[AGENT-SEARCH] 🛑 Have ${results.length} results, stopping refinement`);
        return false;
    }

    /**
     * Generate a refined query based on initial results
     * Analyzes result context to create more targeted queries
     */
    private generateRefinedQuery(originalQuery: string, results: SemanticSearchResult[]): string {
        // If no results, broaden the query by removing specific terms
        if (results.length === 0) {
            const words = originalQuery.split(/\s+/);
            if (words.length > 2) {
                // Remove last word to broaden search
                const broadened = words.slice(0, -1).join(' ');
                console.log(`[AGENT-SEARCH] 📝 Broadening query: "${originalQuery}" → "${broadened}"`);
                return broadened;
            }
            // If already short, try adding common programming terms
            const refinements = ['implementation', 'function', 'method', 'class'];
            for (const term of refinements) {
                if (!originalQuery.toLowerCase().includes(term)) {
                    const refined = `${originalQuery} ${term}`;
                    console.log(`[AGENT-SEARCH] 📝 Adding term to query: "${originalQuery}" → "${refined}"`);
                    return refined;
                }
            }
            return originalQuery;
        }

        // Extract meaningful terms from top results
        const topResults = results.slice(0, 3);
        const terms = new Set<string>();

        for (const result of topResults) {
            // Extract file name without extension
            const fileName = result.relativePath.split('/').pop()?.replace(/\.[^.]+$/, '') || '';

            // Extract camelCase/PascalCase words from file name
            const words = fileName.split(/[_\-\/]|(?=[A-Z])/).filter(w => w.length > 2);
            words.forEach(w => terms.add(w.toLowerCase()));

            // Extract significant words from code content (if available)
            if (result.content) {
                // Look for class/function names
                const classMatch = result.content.match(/(?:class|interface|type)\s+(\w+)/);
                const functionMatch = result.content.match(/(?:function|const|let)\s+(\w+)/);

                if (classMatch && classMatch[1]) {
                    terms.add(classMatch[1].toLowerCase());
                }
                if (functionMatch && functionMatch[1]) {
                    terms.add(functionMatch[1].toLowerCase());
                }
            }
        }

        // Remove terms already in original query
        const queryTerms = new Set(originalQuery.toLowerCase().split(/\s+/));
        const newTerms = Array.from(terms).filter(t => !queryTerms.has(t));

        // If we found new relevant terms, add the most common one
        if (newTerms.length > 0) {
            const refined = `${originalQuery} ${newTerms[0]}`;
            console.log(`[AGENT-SEARCH] 📝 Refining with extracted term: "${originalQuery}" → "${refined}"`);
            return refined;
        }

        // If all results from same directory, try searching in parent context
        const uniqueDirs = new Set(topResults.map(r => r.relativePath.split('/').slice(0, -1).join('/')));
        if (uniqueDirs.size === 1) {
            const dir = Array.from(uniqueDirs)[0];
            const dirName = dir.split('/').pop() || '';
            if (dirName && !originalQuery.toLowerCase().includes(dirName.toLowerCase())) {
                const refined = `${originalQuery} in ${dirName}`;
                console.log(`[AGENT-SEARCH] 📝 Adding directory context: "${originalQuery}" → "${refined}"`);
                return refined;
            }
        }

        // Default: return original if no refinement strategy applies
        console.log(`[AGENT-SEARCH] 📝 No refinement needed, keeping original query`);
        return originalQuery;
    }

    /**
     * Generate related queries for breadth-first search
     * Creates semantic variations to explore different aspects
     */
    private generateRelatedQueries(query: string): string[] {
        const queries = [query]; // Start with original
        const lowerQuery = query.toLowerCase();

        // Perspective 1: Implementation vs Interface
        if (!lowerQuery.includes('implementation') && !lowerQuery.includes('interface')) {
            queries.push(`${query} implementation`);
            queries.push(`${query} interface`);
        } else if (lowerQuery.includes('implementation')) {
            queries.push(query.replace(/implementation/i, 'interface'));
        } else if (lowerQuery.includes('interface')) {
            queries.push(query.replace(/interface/i, 'implementation'));
        }

        // Perspective 2: Testing
        if (!lowerQuery.includes('test') && !lowerQuery.includes('spec')) {
            queries.push(`${query} tests`);
            queries.push(`${query} test cases`);
        }

        // Perspective 3: Usage/Examples
        if (!lowerQuery.includes('usage') && !lowerQuery.includes('example')) {
            queries.push(`${query} usage`);
            queries.push(`how to use ${query}`);
        }

        // Perspective 4: Configuration
        if (!lowerQuery.includes('config') && !lowerQuery.includes('setup')) {
            queries.push(`${query} configuration`);
            queries.push(`${query} setup`);
        }

        // Perspective 5: Error handling
        if (!lowerQuery.includes('error') && !lowerQuery.includes('exception')) {
            queries.push(`${query} error handling`);
        }

        // Perspective 6: Common related terms
        const variations: Record<string, string[]> = {
            'search': ['find', 'query', 'lookup'],
            'create': ['new', 'initialize', 'setup'],
            'delete': ['remove', 'destroy', 'clear'],
            'update': ['modify', 'change', 'edit'],
            'get': ['fetch', 'retrieve', 'load'],
            'set': ['update', 'configure', 'assign'],
            'handler': ['processor', 'controller', 'manager'],
            'service': ['provider', 'manager', 'handler'],
            'util': ['helper', 'utility', 'common']
        };

        for (const [term, alternatives] of Object.entries(variations)) {
            if (lowerQuery.includes(term)) {
                for (const alt of alternatives.slice(0, 1)) { // Only use first alternative
                    queries.push(query.replace(new RegExp(term, 'gi'), alt));
                }
                break; // Only apply one variation set
            }
        }

        // Remove duplicates and limit total queries
        const uniqueQueries = Array.from(new Set(queries));

        // Limit based on maxIterations to avoid overwhelming searches
        const limit = Math.min(this.maxIterations, 5);
        const limited = uniqueQueries.slice(0, limit);

        console.log(`[AGENT-SEARCH] 🌊 Generated ${limited.length} related queries from "${query}"`);
        for (let i = 0; i < limited.length; i++) {
            console.log(`[AGENT-SEARCH]    ${i + 1}. "${limited[i]}"`);
        }

        return limited;
    }

    /**
     * Identify focus areas for deep dive based on initial results
     * Analyzes result patterns to determine promising areas for detailed exploration
     */
    private identifyFocusAreas(results: SemanticSearchResult[]): string[] {
        const focusAreas: string[] = [];

        if (results.length === 0) {
            return focusAreas;
        }

        // Strategy 1: Identify files with multiple matches (hotspots)
        const fileFrequency = new Map<string, number>();
        for (const result of results) {
            const count = fileFrequency.get(result.relativePath) || 0;
            fileFrequency.set(result.relativePath, count + 1);
        }

        const hotspots = Array.from(fileFrequency.entries())
            .filter(([_, count]) => count >= 2)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2);

        for (const [filePath, count] of hotspots) {
            const fileName = filePath.split('/').pop() || '';
            focusAreas.push(`related code in ${fileName}`);
            console.log(`[AGENT-SEARCH] 🎯 Identified hotspot: ${fileName} (${count} matches)`);
        }

        // Strategy 2: Extract class/function names from top results
        const topResults = results.slice(0, 3);
        const identifiers = new Set<string>();

        for (const result of topResults) {
            if (result.content) {
                // Extract class names
                const classMatches = result.content.matchAll(/(?:class|interface|type)\s+(\w+)/g);
                for (const match of classMatches) {
                    if (match[1] && match[1].length > 2) {
                        identifiers.add(match[1]);
                    }
                }

                // Extract function names
                const functionMatches = result.content.matchAll(/(?:function|const|let|async)\s+(\w+)/g);
                for (const match of functionMatches) {
                    if (match[1] && match[1].length > 3) {
                        identifiers.add(match[1]);
                    }
                }

                // Extract method calls (potential dependencies)
                const methodCalls = result.content.matchAll(/(\w+)\s*\(/g);
                for (const match of methodCalls) {
                    if (match[1] && match[1].length > 3 && !['if', 'for', 'while', 'switch'].includes(match[1])) {
                        identifiers.add(match[1]);
                    }
                }
            }
        }

        // Add top identifiers as focus areas
        const topIdentifiers = Array.from(identifiers).slice(0, 2);
        for (const identifier of topIdentifiers) {
            if (focusAreas.length < 3) {
                focusAreas.push(`${identifier} implementation details`);
                console.log(`[AGENT-SEARCH] 🎯 Identified focus area: ${identifier}`);
            }
        }

        // Strategy 3: Directory-based focus (if results span multiple directories)
        const directories = new Map<string, number>();
        for (const result of results) {
            const dir = result.relativePath.split('/').slice(0, -1).join('/');
            if (dir) {
                const count = directories.get(dir) || 0;
                directories.set(dir, count + 1);
            }
        }

        const topDirs = Array.from(directories.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 1);

        for (const [dir, count] of topDirs) {
            if (focusAreas.length < 4 && count >= 2) {
                const dirName = dir.split('/').pop() || dir;
                focusAreas.push(`related code in ${dirName} directory`);
                console.log(`[AGENT-SEARCH] 🎯 Identified directory focus: ${dirName} (${count} matches)`);
            }
        }

        // Limit total focus areas based on remaining iterations
        const maxFocusAreas = Math.min(this.maxIterations - this.currentIteration, 3);
        const limited = focusAreas.slice(0, maxFocusAreas);

        console.log(`[AGENT-SEARCH] 🔍 Identified ${limited.length} focus areas for deep dive`);

        return limited;
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

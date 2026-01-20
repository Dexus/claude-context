import { jest, describe, it, expect } from '@jest/globals';
import { Context, SemanticSearchResult } from "@dexus1985/claude-context-core";
import { AgentSearch } from "../agent-search.js";

// Create mock Context
function createMockContext(searchResults: SemanticSearchResult[] = []) {
    const mockSemanticSearch = jest.fn<any>().mockResolvedValue(searchResults);
    return {
        semanticSearch: mockSemanticSearch,
        indexCodebase: jest.fn(),
        clearIndex: jest.fn(),
        hasIndex: jest.fn(),
        getVectorDatabase: jest.fn(),
        getEmbedding: jest.fn(),
        setSynchronizer: jest.fn(),
        getPreparedCollection: jest.fn(),
        getCollectionName: jest.fn(),
        addCustomExtensions: jest.fn(),
        addCustomIgnorePatterns: jest.fn(),
        getIgnorePatterns: jest.fn(),
        getLoadedIgnorePatterns: jest.fn(),
    };
}

// Create sample search result matching SemanticSearchResult interface
function createSearchResult(
    relativePath: string,
    startLine: number,
    endLine: number,
    score: number,
    content: string = "sample code"
): SemanticSearchResult {
    return {
        relativePath,
        startLine,
        endLine,
        score,
        content,
        language: "typescript",
    };
}

describe("AgentSearch", () => {
    describe("constructor", () => {
        it("should clamp maxIterations between 1 and 10", () => {
            const context = createMockContext();

            // Test lower bound
            const search1 = new AgentSearch(context as unknown as Context, 0);
            expect((search1 as any).maxIterations).toBe(1);

            // Test upper bound
            const search2 = new AgentSearch(context as unknown as Context, 20);
            expect((search2 as any).maxIterations).toBe(10);

            // Test valid value
            const search3 = new AgentSearch(context as unknown as Context, 5);
            expect((search3 as any).maxIterations).toBe(5);
        });

        it("should default maxIterations to 5", () => {
            const context = createMockContext();
            const search = new AgentSearch(context as unknown as Context);
            expect((search as any).maxIterations).toBe(5);
        });
    });

    describe("execute", () => {
        it("should execute iterative search strategy", async () => {
            const results = [
                createSearchResult("src/index.ts", 1, 10, 0.9),
                createSearchResult("src/utils.ts", 5, 15, 0.85),
            ];
            const context = createMockContext(results);
            const search = new AgentSearch(context as unknown as Context, 3);

            const result = await search.execute("/test", "test query", "iterative", 10);

            expect(result.strategy).toBe("iterative");
            expect(result.originalQuery).toBe("test query");
            expect(context.semanticSearch).toHaveBeenCalled();
            expect(result.steps.length).toBeGreaterThan(0);
        });

        it("should execute breadth-first search strategy", async () => {
            const results = [createSearchResult("src/index.ts", 1, 10, 0.9)];
            const context = createMockContext(results);
            const search = new AgentSearch(context as unknown as Context, 3);

            const result = await search.execute("/test", "search function", "breadth-first", 10);

            expect(result.strategy).toBe("breadth-first");
            expect(result.steps.length).toBeGreaterThanOrEqual(1);
        });

        it("should execute focused search strategy", async () => {
            const results = [
                createSearchResult("src/index.ts", 1, 10, 0.9, "class SearchHandler { }"),
                createSearchResult("src/index.ts", 20, 30, 0.85, "function search() { }"),
            ];
            const context = createMockContext(results);
            const search = new AgentSearch(context as unknown as Context, 5);

            const result = await search.execute("/test", "search implementation", "focused", 10);

            expect(result.strategy).toBe("focused");
            expect(result.steps.length).toBeGreaterThanOrEqual(1);
        });

        it("should handle search errors gracefully", async () => {
            const context = createMockContext();
            context.semanticSearch.mockRejectedValue(new Error("Search failed"));
            const search = new AgentSearch(context as unknown as Context, 3);

            const result = await search.execute("/test", "test query", "iterative", 10);

            // When errors occur, the search returns with empty results
            // but still reports completion status based on iteration count
            expect(result.combinedResults).toEqual([]);
            expect(result.steps.length).toBeGreaterThanOrEqual(0);
        });
    });

    describe("shouldRefineSearch logic", () => {
        it("should refine when no results found on first iteration", async () => {
            const context = createMockContext([]);
            const search = new AgentSearch(context as unknown as Context, 3);

            await search.execute("/test", "nonexistent query", "iterative", 10);

            // Should have tried to refine at least once
            expect(context.semanticSearch).toHaveBeenCalledTimes(2);
        });

        it("should stop refinement when high-quality results found", async () => {
            const highQualityResults = Array(10).fill(null).map((_, i) =>
                createSearchResult(`src/file${i}.ts`, 1, 10, 0.9)
            );
            const context = createMockContext(highQualityResults);
            const search = new AgentSearch(context as unknown as Context, 5);

            const result = await search.execute("/test", "test query", "iterative", 10);

            // Should stop after first iteration due to high-quality results
            expect(result.totalIterations).toBe(1);
            expect(result.completed).toBe(true);
        });

        it("should refine when few results with low scores", async () => {
            const lowQualityResults = [
                createSearchResult("src/file1.ts", 1, 10, 0.3),
                createSearchResult("src/file2.ts", 5, 15, 0.35),
            ];
            const context = createMockContext(lowQualityResults);
            const search = new AgentSearch(context as unknown as Context, 3);

            await search.execute("/test", "test query", "iterative", 10);

            // Should try to refine due to low scores
            expect(context.semanticSearch).toHaveBeenCalledTimes(2);
        });
    });

    describe("combineResults deduplication", () => {
        it("should deduplicate exact duplicate results", async () => {
            // Return same results multiple times
            const duplicateResults = [
                createSearchResult("src/index.ts", 1, 10, 0.9),
                createSearchResult("src/index.ts", 1, 10, 0.85), // Exact duplicate
                createSearchResult("src/utils.ts", 5, 15, 0.8),
            ];
            const context = createMockContext(duplicateResults);
            const search = new AgentSearch(context as unknown as Context, 1);

            const result = await search.execute("/test", "test query", "iterative", 10);

            // Should have deduplicated the exact duplicate
            expect(result.combinedResults.length).toBe(2);
        });

        it("should boost score for duplicate occurrences", async () => {
            const duplicateResults = [
                createSearchResult("src/index.ts", 1, 10, 0.8),
                createSearchResult("src/index.ts", 1, 10, 0.85),
            ];
            const context = createMockContext(duplicateResults);
            const search = new AgentSearch(context as unknown as Context, 1);

            const result = await search.execute("/test", "test query", "iterative", 10);

            // Score should be boosted for the duplicate
            expect(result.combinedResults[0].score).toBeGreaterThan(0.85);
        });
    });

    describe("mergeFileResults overlap handling", () => {
        it("should merge overlapping chunks", async () => {
            const overlappingResults = [
                createSearchResult("src/index.ts", 1, 10, 0.9),
                createSearchResult("src/index.ts", 5, 15, 0.85), // Overlaps with first
                createSearchResult("src/index.ts", 30, 40, 0.8), // No overlap
            ];
            const context = createMockContext(overlappingResults);
            const search = new AgentSearch(context as unknown as Context, 1);

            const result = await search.execute("/test", "test query", "iterative", 10);

            // Should merge overlapping chunks into 2 results
            expect(result.combinedResults.length).toBe(2);
        });

        it("should merge adjacent chunks within line gap", async () => {
            const adjacentResults = [
                createSearchResult("src/index.ts", 1, 10, 0.9),
                createSearchResult("src/index.ts", 12, 20, 0.85), // Adjacent (gap of 2)
            ];
            const context = createMockContext(adjacentResults);
            const search = new AgentSearch(context as unknown as Context, 1);

            const result = await search.execute("/test", "test query", "iterative", 10);

            // Should merge adjacent chunks
            expect(result.combinedResults.length).toBe(1);
            expect(result.combinedResults[0].endLine).toBe(20);
        });

        it("should handle single-line chunks without division by zero", async () => {
            const singleLineResults = [
                createSearchResult("src/index.ts", 5, 5, 0.9), // Single line
                createSearchResult("src/index.ts", 5, 5, 0.85), // Same single line
            ];
            const context = createMockContext(singleLineResults);
            const search = new AgentSearch(context as unknown as Context, 1);

            const result = await search.execute("/test", "test query", "iterative", 10);

            // Should handle without NaN
            expect(result.combinedResults.length).toBe(1);
            expect(isNaN(result.combinedResults[0].score)).toBe(false);
        });

        it("should handle adjacent but non-overlapping chunks correctly", async () => {
            const adjacentResults = [
                createSearchResult("src/index.ts", 1, 10, 0.9),
                createSearchResult("src/index.ts", 13, 20, 0.85), // Gap of 3 lines (within threshold)
            ];
            const context = createMockContext(adjacentResults);
            const search = new AgentSearch(context as unknown as Context, 1);

            const result = await search.execute("/test", "test query", "iterative", 10);

            // Should merge as adjacent
            expect(result.combinedResults.length).toBe(1);
            // Score should not be inflated (no negative overlap ratio)
            expect(result.combinedResults[0].score).toBeLessThanOrEqual(1.0);
        });
    });

    describe("generateRefinedQuery", () => {
        it("should broaden query when no results found", async () => {
            const context = createMockContext([]);
            // Return empty for first call, then return results
            context.semanticSearch
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([createSearchResult("src/index.ts", 1, 10, 0.9)]);

            const search = new AgentSearch(context as unknown as Context, 3);
            await search.execute("/test", "very specific query terms", "iterative", 10);

            // Second call should have a modified query
            const calls = context.semanticSearch.mock.calls;
            expect(calls[1][1]).not.toBe("very specific query terms");
        });

        it("should extract terms from result file names", async () => {
            const resultsWithPaths = [
                createSearchResult("src/handlers/SearchHandler.ts", 1, 10, 0.9),
            ];
            const context = createMockContext(resultsWithPaths);
            // First call returns few results, second with refined query
            context.semanticSearch
                .mockResolvedValueOnce(resultsWithPaths)
                .mockResolvedValueOnce([
                    ...resultsWithPaths,
                    createSearchResult("src/handlers/other.ts", 5, 15, 0.85),
                ]);

            const search = new AgentSearch(context as unknown as Context, 3);
            await search.execute("/test", "search", "iterative", 10);

            // Should have tried to refine based on file name terms
            const calls = context.semanticSearch.mock.calls;
            expect(calls.length).toBeGreaterThan(1);
        });
    });

    describe("generateSummary", () => {
        it("should generate valid summary with correct result count", async () => {
            const results = [
                createSearchResult("src/index.ts", 1, 10, 0.9),
                createSearchResult("src/utils.ts", 5, 15, 0.85),
            ];
            const context = createMockContext(results);
            const search = new AgentSearch(context as unknown as Context, 3);

            const result = await search.execute("/test", "test query", "iterative", 10);

            expect(result.summary).toContain("Agent Search Summary");
            expect(result.summary).toContain("test query");
            expect(result.summary).toContain("iterative");
            expect(result.summary).toContain(`Unique Results: ${result.combinedResults.length}`);
        });

        it("should indicate when iteration limit was reached", async () => {
            // Create a scenario where refinement keeps happening
            const fewResults = [createSearchResult("src/index.ts", 1, 10, 0.3)];
            const context = createMockContext(fewResults);
            const search = new AgentSearch(context as unknown as Context, 2);

            const result = await search.execute("/test", "test", "iterative", 10);

            if (!result.completed) {
                expect(result.summary).toContain("iteration limit");
            }
        });
    });

    describe("breadth-first strategy", () => {
        it("should generate related queries", async () => {
            const results = [createSearchResult("src/index.ts", 1, 10, 0.9)];
            const context = createMockContext(results);
            const search = new AgentSearch(context as unknown as Context, 5);

            await search.execute("/test", "user authentication", "breadth-first", 10);

            // Should generate multiple related queries
            const calls = context.semanticSearch.mock.calls;
            expect(calls.length).toBeGreaterThan(1);
        });

        it("should respect maxIterations limit", async () => {
            const results = [createSearchResult("src/index.ts", 1, 10, 0.9)];
            const context = createMockContext(results);
            const search = new AgentSearch(context as unknown as Context, 2);

            const result = await search.execute("/test", "user authentication", "breadth-first", 10);

            // Should not exceed maxIterations
            expect(result.totalIterations).toBeLessThanOrEqual(2);
        });

        it("should show correct progress in explanation", async () => {
            const results = [createSearchResult("src/index.ts", 1, 10, 0.9)];
            const context = createMockContext(results);
            const search = new AgentSearch(context as unknown as Context, 3);

            const result = await search.execute("/test", "test", "breadth-first", 10);

            // Check that progress counter uses effective limit
            for (const step of result.steps) {
                if (step.explanation.includes("Breadth-first")) {
                    // Should show (N/M) where M <= maxIterations
                    const match = step.explanation.match(/\((\d+)\/(\d+)\)/);
                    if (match) {
                        expect(parseInt(match[2])).toBeLessThanOrEqual(3);
                    }
                }
            }
        });
    });

    describe("focused strategy", () => {
        it("should identify focus areas from initial results", async () => {
            const resultsWithCode = [
                createSearchResult("src/search.ts", 1, 10, 0.9, "class SearchEngine { }"),
                createSearchResult("src/search.ts", 20, 30, 0.85, "function findResults() { }"),
            ];
            const context = createMockContext(resultsWithCode);
            const search = new AgentSearch(context as unknown as Context, 5);

            const result = await search.execute("/test", "search", "focused", 10);

            // Should perform initial search plus focus area searches
            expect(result.steps.length).toBeGreaterThanOrEqual(1);
        });

        it("should identify file hotspots for focus", async () => {
            const hotspotResults = [
                createSearchResult("src/hotspot.ts", 1, 10, 0.9),
                createSearchResult("src/hotspot.ts", 20, 30, 0.85),
                createSearchResult("src/hotspot.ts", 40, 50, 0.8),
                createSearchResult("src/other.ts", 5, 15, 0.75),
            ];
            const context = createMockContext(hotspotResults);
            const search = new AgentSearch(context as unknown as Context, 5);

            await search.execute("/test", "test", "focused", 10);

            // Should have identified hotspot.ts as a focus area
            const calls = context.semanticSearch.mock.calls;
            expect(calls.length).toBeGreaterThan(1);
        });
    });
});

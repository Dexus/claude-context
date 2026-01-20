# Future Work: AgentSearch + Ranking System Integration

## Overview

This document outlines potential improvements for deeper integration between the AgentSearch multi-step orchestrator and the Ranking system's multi-factor scoring.

**Related Files:**
- `packages/mcp/src/agent-search.ts` - Multi-step search orchestrator
- `packages/core/src/ranking/ranker.ts` - Multi-factor ranking system
- `packages/core/src/ranking/factors.ts` - Individual ranking factor calculations

## Current State

### AgentSearch
- Performs iterative, breadth-first, or focused search strategies
- Refines queries based on result count, score quality, and diversity
- Combines/deduplicates results with its own score aggregation:
  - Duplicate boost: +5% per occurrence (max 30%)
  - Overlap penalty: 50% weight reduction for overlapping chunks
  - Adjacency weight: 70% for adjacent non-overlapping chunks

### Ranking System
- Combines 4 factors with configurable weights:
  - Vector similarity (default 50%)
  - Recency (default 20%)
  - Import frequency (default 20%)
  - Term frequency (default 10%)
- Applied at the `Context.semanticSearch()` level

### Current Integration
AgentSearch calls `context.semanticSearch()` which defaults to `enableRanking=true`, so ranked results are already being used. However, AgentSearch is unaware of the ranking factors and cannot leverage them for smarter decisions.

## Proposed Improvements

### 1. Expose Ranking Details to AgentSearch

**Problem:** AgentSearch makes refinement decisions based only on result count and aggregate scores, not individual ranking factors.

**Solution:** Pass `includeDetails=true` to get ranking breakdown, then use it for smarter refinement.

```typescript
// In AgentSearch.performSearch()
const results = await this.context.semanticSearch(
    codebasePath,
    query,
    limit,
    threshold,
    filterExpr,
    true,  // enableRanking
    true   // includeDetails (new parameter needed)
);
```

**Benefits:**
- Can detect "results are all from old files" → suggest freshness-focused query
- Can detect "results are from rarely-imported files" → may be edge cases
- Can detect "low term frequency scores" → query terms not matching well

### 2. Ranking-Aware Refinement Strategies

**Problem:** `shouldRefineSearch()` and `generateRefinedQuery()` use heuristics that don't consider why scores are low.

**Solution:** Add ranking-factor-aware refinement logic.

```typescript
private analyzeRankingFactors(results: RankedSearchResult[]): RefinementHint {
    const avgRecency = average(results.map(r => r.rankingDetails?.factors.recencyScore ?? 0));
    const avgImport = average(results.map(r => r.rankingDetails?.factors.importScore ?? 0));
    const avgTermFreq = average(results.map(r => r.rankingDetails?.factors.termFreqScore ?? 0));

    if (avgRecency < 0.3) {
        return { type: 'stale-results', suggestion: 'Results are from old files. Consider searching for recent implementations.' };
    }
    if (avgImport < 0.2) {
        return { type: 'edge-code', suggestion: 'Results are from rarely-used files. Consider searching core modules.' };
    }
    if (avgTermFreq < 0.4) {
        return { type: 'semantic-only', suggestion: 'Query terms not found verbatim. Results are semantic matches only.' };
    }
    return { type: 'balanced', suggestion: null };
}
```

### 3. Harmonize Score Aggregation

**Problem:** AgentSearch has its own score boosting logic that may compound or conflict with Ranker's import frequency boosting.

**Current AgentSearch logic:**
```typescript
// Duplicate boost
const boostFactor = Math.min(1 + (occurrences * 0.05), 1.3);
current.score = Math.min(maxScore * boostFactor, 1.0);
```

**Solution Options:**

A) **Disable Ranker's import boost when AgentSearch is aggregating** - Avoid double-boosting

B) **Use Ranker's import scores in AgentSearch aggregation** - Files with high import counts get more boost when found multiple times

C) **Unify scoring** - Move AgentSearch's aggregation logic into the Ranker as a "multi-result" mode

### 4. Strategy-Specific Ranking Configs

**Problem:** Different search strategies might benefit from different ranking weights.

**Solution:** Allow AgentSearch to temporarily adjust ranking config per strategy.

```typescript
const strategyConfigs: Record<AgentSearchStrategy, Partial<RankingConfig>> = {
    'iterative': { /* default weights */ },
    'breadth-first': {
        // Breadth-first explores many queries, reduce recency bias
        recencyWeight: 0.1,
        vectorWeight: 0.6
    },
    'focused': {
        // Focused dives deep, prioritize import frequency (core code)
        importWeight: 0.3,
        recencyWeight: 0.1
    }
};
```

### 5. Ranking Metrics in Search Summary

**Problem:** AgentSearch summary doesn't report ranking factor distribution.

**Solution:** Include ranking analytics in the summary.

```typescript
private generateSummary(...): string {
    // ... existing summary ...

    lines.push('');
    lines.push('📊 Ranking Factor Analysis:');
    lines.push(`   Avg Recency Score: ${avgRecency.toFixed(2)} (${recencyInterpretation})`);
    lines.push(`   Avg Import Score: ${avgImport.toFixed(2)} (${importInterpretation})`);
    lines.push(`   Avg Term Frequency: ${avgTermFreq.toFixed(2)}`);

    if (refinementHint) {
        lines.push(`   💡 ${refinementHint}`);
    }
}
```

## Implementation Priority

| Priority | Improvement | Effort | Impact |
|----------|-------------|--------|--------|
| 1 | Expose ranking details to AgentSearch | Low | Medium |
| 2 | Ranking-aware refinement strategies | Medium | High |
| 3 | Ranking metrics in search summary | Low | Low |
| 4 | Strategy-specific ranking configs | Medium | Medium |
| 5 | Harmonize score aggregation | High | Medium |

## API Changes Required

### Context.semanticSearch()
```typescript
// Current
semanticSearch(codebasePath, query, topK, threshold, filterExpr, enableRanking)

// Proposed
semanticSearch(codebasePath, query, topK, threshold, filterExpr, enableRanking, includeRankingDetails)
```

### New Types
```typescript
interface RefinementHint {
    type: 'stale-results' | 'edge-code' | 'semantic-only' | 'balanced';
    suggestion: string | null;
}

interface RankingAnalytics {
    avgRecencyScore: number;
    avgImportScore: number;
    avgTermFreqScore: number;
    avgVectorScore: number;
    hint: RefinementHint;
}
```

## Testing Considerations

- Add integration tests that verify AgentSearch uses ranking factors for refinement
- Add A/B tests comparing refinement quality with/without ranking awareness
- Benchmark performance impact of including ranking details

## Notes

- This integration should be backward compatible
- Consider feature flag to enable/disable ranking-aware refinement
- Monitor for cases where ranking-aware refinement performs worse than heuristic-only

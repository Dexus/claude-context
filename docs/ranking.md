# Search Result Ranking

Claude Context uses a sophisticated multi-factor ranking system to ensure the most relevant code appears first in search results. This helps AI assistants understand the correct context immediately, reducing the need for iterative searching.

## Overview

The ranking system combines four key factors to produce a final relevance score:

1. **Vector Similarity** (default weight: 0.5) - Semantic similarity between query and code
2. **Recency** (default weight: 0.2) - How recently the file was modified
3. **Import Frequency** (default weight: 0.2) - How often the file is imported by other files
4. **Term Frequency** (default weight: 0.1) - Direct keyword matches with the query

All factors are normalized to a [0, 1] range, weighted according to the configuration, and combined into a final relevance score.

## How It Works

### Vector Similarity
The foundation of semantic search. Uses embedding models to understand conceptual similarity between your query and code chunks, even when exact keywords don't match.

### Recency Score
Files modified recently receive higher scores using exponential decay:
- Files modified today: score ≈ 1.0
- Files modified 90 days ago (default half-life): score = 0.5
- Files modified 180 days ago: score = 0.25

This ensures you see current implementations, not deprecated code.

### Import Frequency Score
Files that are imported more frequently across your codebase are considered more important:
- Core utilities and shared modules score higher
- Rarely-used files score lower
- Normalized by the maximum import count in your codebase

Supports import detection across 8+ languages including JavaScript/TypeScript, Python, Java, Go, Rust, C/C++, and C#.

### Term Frequency Score
Direct keyword matching provides an additional relevance signal:
- Counts occurrences of query terms in code content
- Normalized by content length to prevent bias toward longer files
- Applied through a sigmoid function for smooth scaling

## Default Configuration

```typescript
{
  vectorWeight: 0.5,        // Semantic similarity
  recencyWeight: 0.2,       // How recently modified
  importWeight: 0.2,        // How frequently imported
  termFreqWeight: 0.1,      // Direct keyword matches
  recencyHalfLifeDays: 90,  // Exponential decay period
  enabled: true             // Ranking is on by default
}
```

## Customizing Ranking Weights

### Using the Core API

```typescript
import { Context } from '@dexus1985/claude-context-core';

const context = new Context(config);

// Get current ranking configuration
const currentConfig = context.getRankingConfig();
console.log('Current ranking config:', currentConfig);

// Update ranking weights
context.updateRankingConfig({
  vectorWeight: 0.4,
  recencyWeight: 0.4,  // Boost recent files
  importWeight: 0.15,
  termFreqWeight: 0.05
});

// Adjust recency decay period
context.updateRankingConfig({
  recencyHalfLifeDays: 30  // Faster decay (30 days instead of 90)
});
```

### Per-Search Control

```typescript
// Search with ranking enabled (default)
const rankedResults = await context.semanticSearch(
  codebasePath,
  'authentication middleware',
  10,           // topK
  0.5,          // threshold
  undefined,    // filterExpr
  true          // enableRanking
);

// Search without ranking (pure vector similarity)
const unrankedResults = await context.semanticSearch(
  codebasePath,
  'authentication middleware',
  10,
  0.5,
  undefined,
  false         // enableRanking = false
);
```

### Via MCP (Claude Code, Cursor, etc.)

The MCP search tool supports ranking control:

```typescript
// In your MCP configuration, ranking is enabled by default
// The enableRanking parameter is available but not exposed in the tool schema
// It defaults to true for all searches
```

**Note**: To disable ranking via MCP, you would need to update the Context's ranking configuration before searching, or modify the search handler to accept the `enableRanking` parameter in the tool schema.

## Disabling Ranking

### Disable Globally

```typescript
// Disable ranking for all searches
context.updateRankingConfig({ enabled: false });

// All searches will now return pure vector similarity results
const results = await context.semanticSearch(codebasePath, query);
```

### Disable Per-Search

```typescript
// Keep ranking enabled globally, but disable for a specific search
const results = await context.semanticSearch(
  codebasePath,
  query,
  10,
  0.5,
  undefined,
  false  // enableRanking = false for this search only
);
```

## Understanding Ranking Details

Search results can include detailed ranking information for debugging:

```typescript
// The search results contain ranking metadata
const results = await context.semanticSearch(codebasePath, query);

results.forEach(result => {
  console.log(`File: ${result.relativePath}`);
  console.log(`Final Score: ${result.score}`);

  // Ranking details may be available if implementation provides them
  if (result.rankingDetails) {
    console.log('Ranking Breakdown:');
    console.log(`  Vector: ${result.rankingDetails.factors.vectorScore}`);
    console.log(`  Recency: ${result.rankingDetails.factors.recencyScore}`);
    console.log(`  Import: ${result.rankingDetails.factors.importScore}`);
    console.log(`  Term Freq: ${result.rankingDetails.factors.termFreqScore}`);
  }
});
```

## A/B Testing Framework

Claude Context includes a comprehensive A/B testing framework to measure ranking quality improvements using standard Information Retrieval metrics.

### Supported Metrics

- **NDCG** (Normalized Discounted Cumulative Gain) - Measures ranking quality with position-based discounting
- **MRR** (Mean Reciprocal Rank) - Measures how quickly relevant results appear
- **Precision@k** - Measures accuracy of top-k results (k=5, k=10)

### Running A/B Tests

```typescript
import { ABTest } from '@dexus1985/claude-context-core';

// Define test queries with known relevant documents
const testQueries = [
  {
    query: 'authentication middleware',
    relevantDocIds: [
      'src/middleware/auth.ts:10-25',
      'src/middleware/session.ts:15-30',
      'src/api/auth.ts:50-75'
    ]
  },
  {
    query: 'database connection pooling',
    relevantDocIds: [
      'src/db/pool.ts:20-45',
      'src/db/connection.ts:30-55'
    ]
  }
];

// Prepare mock search results (from your vector database)
const mockResults = new Map();
// ... populate with vector search results for each query

// Define two ranking configurations to compare
const configA = {
  name: 'Default Config',
  config: {
    vectorWeight: 0.5,
    recencyWeight: 0.2,
    importWeight: 0.2,
    termFreqWeight: 0.1
  }
};

const configB = {
  name: 'Recency-Focused',
  config: {
    vectorWeight: 0.4,
    recencyWeight: 0.4,  // Doubled recency weight
    importWeight: 0.15,
    termFreqWeight: 0.05
  }
};

// Run the A/B test
const testResult = ABTest.runTest(
  testQueries,
  mockResults,
  configA,
  configB,
  {
    includeQueryResults: true,  // Include per-query details
    verbose: true               // Log progress
  }
);

// Display results
console.log(ABTest.formatReport(testResult));

// Example output:
// === A/B Test Results ===
//
// Total Queries: 2
// Total Documents: 15
// Timestamp: 2026-01-20T10:30:00.000Z
//
// Configuration A: Default Config
//   NDCG: 0.8234
//   MRR: 0.7500
//   Precision@5: 0.6000
//   Precision@10: 0.4500
//
// Configuration B: Recency-Focused
//   NDCG: 0.8756
//   MRR: 0.8333
//   Precision@5: 0.7000
//   Precision@10: 0.5500
//
// Winner: B
//
// Improvements (B vs A):
//   NDCG: +0.0522
//   MRR: +0.0833
//   Precision@5: +0.1000
//   Precision@10: +0.1000
```

### Analyzing Ranking Differences

```typescript
// Access detailed per-query results
if (testResult.queryResults) {
  testResult.queryResults.forEach(queryResult => {
    console.log(`\nQuery: "${queryResult.query}"`);
    console.log('Significant movers:');

    queryResult.rankingDifferences.movers.forEach(mover => {
      const direction = mover.positionChange > 0 ? '↑' : '↓';
      console.log(`  ${direction} ${mover.docId}`);
      console.log(`     Position A: ${mover.positionA} → Position B: ${mover.positionB}`);
      console.log(`     Change: ${Math.abs(mover.positionChange)} positions`);
    });
  });
}
```

### Creating Relevance Judgments

For effective A/B testing, you need high-quality relevance judgments. Here are some approaches:

**Manual Curation**:
```typescript
// Manually identify relevant files for each query
const testQueries = [
  {
    query: 'user authentication',
    relevantDocIds: [
      'src/auth/login.ts:10-30',      // Most relevant
      'src/auth/middleware.ts:15-40', // Very relevant
      'src/models/user.ts:50-70'      // Somewhat relevant
    ]
  }
];
```

**Sampling from Real Searches**:
```typescript
// Use actual search queries from your development workflow
// Review results and manually classify which were truly relevant
```

**Team Consensus**:
```typescript
// Have multiple developers review and agree on relevant results
// This reduces individual bias in relevance judgments
```

## Use Cases

### Prioritizing Recent Code

When working on actively developed features, boost recency:

```typescript
context.updateRankingConfig({
  vectorWeight: 0.3,
  recencyWeight: 0.5,  // Heavily favor recent changes
  importWeight: 0.15,
  termFreqWeight: 0.05
});
```

### Finding Core Infrastructure

When searching for widely-used utilities and modules:

```typescript
context.updateRankingConfig({
  vectorWeight: 0.3,
  recencyWeight: 0.1,
  importWeight: 0.5,   // Prioritize frequently imported files
  termFreqWeight: 0.1
});
```

### Pure Semantic Search

When you want only conceptual similarity without other signals:

```typescript
context.updateRankingConfig({
  vectorWeight: 1.0,
  recencyWeight: 0.0,
  importWeight: 0.0,
  termFreqWeight: 0.0
});

// Or disable ranking entirely
context.updateRankingConfig({ enabled: false });
```

### Keyword-Heavy Search

When searching for specific identifiers or exact terms:

```typescript
context.updateRankingConfig({
  vectorWeight: 0.4,
  recencyWeight: 0.1,
  importWeight: 0.1,
  termFreqWeight: 0.4  // Boost exact keyword matches
});
```

## Best Practices

### Start with Defaults
The default weights (0.5, 0.2, 0.2, 0.1) work well for most codebases. Only customize if you have specific needs.

### Iterate with A/B Testing
Use the A/B testing framework to validate that your custom weights actually improve ranking quality before deploying them.

### Consider Your Codebase Age
- **Mature codebases**: Lower recency weight (0.1) since old code is often stable and important
- **Rapidly evolving codebases**: Higher recency weight (0.3-0.4) to surface latest implementations

### Monitor Import Patterns
Import frequency is most valuable in codebases with clear architectural layers. It may be less useful in flat directory structures.

### Adjust Half-Life for Your Workflow
- **Fast-moving projects**: 30-day half-life
- **Typical projects**: 90-day half-life (default)
- **Stable projects**: 180-day half-life

## Troubleshooting

### Ranking Seems Off

**Check if ranking is enabled**:
```typescript
const config = context.getRankingConfig();
console.log('Ranking enabled:', config.enabled);
```

**Review metadata availability**:
Ranking requires proper metadata (mtime, importCount) in indexed documents. Re-index if you upgraded from an older version:
```typescript
// Force re-index to populate metadata
await context.indexCodebase(codebasePath, { force: true });
```

### Old Files Appearing First

Increase recency weight:
```typescript
context.updateRankingConfig({
  recencyWeight: 0.3  // Increase from default 0.2
});
```

Or decrease half-life for faster decay:
```typescript
context.updateRankingConfig({
  recencyHalfLifeDays: 45  // Faster decay than default 90
});
```

### Irrelevant Files Ranking High

Check if import frequency is skewing results. Some build artifacts or generated files may have artificially high import counts:
```typescript
context.updateRankingConfig({
  importWeight: 0.1  // Reduce from default 0.2
});
```

Consider using file extension filters to exclude irrelevant files:
```typescript
const results = await context.semanticSearch(
  codebasePath,
  query,
  10,
  0.5,
  "fileExtension in ['.ts', '.js']"  // Filter to specific extensions
);
```

## Performance Considerations

The ranking system adds minimal overhead to search operations:
- **Recency scoring**: Simple timestamp math, near-instant
- **Import frequency**: Pre-computed during indexing, stored in metadata
- **Term frequency**: Efficient regex-based counting
- **Overall impact**: Typically < 5ms per search

The import analyzer runs during indexing and adds a small amount of time proportional to codebase size, but this is a one-time cost.

## API Reference

### Context Methods

```typescript
// Get current ranking configuration
getRankingConfig(): RankingConfig

// Update ranking configuration
updateRankingConfig(config: Partial<RankingConfig>): void

// Search with optional ranking control
semanticSearch(
  codebasePath: string,
  query: string,
  topK?: number,
  threshold?: number,
  filterExpr?: string,
  enableRanking?: boolean  // Default: true
): Promise<SemanticSearchResult[]>
```

### RankingConfig Interface

```typescript
interface RankingConfig {
  vectorWeight: number;        // Default: 0.5
  recencyWeight: number;       // Default: 0.2
  importWeight: number;        // Default: 0.2
  termFreqWeight: number;      // Default: 0.1
  recencyHalfLifeDays?: number; // Default: 90
  enabled?: boolean;           // Default: true
}
```

### SemanticSearchResult Interface

```typescript
interface SemanticSearchResult {
  content: string;
  relativePath: string;
  startLine: number;
  endLine: number;
  language: string;
  score: number;
  rankingDetails?: {
    factors: RankingFactors;
    finalScore: number;
  };
}
```

## Learn More

- [Quick Start Guide](./getting-started/quick-start.md) - Get up and running quickly
- [README](../README.md) - Project overview and installation
- [Troubleshooting](./troubleshooting/troubleshooting.md) - Common issues and solutions

## Feedback

The ranking system is designed to be flexible and measurable. If you discover effective weight configurations for specific use cases, please share them with the community through GitHub discussions or issues!

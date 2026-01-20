# Contributing to @dannyboy2042/claude-context-core

Thanks for your interest in contributing to the Claude Context core package!

> 📖 **First time contributing?** Please read the [main contributing guide](../../CONTRIBUTING.md) first for general setup and workflow.

## Core Package Development

This guide covers development specific to the core indexing engine.

## Development Workflow

### Quick Commands
```bash
# Build core package
pnpm build:core

# Watch mode for development
pnpm dev:core

# Run tests
pnpm test:core
```

### Making Changes

1. Create a new branch for your feature/fix
2. Make your changes in the `src/` directory
3. Follow the commit guidelines in the [main guide](../../CONTRIBUTING.md)

## Project Structure

- `src/context.ts` - Main Claude Context class
- `src/embedding/` - Embedding providers (OpenAI, Gemini, VoyageAI, Ollama)
- `src/vectordb/` - Vector database implementations (LanceDB)
- `src/splitter/` - Code splitting logic
- `src/sync/` - File synchronization and Merkle DAG
- `src/types.ts` - TypeScript type definitions
- `src/__tests__/` - Test files

## Testing

The core package has comprehensive test coverage with both unit tests (mocked) and integration tests (real API calls).

### Running Tests

```bash
# Run all unit tests (no API keys required)
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- --testPathPatterns="context.test"
```

### Test Structure

```
src/__tests__/
├── embedding/                    # Embedding provider tests
│   ├── base-embedding.test.ts    # Base class tests
│   ├── openai-embedding.test.ts  # OpenAI mock tests
│   ├── gemini-embedding.test.ts  # Gemini mock tests
│   ├── ollama-embedding.test.ts  # Ollama mock tests
│   └── voyageai-embedding.test.ts # VoyageAI mock tests
├── integration/                  # Integration tests (real API calls)
│   ├── openai-embedding.integration.test.ts
│   ├── gemini-embedding.integration.test.ts
│   ├── ollama-embedding.integration.test.ts
│   ├── voyageai-embedding.integration.test.ts
│   └── indexing-search.test.ts   # Full workflow tests
├── splitter/                     # Code splitter tests
│   └── langchain-splitter.test.ts
├── sync/                         # Sync module tests
│   ├── merkle.test.ts
│   └── synchronizer.test.ts
├── vectordb/                     # Vector database tests
│   └── lancedb-vectordb.test.ts
└── context.test.ts               # Main Context class tests
```

### Integration Tests

Integration tests make real API calls to verify correct behavior with actual embedding providers. They are **skipped by default** when environment variables are not set, ensuring CI passes without credentials.

#### Environment Variables

| Provider | Environment Variable | Description |
|----------|---------------------|-------------|
| OpenAI | `OPENAI_API_KEY` | Your OpenAI API key |
| Gemini | `GEMINI_API_KEY` or `GOOGLE_AI_API_KEY` | Your Google AI API key |
| VoyageAI | `VOYAGEAI_API_KEY` | Your VoyageAI API key |
| Ollama | `OLLAMA_ENABLED=true` | Enable Ollama tests (no API key needed) |

#### Optional Ollama Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `nomic-embed-text` | Embedding model to use |

#### Running Integration Tests

```bash
# Run OpenAI integration tests
OPENAI_API_KEY=sk-xxx npm test -- --testPathPatterns="integration/openai"

# Run Gemini integration tests
GEMINI_API_KEY=xxx npm test -- --testPathPatterns="integration/gemini"

# Run VoyageAI integration tests
VOYAGEAI_API_KEY=xxx npm test -- --testPathPatterns="integration/voyageai"

# Run Ollama integration tests (requires Ollama running locally)
OLLAMA_ENABLED=true npm test -- --testPathPatterns="integration/ollama"

# Run all integration tests
OPENAI_API_KEY=sk-xxx \
GEMINI_API_KEY=xxx \
VOYAGEAI_API_KEY=xxx \
OLLAMA_ENABLED=true \
npm test -- --testPathPatterns="integration"
```

#### Ollama Prerequisites

To run Ollama integration tests:

1. Install Ollama: https://ollama.ai
2. Pull an embedding model:
   ```bash
   ollama pull nomic-embed-text
   ```
3. Ensure Ollama is running:
   ```bash
   ollama serve
   ```
4. Run tests with `OLLAMA_ENABLED=true`

### Writing Tests

#### Unit Tests (Mocked)

Unit tests should mock external dependencies to ensure fast, reliable tests:

```typescript
// Mock the external API
const mockEmbed = jest.fn();
jest.mock('openai', () => ({
    default: function() {
        return { embeddings: { create: mockEmbed } };
    }
}));

describe('OpenAIEmbedding', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should generate embedding', async () => {
        mockEmbed.mockResolvedValueOnce({
            data: [{ embedding: [0.1, 0.2, 0.3] }]
        });

        const embedding = new OpenAIEmbedding({ apiKey: 'test', model: 'text-embedding-3-small' });
        const result = await embedding.embed('Hello');

        expect(result.vector).toBeDefined();
        expect(mockEmbed).toHaveBeenCalled();
    });
});
```

#### Integration Tests

Integration tests should be conditionally skipped when credentials are not available:

```typescript
const API_KEY = process.env.MY_API_KEY;
const describeIfEnabled = API_KEY ? describe : describe.skip;

describeIfEnabled('MyProvider Integration Tests', () => {
    jest.setTimeout(30000); // Increase timeout for real API calls

    it('should generate real embedding', async () => {
        const embedding = new MyProvider({ apiKey: API_KEY! });
        const result = await embedding.embed('Hello, world!');

        expect(result.vector).toBeDefined();
        expect(result.vector.length).toBeGreaterThan(0);
    });
});

if (!API_KEY) {
    console.log('⏭️  Skipping MyProvider integration tests (MY_API_KEY not set)');
}
```

### Test Coverage

We aim for high test coverage. Run coverage report:

```bash
npm test -- --coverage
```

Coverage reports are generated in the `coverage/` directory.

## Guidelines

- Use TypeScript strict mode
- Follow existing code style
- Handle errors gracefully
- Write tests for new functionality
- Update documentation when adding features

## Questions?

- **General questions**: See [main contributing guide](../../CONTRIBUTING.md)
- **Core-specific issues**: Open an issue with the `core` label

/**
 * Integration tests for Gemini Embedding
 *
 * These tests make real API calls and require the following environment variable:
 * - GEMINI_API_KEY: Your Google AI API key (or GOOGLE_AI_API_KEY)
 *
 * To run these tests:
 * GEMINI_API_KEY=xxx pnpm test -- --testPathPattern="integration/gemini"
 */

import { GeminiEmbedding } from '../../embedding/gemini-embedding';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

const describeIfEnabled = GEMINI_API_KEY ? describe : describe.skip;

describeIfEnabled('GeminiEmbedding Integration Tests', () => {
    // Increase timeout for real API calls
    jest.setTimeout(30000);

    let embedding: GeminiEmbedding;

    beforeAll(() => {
        embedding = new GeminiEmbedding({
            model: 'gemini-embedding-001',
            apiKey: GEMINI_API_KEY!,
        });
    });

    describe('embed', () => {
        it('should generate a real embedding for text', async () => {
            const result = await embedding.embed('Hello, world!');

            expect(result.vector).toBeDefined();
            expect(Array.isArray(result.vector)).toBe(true);
            expect(result.vector.length).toBeGreaterThan(0);
            expect(result.dimension).toBe(result.vector.length);

            // Check that all values are numbers
            result.vector.forEach(value => {
                expect(typeof value).toBe('number');
                expect(isNaN(value)).toBe(false);
            });
        });

        it('should generate consistent dimensions for same model', async () => {
            const result1 = await embedding.embed('First text');
            const result2 = await embedding.embed('Second text');

            expect(result1.dimension).toBe(result2.dimension);
        });

        it('should handle empty string', async () => {
            const result = await embedding.embed('');

            expect(result.vector).toBeDefined();
            expect(result.vector.length).toBeGreaterThan(0);
        });

        it('should handle unicode text', async () => {
            const result = await embedding.embed('Hello World 🌍 こんにちは');

            expect(result.vector).toBeDefined();
            expect(result.vector.length).toBeGreaterThan(0);
        });

        it('should handle code snippets', async () => {
            const code = `
function fibonacci(n) {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}
            `;
            const result = await embedding.embed(code);

            expect(result.vector).toBeDefined();
            expect(result.vector.length).toBeGreaterThan(0);
        });
    });

    describe('embedBatch', () => {
        it('should generate embeddings for multiple texts', async () => {
            const texts = ['Hello', 'World', 'Test'];
            const results = await embedding.embedBatch(texts);

            expect(results).toHaveLength(3);
            results.forEach(result => {
                expect(result.vector).toBeDefined();
                expect(result.vector.length).toBeGreaterThan(0);
            });
        });

        it('should maintain order of embeddings', async () => {
            const texts = ['Apple', 'Banana', 'Cherry'];
            const results = await embedding.embedBatch(texts);

            expect(results).toHaveLength(3);
            // Each text should have its own unique embedding
            expect(results[0].vector).not.toEqual(results[1].vector);
            expect(results[1].vector).not.toEqual(results[2].vector);
        });
    });

    describe('detectDimension', () => {
        it('should return correct dimension for gemini-embedding-001', async () => {
            const dimension = await embedding.detectDimension();
            expect(dimension).toBe(3072);
        });
    });

    describe('outputDimensionality', () => {
        it('should work with reduced dimension', async () => {
            const reducedEmbedding = new GeminiEmbedding({
                model: 'gemini-embedding-001',
                apiKey: GEMINI_API_KEY!,
                outputDimensionality: 768,
            });

            const result = await reducedEmbedding.embed('Test text');

            expect(result.vector).toBeDefined();
            expect(result.dimension).toBe(768);
        });
    });

    describe('getProvider', () => {
        it('should return "Gemini"', () => {
            expect(embedding.getProvider()).toBe('Gemini');
        });
    });

    describe('getSupportedModels', () => {
        it('should list available models', () => {
            const models = GeminiEmbedding.getSupportedModels();
            expect(models).toHaveProperty('gemini-embedding-001');
        });
    });
});

// Log skip message if not enabled
if (!GEMINI_API_KEY) {
    console.log('⏭️  Skipping Gemini integration tests (GEMINI_API_KEY or GOOGLE_AI_API_KEY not set)');
}

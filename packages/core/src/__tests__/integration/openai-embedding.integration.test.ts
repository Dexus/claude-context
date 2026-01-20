/**
 * Integration tests for OpenAI Embedding
 *
 * These tests make real API calls and require the following environment variable:
 * - OPENAI_API_KEY: Your OpenAI API key
 *
 * To run these tests:
 * OPENAI_API_KEY=sk-xxx pnpm test -- --testPathPattern="integration/openai"
 */

import { OpenAIEmbedding } from '../../embedding/openai-embedding';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const describeIfEnabled = OPENAI_API_KEY ? describe : describe.skip;

describeIfEnabled('OpenAIEmbedding Integration Tests', () => {
    // Increase timeout for real API calls
    jest.setTimeout(30000);

    let embedding: OpenAIEmbedding;

    beforeAll(() => {
        embedding = new OpenAIEmbedding({
            model: 'text-embedding-3-small',
            apiKey: OPENAI_API_KEY!,
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
        it('should return correct dimension for text-embedding-3-small', async () => {
            const dimension = await embedding.detectDimension();
            expect(dimension).toBe(1536);
        });
    });

    describe('model switching', () => {
        it('should work with text-embedding-3-large', async () => {
            const largeEmbedding = new OpenAIEmbedding({
                model: 'text-embedding-3-large',
                apiKey: OPENAI_API_KEY!,
            });

            const result = await largeEmbedding.embed('Test text');

            expect(result.vector).toBeDefined();
            expect(result.dimension).toBe(3072);
        });
    });

    describe('getProvider', () => {
        it('should return "OpenAI"', () => {
            expect(embedding.getProvider()).toBe('OpenAI');
        });
    });
});

// Log skip message if not enabled
if (!OPENAI_API_KEY) {
    console.log('⏭️  Skipping OpenAI integration tests (OPENAI_API_KEY not set)');
}

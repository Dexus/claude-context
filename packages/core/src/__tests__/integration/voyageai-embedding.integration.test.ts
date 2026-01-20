/**
 * Integration tests for VoyageAI Embedding
 *
 * These tests make real API calls and require the following environment variable:
 * - VOYAGEAI_API_KEY: Your VoyageAI API key
 *
 * To run these tests:
 * VOYAGEAI_API_KEY=xxx npm test -- --testPathPatterns="integration/voyageai"
 */

import { VoyageAIEmbedding } from '../../embedding/voyageai-embedding';

const VOYAGEAI_API_KEY = process.env.VOYAGEAI_API_KEY;

const describeIfEnabled = VOYAGEAI_API_KEY ? describe : describe.skip;

describeIfEnabled('VoyageAIEmbedding Integration Tests', () => {
    // Increase timeout for real API calls
    jest.setTimeout(30000);

    let embedding: VoyageAIEmbedding;

    beforeAll(() => {
        embedding = new VoyageAIEmbedding({
            model: 'voyage-3-lite',
            apiKey: VOYAGEAI_API_KEY!,
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
        it('should return correct dimension for voyage-3-lite', async () => {
            const dimension = await embedding.detectDimension();
            expect(dimension).toBe(512);
        });
    });

    describe('inputType', () => {
        it('should work with query inputType', async () => {
            embedding.setInputType('query');
            const result = await embedding.embed('What is the meaning of life?');

            expect(result.vector).toBeDefined();
            expect(result.vector.length).toBeGreaterThan(0);

            // Reset to document
            embedding.setInputType('document');
        });
    });

    describe('model switching', () => {
        it('should work with voyage-code-3 for code', async () => {
            const codeEmbedding = new VoyageAIEmbedding({
                model: 'voyage-code-3',
                apiKey: VOYAGEAI_API_KEY!,
            });

            const code = 'function hello() { return "world"; }';
            const result = await codeEmbedding.embed(code);

            expect(result.vector).toBeDefined();
            expect(result.dimension).toBe(1024);
        });
    });

    describe('getProvider', () => {
        it('should return "VoyageAI"', () => {
            expect(embedding.getProvider()).toBe('VoyageAI');
        });
    });

    describe('getSupportedModels', () => {
        it('should list available models', () => {
            const models = VoyageAIEmbedding.getSupportedModels();
            expect(models).toHaveProperty('voyage-code-3');
            expect(models).toHaveProperty('voyage-3-lite');
        });
    });
});

// Log skip message if not enabled
if (!VOYAGEAI_API_KEY) {
    console.log('⏭️  Skipping VoyageAI integration tests (VOYAGEAI_API_KEY not set)');
}

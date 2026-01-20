/**
 * Integration tests for Ollama Embedding
 *
 * These tests make real API calls and require Ollama to be running locally.
 * Required environment variable:
 * - OLLAMA_ENABLED: Set to "true" to run these tests
 * - OLLAMA_HOST: (Optional) Ollama host URL, defaults to http://127.0.0.1:11434
 * - OLLAMA_MODEL: (Optional) Model to use, defaults to nomic-embed-text
 *
 * Prerequisites:
 * 1. Install Ollama: https://ollama.ai
 * 2. Pull an embedding model: ollama pull nomic-embed-text
 * 3. Ensure Ollama is running: ollama serve
 *
 * To run these tests:
 * OLLAMA_ENABLED=true npm test -- --testPathPatterns="integration/ollama"
 */

import { OllamaEmbedding } from '../../embedding/ollama-embedding';

const OLLAMA_ENABLED = process.env.OLLAMA_ENABLED === 'true';
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'nomic-embed-text';

const describeIfEnabled = OLLAMA_ENABLED ? describe : describe.skip;

describeIfEnabled('OllamaEmbedding Integration Tests', () => {
    // Increase timeout for real API calls (Ollama may need to load model)
    jest.setTimeout(60000);

    let embedding: OllamaEmbedding;

    beforeAll(() => {
        embedding = new OllamaEmbedding({
            model: OLLAMA_MODEL,
            host: OLLAMA_HOST,
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

        it('should handle long text', async () => {
            const longText = 'This is a test sentence. '.repeat(100);
            const result = await embedding.embed(longText);

            expect(result.vector).toBeDefined();
            expect(result.vector.length).toBeGreaterThan(0);
        });
    });

    describe('detectDimension', () => {
        it('should detect dimension from the model', async () => {
            const dimension = await embedding.detectDimension();

            expect(typeof dimension).toBe('number');
            expect(dimension).toBeGreaterThan(0);
        });

        it('should return consistent dimension', async () => {
            const dimension1 = await embedding.detectDimension();
            const dimension2 = await embedding.detectDimension();

            expect(dimension1).toBe(dimension2);
        });
    });

    describe('getDimension', () => {
        it('should return dimension after embed call', async () => {
            // Ensure dimension is detected
            await embedding.embed('test');

            const dimension = embedding.getDimension();
            expect(typeof dimension).toBe('number');
            expect(dimension).toBeGreaterThan(0);
        });
    });

    describe('getProvider', () => {
        it('should return "Ollama"', () => {
            expect(embedding.getProvider()).toBe('Ollama');
        });
    });

    describe('configuration', () => {
        it('should work with custom host', async () => {
            const customEmbedding = new OllamaEmbedding({
                model: OLLAMA_MODEL,
                host: OLLAMA_HOST,
            });

            const result = await customEmbedding.embed('Test with custom host');
            expect(result.vector).toBeDefined();
        });

        it('should work with keepAlive option', async () => {
            const keepAliveEmbedding = new OllamaEmbedding({
                model: OLLAMA_MODEL,
                host: OLLAMA_HOST,
                keepAlive: '5m',
            });

            const result = await keepAliveEmbedding.embed('Test with keepAlive');
            expect(result.vector).toBeDefined();
        });

        it('should work with pre-configured dimension', async () => {
            // First detect the actual dimension
            const actualDimension = await embedding.detectDimension();

            const configuredEmbedding = new OllamaEmbedding({
                model: OLLAMA_MODEL,
                host: OLLAMA_HOST,
                dimension: actualDimension,
            });

            const result = await configuredEmbedding.embed('Test with configured dimension');
            expect(result.dimension).toBe(actualDimension);
        });
    });

    describe('error handling', () => {
        it('should throw error for non-existent model', async () => {
            const badEmbedding = new OllamaEmbedding({
                model: 'non-existent-model-12345',
                host: OLLAMA_HOST,
            });

            await expect(badEmbedding.embed('test')).rejects.toThrow();
        });

        it('should throw error for invalid host', async () => {
            const badEmbedding = new OllamaEmbedding({
                model: OLLAMA_MODEL,
                host: 'http://invalid-host-12345:11434',
            });

            await expect(badEmbedding.embed('test')).rejects.toThrow();
        });
    });
});

// Log skip message if not enabled
if (!OLLAMA_ENABLED) {
    console.log('⏭️  Skipping Ollama integration tests (OLLAMA_ENABLED not set to "true")');
    console.log('   To run: OLLAMA_ENABLED=true npm test -- --testPathPatterns="integration/ollama"');
}

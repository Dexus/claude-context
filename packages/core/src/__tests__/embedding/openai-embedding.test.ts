import { OpenAIEmbedding, OpenAIEmbeddingConfig } from '../../embedding/openai-embedding';

// Create mock function at module level - Jest hoists these
const mockEmbeddingsCreate = jest.fn();
const mockOpenAIConstructor = jest.fn();

// Mock the OpenAI module - factory function must be self-contained
jest.mock('openai', () => {
    // This creates a new mock constructor each time
    return function MockOpenAI(config: { apiKey: string; baseURL?: string }) {
        // Store the call args for testing
        mockOpenAIConstructor(config);
        return {
            embeddings: {
                create: mockEmbeddingsCreate,
            },
        };
    };
});

describe('OpenAIEmbedding', () => {
    const defaultConfig: OpenAIEmbeddingConfig = {
        model: 'text-embedding-3-small',
        apiKey: 'test-api-key',
    };

    // Helper to create a mock embedding response
    const createMockResponse = (embeddings: number[][]) => ({
        object: 'list',
        data: embeddings.map((embedding, index) => ({
            object: 'embedding',
            index,
            embedding,
        })),
        model: 'text-embedding-3-small',
        usage: {
            prompt_tokens: 10,
            total_tokens: 10,
        },
    });

    // Helper to generate a vector of specific dimension
    const generateVector = (dimension: number): number[] => {
        return Array.from({ length: dimension }, (_, i) => i / dimension);
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockEmbeddingsCreate.mockReset();
        mockOpenAIConstructor.mockReset();
    });

    describe('constructor', () => {
        it('should create instance with required config', () => {
            const embedding = new OpenAIEmbedding(defaultConfig);
            expect(embedding).toBeInstanceOf(OpenAIEmbedding);
        });

        it('should create OpenAI client with apiKey', () => {
            const config: OpenAIEmbeddingConfig = {
                model: 'text-embedding-3-small',
                apiKey: 'my-secret-key',
            };

            new OpenAIEmbedding(config);

            expect(mockOpenAIConstructor).toHaveBeenCalledWith({
                apiKey: 'my-secret-key',
                baseURL: undefined,
            });
        });

        it('should create OpenAI client with custom baseURL', () => {
            const config: OpenAIEmbeddingConfig = {
                model: 'text-embedding-3-small',
                apiKey: 'test-key',
                baseURL: 'https://custom.api.com/v1',
            };

            new OpenAIEmbedding(config);

            expect(mockOpenAIConstructor).toHaveBeenCalledWith({
                apiKey: 'test-key',
                baseURL: 'https://custom.api.com/v1',
            });
        });
    });

    describe('getProvider', () => {
        it('should return "OpenAI"', () => {
            const embedding = new OpenAIEmbedding(defaultConfig);
            expect(embedding.getProvider()).toBe('OpenAI');
        });
    });

    describe('getDimension', () => {
        it('should return default dimension of 1536', () => {
            const embedding = new OpenAIEmbedding(defaultConfig);
            expect(embedding.getDimension()).toBe(1536);
        });
    });

    describe('getClient', () => {
        it('should return the OpenAI client instance', () => {
            const embedding = new OpenAIEmbedding(defaultConfig);
            const client = embedding.getClient();
            expect(client).toBeDefined();
            expect(client.embeddings).toBeDefined();
            expect(client.embeddings.create).toBeDefined();
        });
    });

    describe('getSupportedModels', () => {
        it('should return list of supported models', () => {
            const models = OpenAIEmbedding.getSupportedModels();

            expect(models).toHaveProperty('text-embedding-3-small');
            expect(models).toHaveProperty('text-embedding-3-large');
            expect(models).toHaveProperty('text-embedding-ada-002');
        });

        it('should return correct dimensions for text-embedding-3-small', () => {
            const models = OpenAIEmbedding.getSupportedModels();
            expect(models['text-embedding-3-small'].dimension).toBe(1536);
        });

        it('should return correct dimensions for text-embedding-3-large', () => {
            const models = OpenAIEmbedding.getSupportedModels();
            expect(models['text-embedding-3-large'].dimension).toBe(3072);
        });

        it('should return correct dimensions for text-embedding-ada-002', () => {
            const models = OpenAIEmbedding.getSupportedModels();
            expect(models['text-embedding-ada-002'].dimension).toBe(1536);
        });

        it('should include descriptions for all models', () => {
            const models = OpenAIEmbedding.getSupportedModels();
            for (const modelName of Object.keys(models)) {
                expect(models[modelName].description).toBeDefined();
                expect(typeof models[modelName].description).toBe('string');
                expect(models[modelName].description.length).toBeGreaterThan(0);
            }
        });
    });

    describe('detectDimension', () => {
        it('should return known dimension for text-embedding-3-small', async () => {
            const embedding = new OpenAIEmbedding({
                ...defaultConfig,
                model: 'text-embedding-3-small',
            });

            const dimension = await embedding.detectDimension();
            expect(dimension).toBe(1536);
            // Should not call API for known models
            expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
        });

        it('should return known dimension for text-embedding-3-large', async () => {
            const embedding = new OpenAIEmbedding({
                ...defaultConfig,
                model: 'text-embedding-3-large',
            });

            const dimension = await embedding.detectDimension();
            expect(dimension).toBe(3072);
            expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
        });

        it('should return known dimension for text-embedding-ada-002', async () => {
            const embedding = new OpenAIEmbedding({
                ...defaultConfig,
                model: 'text-embedding-ada-002',
            });

            const dimension = await embedding.detectDimension();
            expect(dimension).toBe(1536);
            expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
        });

        it('should call API to detect dimension for custom models', async () => {
            const customDimension = 2048;
            const mockVector = generateVector(customDimension);

            mockEmbeddingsCreate.mockResolvedValueOnce(createMockResponse([mockVector]));

            const embedding = new OpenAIEmbedding({
                ...defaultConfig,
                model: 'custom-embedding-model',
            });

            const dimension = await embedding.detectDimension();

            expect(dimension).toBe(customDimension);
            expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
                model: 'custom-embedding-model',
                input: 'test',
                encoding_format: 'float',
            });
        });

        it('should use custom test text for dimension detection', async () => {
            mockEmbeddingsCreate.mockResolvedValueOnce(createMockResponse([generateVector(512)]));

            const embedding = new OpenAIEmbedding({
                ...defaultConfig,
                model: 'custom-model',
            });

            await embedding.detectDimension('custom test text');

            expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
                model: 'custom-model',
                input: 'custom test text',
                encoding_format: 'float',
            });
        });

        it('should throw error on API key authentication failure', async () => {
            mockEmbeddingsCreate.mockRejectedValueOnce(new Error('Invalid API key'));

            const embedding = new OpenAIEmbedding({
                ...defaultConfig,
                model: 'custom-model',
            });

            await expect(embedding.detectDimension()).rejects.toThrow(
                'Failed to detect dimension for model custom-model: Invalid API key'
            );
        });

        it('should throw error on unauthorized access', async () => {
            mockEmbeddingsCreate.mockRejectedValueOnce(new Error('unauthorized access'));

            const embedding = new OpenAIEmbedding({
                ...defaultConfig,
                model: 'custom-model',
            });

            await expect(embedding.detectDimension()).rejects.toThrow(
                'Failed to detect dimension for model custom-model: unauthorized access'
            );
        });

        it('should throw error on authentication errors', async () => {
            mockEmbeddingsCreate.mockRejectedValueOnce(new Error('authentication failed'));

            const embedding = new OpenAIEmbedding({
                ...defaultConfig,
                model: 'custom-model',
            });

            await expect(embedding.detectDimension()).rejects.toThrow(
                'Failed to detect dimension for model custom-model: authentication failed'
            );
        });

        it('should throw error on other API failures', async () => {
            mockEmbeddingsCreate.mockRejectedValueOnce(new Error('Network error'));

            const embedding = new OpenAIEmbedding({
                ...defaultConfig,
                model: 'custom-model',
            });

            await expect(embedding.detectDimension()).rejects.toThrow(
                'Failed to detect dimension for model custom-model: Network error'
            );
        });

        it('should handle non-Error exceptions', async () => {
            mockEmbeddingsCreate.mockRejectedValueOnce('string error');

            const embedding = new OpenAIEmbedding({
                ...defaultConfig,
                model: 'custom-model',
            });

            await expect(embedding.detectDimension()).rejects.toThrow(
                'Failed to detect dimension for model custom-model: Unknown error'
            );
        });
    });

    describe('embed', () => {
        it('should generate embedding for text', async () => {
            const mockVector = generateVector(1536);
            mockEmbeddingsCreate.mockResolvedValueOnce(createMockResponse([mockVector]));

            const embedding = new OpenAIEmbedding(defaultConfig);
            const result = await embedding.embed('Hello, world!');

            expect(result.vector).toEqual(mockVector);
            expect(result.dimension).toBe(1536);
        });

        it('should call API with correct parameters', async () => {
            mockEmbeddingsCreate.mockResolvedValueOnce(createMockResponse([generateVector(1536)]));

            const embedding = new OpenAIEmbedding(defaultConfig);
            await embedding.embed('Test text');

            expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
                model: 'text-embedding-3-small',
                input: 'Test text',
                encoding_format: 'float',
            });
        });

        it('should use default model when not specified', async () => {
            mockEmbeddingsCreate.mockResolvedValueOnce(createMockResponse([generateVector(1536)]));

            const embedding = new OpenAIEmbedding({
                model: '',
                apiKey: 'test-key',
            });
            await embedding.embed('Test');

            expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
                model: 'text-embedding-3-small',
                input: 'Test',
                encoding_format: 'float',
            });
        });

        it('should preprocess empty string to space', async () => {
            mockEmbeddingsCreate.mockResolvedValueOnce(createMockResponse([generateVector(1536)]));

            const embedding = new OpenAIEmbedding(defaultConfig);
            await embedding.embed('');

            expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
                model: 'text-embedding-3-small',
                input: ' ',
                encoding_format: 'float',
            });
        });

        it('should update dimension from response', async () => {
            const customDimension = 2048;
            mockEmbeddingsCreate.mockResolvedValueOnce(createMockResponse([generateVector(customDimension)]));

            const embedding = new OpenAIEmbedding(defaultConfig);
            const result = await embedding.embed('Test');

            expect(result.dimension).toBe(customDimension);
            expect(embedding.getDimension()).toBe(customDimension);
        });

        it('should throw error on API failure', async () => {
            mockEmbeddingsCreate.mockRejectedValueOnce(new Error('Rate limit exceeded'));

            const embedding = new OpenAIEmbedding(defaultConfig);

            await expect(embedding.embed('Test')).rejects.toThrow(
                'Failed to generate OpenAI embedding: Rate limit exceeded'
            );
        });

        it('should handle non-Error exceptions', async () => {
            mockEmbeddingsCreate.mockRejectedValueOnce({ status: 500 });

            const embedding = new OpenAIEmbedding(defaultConfig);

            await expect(embedding.embed('Test')).rejects.toThrow(
                'Failed to generate OpenAI embedding: Unknown error'
            );
        });

        it('should set dimension for text-embedding-3-large model', async () => {
            mockEmbeddingsCreate.mockResolvedValueOnce(createMockResponse([generateVector(3072)]));

            const embedding = new OpenAIEmbedding({
                ...defaultConfig,
                model: 'text-embedding-3-large',
            });

            const result = await embedding.embed('Test');

            expect(result.dimension).toBe(3072);
        });

        it('should detect dimension for unknown models', async () => {
            const customVector = generateVector(512);

            // First call for detectDimension, second for embed
            mockEmbeddingsCreate
                .mockResolvedValueOnce(createMockResponse([customVector]))
                .mockResolvedValueOnce(createMockResponse([customVector]));

            const embedding = new OpenAIEmbedding({
                ...defaultConfig,
                model: 'custom-unknown-model',
            });

            const result = await embedding.embed('Test');

            expect(result.dimension).toBe(512);
            expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(2);
        });
    });

    describe('embedBatch', () => {
        it('should generate embeddings for multiple texts', async () => {
            const mockVectors = [generateVector(1536), generateVector(1536), generateVector(1536)];
            mockEmbeddingsCreate.mockResolvedValueOnce(createMockResponse(mockVectors));

            const embedding = new OpenAIEmbedding(defaultConfig);
            const results = await embedding.embedBatch(['Text 1', 'Text 2', 'Text 3']);

            expect(results).toHaveLength(3);
            expect(results[0].vector).toEqual(mockVectors[0]);
            expect(results[1].vector).toEqual(mockVectors[1]);
            expect(results[2].vector).toEqual(mockVectors[2]);
        });

        it('should set dimension for all results', async () => {
            const mockVectors = [generateVector(1536), generateVector(1536)];
            mockEmbeddingsCreate.mockResolvedValueOnce(createMockResponse(mockVectors));

            const embedding = new OpenAIEmbedding(defaultConfig);
            const results = await embedding.embedBatch(['Text 1', 'Text 2']);

            expect(results[0].dimension).toBe(1536);
            expect(results[1].dimension).toBe(1536);
        });

        it('should call API with array of texts', async () => {
            mockEmbeddingsCreate.mockResolvedValueOnce(createMockResponse([generateVector(1536), generateVector(1536)]));

            const embedding = new OpenAIEmbedding(defaultConfig);
            await embedding.embedBatch(['Hello', 'World']);

            expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
                model: 'text-embedding-3-small',
                input: ['Hello', 'World'],
                encoding_format: 'float',
            });
        });

        it('should preprocess empty strings in batch', async () => {
            mockEmbeddingsCreate.mockResolvedValueOnce(
                createMockResponse([generateVector(1536), generateVector(1536), generateVector(1536)])
            );

            const embedding = new OpenAIEmbedding(defaultConfig);
            await embedding.embedBatch(['Text', '', 'More']);

            expect(mockEmbeddingsCreate).toHaveBeenCalledWith({
                model: 'text-embedding-3-small',
                input: ['Text', ' ', 'More'],
                encoding_format: 'float',
            });
        });

        it('should handle single item batch', async () => {
            mockEmbeddingsCreate.mockResolvedValueOnce(createMockResponse([generateVector(1536)]));

            const embedding = new OpenAIEmbedding(defaultConfig);
            const results = await embedding.embedBatch(['Single text']);

            expect(results).toHaveLength(1);
            expect(results[0].dimension).toBe(1536);
        });

        it('should update dimension from response', async () => {
            const customDimension = 2048;
            mockEmbeddingsCreate.mockResolvedValueOnce(createMockResponse([generateVector(customDimension)]));

            const embedding = new OpenAIEmbedding(defaultConfig);
            await embedding.embedBatch(['Test']);

            expect(embedding.getDimension()).toBe(customDimension);
        });

        it('should throw error on API failure', async () => {
            mockEmbeddingsCreate.mockRejectedValueOnce(new Error('Service unavailable'));

            const embedding = new OpenAIEmbedding(defaultConfig);

            await expect(embedding.embedBatch(['Test'])).rejects.toThrow(
                'Failed to generate OpenAI batch embeddings: Service unavailable'
            );
        });

        it('should handle non-Error exceptions', async () => {
            mockEmbeddingsCreate.mockRejectedValueOnce(null);

            const embedding = new OpenAIEmbedding(defaultConfig);

            await expect(embedding.embedBatch(['Test'])).rejects.toThrow(
                'Failed to generate OpenAI batch embeddings: Unknown error'
            );
        });

        it('should detect dimension for unknown models', async () => {
            const customVector = generateVector(768);

            // First call for detectDimension, second for embedBatch
            mockEmbeddingsCreate
                .mockResolvedValueOnce(createMockResponse([customVector]))
                .mockResolvedValueOnce(createMockResponse([customVector, customVector]));

            const embedding = new OpenAIEmbedding({
                ...defaultConfig,
                model: 'custom-batch-model',
            });

            const results = await embedding.embedBatch(['Text 1', 'Text 2']);

            expect(results).toHaveLength(2);
            expect(results[0].dimension).toBe(768);
            expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(2);
        });

        it('should use text-embedding-3-large model correctly', async () => {
            mockEmbeddingsCreate.mockResolvedValueOnce(createMockResponse([generateVector(3072), generateVector(3072)]));

            const embedding = new OpenAIEmbedding({
                ...defaultConfig,
                model: 'text-embedding-3-large',
            });

            const results = await embedding.embedBatch(['Text 1', 'Text 2']);

            expect(results[0].dimension).toBe(3072);
            expect(results[1].dimension).toBe(3072);
        });
    });

    describe('setModel', () => {
        it('should update model and dimension for known model', async () => {
            const embedding = new OpenAIEmbedding(defaultConfig);
            expect(embedding.getDimension()).toBe(1536);

            await embedding.setModel('text-embedding-3-large');

            expect(embedding.getDimension()).toBe(3072);
        });

        it('should detect dimension for unknown model', async () => {
            mockEmbeddingsCreate.mockResolvedValueOnce(createMockResponse([generateVector(1024)]));

            const embedding = new OpenAIEmbedding(defaultConfig);
            await embedding.setModel('custom-model');

            expect(mockEmbeddingsCreate).toHaveBeenCalled();
            expect(embedding.getDimension()).toBe(1024);
        });

        it('should update to text-embedding-ada-002', async () => {
            const embedding = new OpenAIEmbedding({
                ...defaultConfig,
                model: 'text-embedding-3-large',
            });

            await embedding.setModel('text-embedding-ada-002');

            expect(embedding.getDimension()).toBe(1536);
        });

        it('should correctly use new model in subsequent embed calls', async () => {
            // Setup: first embed call, then second embed call after model change
            mockEmbeddingsCreate
                .mockResolvedValueOnce(createMockResponse([generateVector(1536)]))
                .mockResolvedValueOnce(createMockResponse([generateVector(3072)]));

            // Create embedding with known model (no detectDimension call needed)
            const embedding = new OpenAIEmbedding({
                model: 'text-embedding-3-small',
                apiKey: 'test-key',
            });

            // First embed with default model
            await embedding.embed('Test 1');

            // Verify first call used small model
            expect(mockEmbeddingsCreate).toHaveBeenNthCalledWith(1, {
                model: 'text-embedding-3-small',
                input: 'Test 1',
                encoding_format: 'float',
            });

            // Change to large model (known model, no detectDimension)
            await embedding.setModel('text-embedding-3-large');

            // Second embed with new model
            await embedding.embed('Test 2');

            // Verify second call used large model
            expect(mockEmbeddingsCreate).toHaveBeenNthCalledWith(2, {
                model: 'text-embedding-3-large',
                input: 'Test 2',
                encoding_format: 'float',
            });
        });
    });

    describe('text preprocessing integration', () => {
        it('should truncate very long texts', async () => {
            mockEmbeddingsCreate.mockResolvedValue(createMockResponse([generateVector(1536)]));

            // Create new instance with known model
            const embedding = new OpenAIEmbedding({
                model: 'text-embedding-3-small',
                apiKey: 'test-key',
            });

            // maxTokens is 8192, so max chars is 8192 * 4 = 32768
            const longText = 'a'.repeat(50000);

            await embedding.embed(longText);

            const calledWith = mockEmbeddingsCreate.mock.calls[0][0];
            expect(calledWith.input.length).toBe(32768);
        });

        it('should handle text at exactly max length', async () => {
            mockEmbeddingsCreate.mockResolvedValue(createMockResponse([generateVector(1536)]));

            const embedding = new OpenAIEmbedding({
                model: 'text-embedding-3-small',
                apiKey: 'test-key',
            });
            const exactText = 'b'.repeat(32768);

            await embedding.embed(exactText);

            const calledWith = mockEmbeddingsCreate.mock.calls[0][0];
            expect(calledWith.input.length).toBe(32768);
        });

        it('should preserve text under max length', async () => {
            mockEmbeddingsCreate.mockResolvedValue(createMockResponse([generateVector(1536)]));

            const embedding = new OpenAIEmbedding({
                model: 'text-embedding-3-small',
                apiKey: 'test-key',
            });
            const shortText = 'Hello, world!';

            await embedding.embed(shortText);

            const calledWith = mockEmbeddingsCreate.mock.calls[0][0];
            expect(calledWith.input).toBe(shortText);
        });

        it('should handle unicode characters', async () => {
            mockEmbeddingsCreate.mockResolvedValue(createMockResponse([generateVector(1536)]));

            const embedding = new OpenAIEmbedding({
                model: 'text-embedding-3-small',
                apiKey: 'test-key',
            });
            const unicodeText = 'Hello World';

            await embedding.embed(unicodeText);

            const calledWith = mockEmbeddingsCreate.mock.calls[0][0];
            expect(calledWith.input).toBe(unicodeText);
        });

        it('should handle newlines and special characters', async () => {
            mockEmbeddingsCreate.mockResolvedValue(createMockResponse([generateVector(1536)]));

            const embedding = new OpenAIEmbedding({
                model: 'text-embedding-3-small',
                apiKey: 'test-key',
            });
            const specialText = 'Line 1\nLine 2\tTabbed\r\nWindows';

            await embedding.embed(specialText);

            const calledWith = mockEmbeddingsCreate.mock.calls[0][0];
            expect(calledWith.input).toBe(specialText);
        });
    });

    describe('dimension update scenarios', () => {
        it('should update dimension when switching from small to large model', async () => {
            mockEmbeddingsCreate.mockResolvedValueOnce(createMockResponse([generateVector(3072)]));

            const embedding = new OpenAIEmbedding({
                ...defaultConfig,
                model: 'text-embedding-3-large',
            });

            // Dimension should be set to 3072 for this model before the API call
            await embedding.embed('Test');

            expect(embedding.getDimension()).toBe(3072);
        });

        it('should not reset dimension unnecessarily for same model', async () => {
            mockEmbeddingsCreate
                .mockResolvedValueOnce(createMockResponse([generateVector(1536)]))
                .mockResolvedValueOnce(createMockResponse([generateVector(1536)]));

            // Use known model to avoid detectDimension calls
            const embedding = new OpenAIEmbedding({
                model: 'text-embedding-3-small',
                apiKey: 'test-key',
            });

            await embedding.embed('First');
            const firstDimension = embedding.getDimension();

            await embedding.embed('Second');
            const secondDimension = embedding.getDimension();

            expect(firstDimension).toBe(secondDimension);
            expect(firstDimension).toBe(1536);
        });
    });

    describe('error handling edge cases', () => {
        it('should handle errors with empty message during detection', async () => {
            // Create an error with empty message (not undefined)
            mockEmbeddingsCreate.mockRejectedValueOnce(new Error(''));

            const embedding = new OpenAIEmbedding({
                ...defaultConfig,
                model: 'custom-model',
            });

            // Empty string is still a valid error message
            await expect(embedding.detectDimension()).rejects.toThrow(
                'Failed to detect dimension for model custom-model:'
            );
        });

        it('should handle errors with API key in message during detection', async () => {
            mockEmbeddingsCreate.mockRejectedValueOnce(new Error('Your API key is invalid'));

            const embedding = new OpenAIEmbedding({
                ...defaultConfig,
                model: 'unknown-model',
            });

            await expect(embedding.detectDimension()).rejects.toThrow(
                'Failed to detect dimension for model unknown-model: Your API key is invalid'
            );
        });

        it('should handle timeout errors in embed with known model', async () => {
            mockEmbeddingsCreate.mockRejectedValueOnce(new Error('Request timeout'));

            // Use known model to avoid detectDimension
            const embedding = new OpenAIEmbedding({
                model: 'text-embedding-3-small',
                apiKey: 'test-key',
            });

            await expect(embedding.embed('Test')).rejects.toThrow(
                'Failed to generate OpenAI embedding: Request timeout'
            );
        });

        it('should handle connection errors in embedBatch with known model', async () => {
            mockEmbeddingsCreate.mockRejectedValueOnce(new Error('ECONNREFUSED'));

            // Use known model to avoid detectDimension
            const embedding = new OpenAIEmbedding({
                model: 'text-embedding-3-small',
                apiKey: 'test-key',
            });

            await expect(embedding.embedBatch(['Test'])).rejects.toThrow(
                'Failed to generate OpenAI batch embeddings: ECONNREFUSED'
            );
        });
    });
});

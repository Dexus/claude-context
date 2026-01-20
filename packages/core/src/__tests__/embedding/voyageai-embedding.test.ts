import { VoyageAIEmbedding, VoyageAIEmbeddingConfig } from '../../embedding/voyageai-embedding';

// Create mock function at module level
const mockEmbed = jest.fn();
const mockVoyageAIConstructor = jest.fn();

// Mock the voyageai module
jest.mock('voyageai', () => {
    return {
        VoyageAIClient: function MockVoyageAIClient(config: { apiKey: string }) {
            mockVoyageAIConstructor(config);
            return {
                embed: mockEmbed,
            };
        },
    };
});

describe('VoyageAIEmbedding', () => {
    const defaultConfig: VoyageAIEmbeddingConfig = {
        model: 'voyage-code-3',
        apiKey: 'test-api-key',
    };

    // Helper to create a mock embedding response
    const createMockResponse = (embeddings: number[][]) => ({
        data: embeddings.map((embedding, index) => ({
            object: 'embedding',
            index,
            embedding,
        })),
    });

    // Helper to generate a vector of specific dimension
    const generateVector = (dimension: number): number[] => {
        return Array.from({ length: dimension }, (_, i) => i / dimension);
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockEmbed.mockReset();
        mockVoyageAIConstructor.mockReset();
    });

    describe('constructor', () => {
        it('should create instance with required config', () => {
            const embedding = new VoyageAIEmbedding(defaultConfig);
            expect(embedding).toBeInstanceOf(VoyageAIEmbedding);
        });

        it('should create VoyageAIClient with apiKey', () => {
            const config: VoyageAIEmbeddingConfig = {
                model: 'voyage-code-3',
                apiKey: 'my-secret-key',
            };

            new VoyageAIEmbedding(config);

            expect(mockVoyageAIConstructor).toHaveBeenCalledWith({
                apiKey: 'my-secret-key',
            });
        });

        it('should set default dimension of 1024 for voyage-code-3', () => {
            const embedding = new VoyageAIEmbedding(defaultConfig);
            expect(embedding.getDimension()).toBe(1024);
        });

        it('should set correct dimension for voyage-large-2', () => {
            const embedding = new VoyageAIEmbedding({
                model: 'voyage-large-2',
                apiKey: 'test-key',
            });
            expect(embedding.getDimension()).toBe(1536);
        });

        it('should set correct dimension for voyage-3-lite', () => {
            const embedding = new VoyageAIEmbedding({
                model: 'voyage-3-lite',
                apiKey: 'test-key',
            });
            expect(embedding.getDimension()).toBe(512);
        });

        it('should set correct dimension for voyage-code-2', () => {
            const embedding = new VoyageAIEmbedding({
                model: 'voyage-code-2',
                apiKey: 'test-key',
            });
            expect(embedding.getDimension()).toBe(1536);
        });

        it('should use default dimension for unknown model', () => {
            const embedding = new VoyageAIEmbedding({
                model: 'unknown-model',
                apiKey: 'test-key',
            });
            expect(embedding.getDimension()).toBe(1024);
        });

        it('should use default dimension for models with string dimension', () => {
            // voyage-4-large has dimension as string "1024 (default), 256, 512, 2048"
            const embedding = new VoyageAIEmbedding({
                model: 'voyage-4-large',
                apiKey: 'test-key',
            });
            expect(embedding.getDimension()).toBe(1024);
        });
    });

    describe('getProvider', () => {
        it('should return "VoyageAI"', () => {
            const embedding = new VoyageAIEmbedding(defaultConfig);
            expect(embedding.getProvider()).toBe('VoyageAI');
        });
    });

    describe('getDimension', () => {
        it('should return configured dimension', () => {
            const embedding = new VoyageAIEmbedding(defaultConfig);
            expect(embedding.getDimension()).toBe(1024);
        });
    });

    describe('getClient', () => {
        it('should return the VoyageAIClient instance', () => {
            const embedding = new VoyageAIEmbedding(defaultConfig);
            const client = embedding.getClient();
            expect(client).toBeDefined();
            expect(client.embed).toBeDefined();
        });
    });

    describe('getSupportedModels', () => {
        it('should return list of supported models', () => {
            const models = VoyageAIEmbedding.getSupportedModels();

            expect(models).toHaveProperty('voyage-code-3');
            expect(models).toHaveProperty('voyage-4-large');
            expect(models).toHaveProperty('voyage-4');
            expect(models).toHaveProperty('voyage-4-lite');
            expect(models).toHaveProperty('voyage-3-large');
            expect(models).toHaveProperty('voyage-finance-2');
            expect(models).toHaveProperty('voyage-law-2');
        });

        it('should return correct dimensions for numeric dimension models', () => {
            const models = VoyageAIEmbedding.getSupportedModels();
            expect(models['voyage-finance-2'].dimension).toBe(1024);
            expect(models['voyage-law-2'].dimension).toBe(1024);
            expect(models['voyage-large-2'].dimension).toBe(1536);
        });

        it('should return string dimensions for variable dimension models', () => {
            const models = VoyageAIEmbedding.getSupportedModels();
            expect(typeof models['voyage-4-large'].dimension).toBe('string');
            expect(typeof models['voyage-code-3'].dimension).toBe('string');
        });

        it('should include descriptions for all models', () => {
            const models = VoyageAIEmbedding.getSupportedModels();
            for (const modelName of Object.keys(models)) {
                expect(models[modelName].description).toBeDefined();
                expect(typeof models[modelName].description).toBe('string');
                expect(models[modelName].description.length).toBeGreaterThan(0);
            }
        });

        it('should include contextLength for all models', () => {
            const models = VoyageAIEmbedding.getSupportedModels();
            for (const modelName of Object.keys(models)) {
                expect(models[modelName].contextLength).toBeDefined();
                expect(typeof models[modelName].contextLength).toBe('number');
            }
        });

        it('should include legacy models', () => {
            const models = VoyageAIEmbedding.getSupportedModels();
            expect(models).toHaveProperty('voyage-01');
            expect(models).toHaveProperty('voyage-02');
            expect(models).toHaveProperty('voyage-lite-01');
        });
    });

    describe('detectDimension', () => {
        it('should return configured dimension without API call', async () => {
            const embedding = new VoyageAIEmbedding(defaultConfig);
            const dimension = await embedding.detectDimension();

            expect(dimension).toBe(1024);
            expect(mockEmbed).not.toHaveBeenCalled();
        });
    });

    describe('embed', () => {
        it('should generate embedding for text', async () => {
            const mockVector = generateVector(1024);
            mockEmbed.mockResolvedValueOnce(createMockResponse([mockVector]));

            const embedding = new VoyageAIEmbedding(defaultConfig);
            const result = await embedding.embed('Hello, world!');

            expect(result.vector).toEqual(mockVector);
            expect(result.dimension).toBe(1024);
        });

        it('should call API with correct parameters', async () => {
            mockEmbed.mockResolvedValueOnce(createMockResponse([generateVector(1024)]));

            const embedding = new VoyageAIEmbedding(defaultConfig);
            await embedding.embed('Test text');

            expect(mockEmbed).toHaveBeenCalledWith({
                input: 'Test text',
                model: 'voyage-code-3',
                inputType: 'document',
            });
        });

        it('should use default model when empty', async () => {
            mockEmbed.mockResolvedValueOnce(createMockResponse([generateVector(1024)]));

            const embedding = new VoyageAIEmbedding({
                model: '',
                apiKey: 'test-key',
            });
            await embedding.embed('Test');

            expect(mockEmbed).toHaveBeenCalledWith({
                input: 'Test',
                model: 'voyage-code-3',
                inputType: 'document',
            });
        });

        it('should preprocess empty string to space', async () => {
            mockEmbed.mockResolvedValueOnce(createMockResponse([generateVector(1024)]));

            const embedding = new VoyageAIEmbedding(defaultConfig);
            await embedding.embed('');

            expect(mockEmbed).toHaveBeenCalledWith({
                input: ' ',
                model: 'voyage-code-3',
                inputType: 'document',
            });
        });

        it('should use query inputType when set', async () => {
            mockEmbed.mockResolvedValueOnce(createMockResponse([generateVector(1024)]));

            const embedding = new VoyageAIEmbedding(defaultConfig);
            embedding.setInputType('query');
            await embedding.embed('Test');

            expect(mockEmbed).toHaveBeenCalledWith({
                input: 'Test',
                model: 'voyage-code-3',
                inputType: 'query',
            });
        });

        it('should throw error on invalid API response', async () => {
            mockEmbed.mockResolvedValueOnce({ data: null });

            const embedding = new VoyageAIEmbedding(defaultConfig);

            await expect(embedding.embed('Test')).rejects.toThrow(
                'VoyageAI API returned invalid response'
            );
        });

        it('should throw error on empty data array', async () => {
            mockEmbed.mockResolvedValueOnce({ data: [] });

            const embedding = new VoyageAIEmbedding(defaultConfig);

            await expect(embedding.embed('Test')).rejects.toThrow(
                'VoyageAI API returned invalid response'
            );
        });

        it('should throw error on missing embedding in data', async () => {
            mockEmbed.mockResolvedValueOnce({ data: [{}] });

            const embedding = new VoyageAIEmbedding(defaultConfig);

            await expect(embedding.embed('Test')).rejects.toThrow(
                'VoyageAI API returned invalid response'
            );
        });
    });

    describe('embedBatch', () => {
        it('should generate embeddings for multiple texts', async () => {
            const mockVectors = [generateVector(1024), generateVector(1024), generateVector(1024)];
            mockEmbed.mockResolvedValueOnce(createMockResponse(mockVectors));

            const embedding = new VoyageAIEmbedding(defaultConfig);
            const results = await embedding.embedBatch(['Text 1', 'Text 2', 'Text 3']);

            expect(results).toHaveLength(3);
            expect(results[0].vector).toEqual(mockVectors[0]);
            expect(results[1].vector).toEqual(mockVectors[1]);
            expect(results[2].vector).toEqual(mockVectors[2]);
        });

        it('should call API with array of texts', async () => {
            mockEmbed.mockResolvedValueOnce(createMockResponse([generateVector(1024), generateVector(1024)]));

            const embedding = new VoyageAIEmbedding(defaultConfig);
            await embedding.embedBatch(['Hello', 'World']);

            expect(mockEmbed).toHaveBeenCalledWith({
                input: ['Hello', 'World'],
                model: 'voyage-code-3',
                inputType: 'document',
            });
        });

        it('should preprocess empty strings in batch', async () => {
            mockEmbed.mockResolvedValueOnce(
                createMockResponse([generateVector(1024), generateVector(1024), generateVector(1024)])
            );

            const embedding = new VoyageAIEmbedding(defaultConfig);
            await embedding.embedBatch(['Text', '', 'More']);

            expect(mockEmbed).toHaveBeenCalledWith({
                input: ['Text', ' ', 'More'],
                model: 'voyage-code-3',
                inputType: 'document',
            });
        });

        it('should handle single item batch', async () => {
            mockEmbed.mockResolvedValueOnce(createMockResponse([generateVector(1024)]));

            const embedding = new VoyageAIEmbedding(defaultConfig);
            const results = await embedding.embedBatch(['Single text']);

            expect(results).toHaveLength(1);
            expect(results[0].dimension).toBe(1024);
        });

        it('should throw error on invalid API response', async () => {
            mockEmbed.mockResolvedValueOnce({ data: null });

            const embedding = new VoyageAIEmbedding(defaultConfig);

            await expect(embedding.embedBatch(['Test'])).rejects.toThrow(
                'VoyageAI API returned invalid response'
            );
        });

        it('should throw error on missing embedding in batch', async () => {
            mockEmbed.mockResolvedValueOnce({
                data: [{ embedding: [0.1, 0.2] }, {}],
            });

            const embedding = new VoyageAIEmbedding(defaultConfig);

            await expect(embedding.embedBatch(['Text1', 'Text2'])).rejects.toThrow(
                'VoyageAI API returned invalid embedding data'
            );
        });
    });

    describe('setModel', () => {
        it('should update model and dimension', () => {
            const embedding = new VoyageAIEmbedding(defaultConfig);
            expect(embedding.getDimension()).toBe(1024);

            embedding.setModel('voyage-large-2');
            expect(embedding.getDimension()).toBe(1536);
        });

        it('should update model to voyage-3-lite', () => {
            const embedding = new VoyageAIEmbedding(defaultConfig);
            embedding.setModel('voyage-3-lite');
            expect(embedding.getDimension()).toBe(512);
        });

        it('should use default dimension for unknown model', () => {
            const embedding = new VoyageAIEmbedding(defaultConfig);
            embedding.setModel('unknown-new-model');
            expect(embedding.getDimension()).toBe(1024);
        });

        it('should correctly use new model in subsequent embed calls', async () => {
            mockEmbed
                .mockResolvedValueOnce(createMockResponse([generateVector(1024)]))
                .mockResolvedValueOnce(createMockResponse([generateVector(1536)]));

            const embedding = new VoyageAIEmbedding({
                model: 'voyage-code-3',
                apiKey: 'test-key',
            });

            await embedding.embed('Test 1');
            expect(mockEmbed).toHaveBeenNthCalledWith(1,
                expect.objectContaining({ model: 'voyage-code-3' })
            );

            embedding.setModel('voyage-large-2');

            await embedding.embed('Test 2');
            expect(mockEmbed).toHaveBeenNthCalledWith(2,
                expect.objectContaining({ model: 'voyage-large-2' })
            );
        });
    });

    describe('setInputType', () => {
        it('should update inputType to query', async () => {
            mockEmbed.mockResolvedValue(createMockResponse([generateVector(1024)]));

            const embedding = new VoyageAIEmbedding(defaultConfig);
            embedding.setInputType('query');

            await embedding.embed('Search query');

            expect(mockEmbed).toHaveBeenCalledWith(
                expect.objectContaining({ inputType: 'query' })
            );
        });

        it('should update inputType to document', async () => {
            mockEmbed.mockResolvedValue(createMockResponse([generateVector(1024)]));

            const embedding = new VoyageAIEmbedding(defaultConfig);
            embedding.setInputType('query');
            embedding.setInputType('document');

            await embedding.embed('Document text');

            expect(mockEmbed).toHaveBeenCalledWith(
                expect.objectContaining({ inputType: 'document' })
            );
        });

        it('should affect embedBatch as well', async () => {
            mockEmbed.mockResolvedValue(createMockResponse([generateVector(1024), generateVector(1024)]));

            const embedding = new VoyageAIEmbedding(defaultConfig);
            embedding.setInputType('query');

            await embedding.embedBatch(['Query 1', 'Query 2']);

            expect(mockEmbed).toHaveBeenCalledWith(
                expect.objectContaining({ inputType: 'query' })
            );
        });
    });

    describe('text preprocessing integration', () => {
        it('should truncate very long texts', async () => {
            mockEmbed.mockResolvedValue(createMockResponse([generateVector(1024)]));

            const embedding = new VoyageAIEmbedding(defaultConfig);
            // maxTokens is 32000 for voyage-code-3, so max chars is 32000 * 4 = 128000
            const longText = 'a'.repeat(150000);

            await embedding.embed(longText);

            const calledWith = mockEmbed.mock.calls[0][0];
            expect(calledWith.input.length).toBe(128000);
        });

        it('should preserve text under max length', async () => {
            mockEmbed.mockResolvedValue(createMockResponse([generateVector(1024)]));

            const embedding = new VoyageAIEmbedding(defaultConfig);
            const shortText = 'Hello, world!';

            await embedding.embed(shortText);

            const calledWith = mockEmbed.mock.calls[0][0];
            expect(calledWith.input).toBe(shortText);
        });

        it('should handle unicode characters', async () => {
            mockEmbed.mockResolvedValue(createMockResponse([generateVector(1024)]));

            const embedding = new VoyageAIEmbedding(defaultConfig);
            const unicodeText = 'Hello World 🌍';

            await embedding.embed(unicodeText);

            const calledWith = mockEmbed.mock.calls[0][0];
            expect(calledWith.input).toBe(unicodeText);
        });
    });

    describe('context length handling', () => {
        it('should set correct maxTokens for voyage-law-2 (16000)', async () => {
            mockEmbed.mockResolvedValue(createMockResponse([generateVector(1024)]));

            const embedding = new VoyageAIEmbedding({
                model: 'voyage-law-2',
                apiKey: 'test-key',
            });
            // maxTokens is 16000, so max chars is 16000 * 4 = 64000
            const longText = 'a'.repeat(70000);

            await embedding.embed(longText);

            const calledWith = mockEmbed.mock.calls[0][0];
            expect(calledWith.input.length).toBe(64000);
        });

        it('should set correct maxTokens for voyage-2 (4000)', async () => {
            mockEmbed.mockResolvedValue(createMockResponse([generateVector(1024)]));

            const embedding = new VoyageAIEmbedding({
                model: 'voyage-2',
                apiKey: 'test-key',
            });
            // maxTokens is 4000, so max chars is 4000 * 4 = 16000
            const longText = 'a'.repeat(20000);

            await embedding.embed(longText);

            const calledWith = mockEmbed.mock.calls[0][0];
            expect(calledWith.input.length).toBe(16000);
        });
    });

    describe('model-specific behavior', () => {
        it('should work with voyage-4 series', async () => {
            mockEmbed.mockResolvedValue(createMockResponse([generateVector(1024)]));

            const embedding = new VoyageAIEmbedding({
                model: 'voyage-4',
                apiKey: 'test-key',
            });

            await embedding.embed('Test');

            expect(mockEmbed).toHaveBeenCalledWith(
                expect.objectContaining({ model: 'voyage-4' })
            );
            expect(embedding.getDimension()).toBe(1024);
        });

        it('should work with voyage-4-lite', async () => {
            mockEmbed.mockResolvedValue(createMockResponse([generateVector(1024)]));

            const embedding = new VoyageAIEmbedding({
                model: 'voyage-4-lite',
                apiKey: 'test-key',
            });

            await embedding.embed('Test');

            expect(mockEmbed).toHaveBeenCalledWith(
                expect.objectContaining({ model: 'voyage-4-lite' })
            );
        });

        it('should work with domain-specific models', async () => {
            mockEmbed.mockResolvedValue(createMockResponse([generateVector(1024)]));

            const embedding = new VoyageAIEmbedding({
                model: 'voyage-finance-2',
                apiKey: 'test-key',
            });

            await embedding.embed('Financial document');

            expect(mockEmbed).toHaveBeenCalledWith(
                expect.objectContaining({ model: 'voyage-finance-2' })
            );
            expect(embedding.getDimension()).toBe(1024);
        });
    });

    describe('dimension setting by model', () => {
        it('should set dimension 1024 for voyage-finance-2', () => {
            const embedding = new VoyageAIEmbedding({ model: 'voyage-finance-2', apiKey: 'test-key' });
            expect(embedding.getDimension()).toBe(1024);
        });

        it('should set dimension 1024 for voyage-law-2', () => {
            const embedding = new VoyageAIEmbedding({ model: 'voyage-law-2', apiKey: 'test-key' });
            expect(embedding.getDimension()).toBe(1024);
        });

        it('should set dimension 1024 for voyage-multilingual-2', () => {
            const embedding = new VoyageAIEmbedding({ model: 'voyage-multilingual-2', apiKey: 'test-key' });
            expect(embedding.getDimension()).toBe(1024);
        });

        it('should set dimension 1536 for voyage-large-2', () => {
            const embedding = new VoyageAIEmbedding({ model: 'voyage-large-2', apiKey: 'test-key' });
            expect(embedding.getDimension()).toBe(1536);
        });

        it('should set dimension 1536 for voyage-code-2', () => {
            const embedding = new VoyageAIEmbedding({ model: 'voyage-code-2', apiKey: 'test-key' });
            expect(embedding.getDimension()).toBe(1536);
        });

        it('should set dimension 1024 for voyage-3', () => {
            const embedding = new VoyageAIEmbedding({ model: 'voyage-3', apiKey: 'test-key' });
            expect(embedding.getDimension()).toBe(1024);
        });

        it('should set dimension 512 for voyage-3-lite', () => {
            const embedding = new VoyageAIEmbedding({ model: 'voyage-3-lite', apiKey: 'test-key' });
            expect(embedding.getDimension()).toBe(512);
        });

        it('should set dimension 1024 for voyage-2', () => {
            const embedding = new VoyageAIEmbedding({ model: 'voyage-2', apiKey: 'test-key' });
            expect(embedding.getDimension()).toBe(1024);
        });
    });
});

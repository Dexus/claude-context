import { GeminiEmbedding, GeminiEmbeddingConfig } from '../../embedding/gemini-embedding';

// Create mock function at module level
const mockEmbedContent = jest.fn();
const mockGoogleGenAIConstructor = jest.fn();

// Mock the @google/genai module
jest.mock('@google/genai', () => {
    return {
        GoogleGenAI: function MockGoogleGenAI(config: { apiKey: string }) {
            mockGoogleGenAIConstructor(config);
            return {
                models: {
                    embedContent: mockEmbedContent,
                },
            };
        },
    };
});

describe('GeminiEmbedding', () => {
    const defaultConfig: GeminiEmbeddingConfig = {
        model: 'gemini-embedding-001',
        apiKey: 'test-api-key',
    };

    // Helper to create a mock embedding response
    const createMockResponse = (embeddings: number[][]) => ({
        embeddings: embeddings.map((values) => ({
            values,
        })),
    });

    // Helper to generate a vector of specific dimension
    const generateVector = (dimension: number): number[] => {
        return Array.from({ length: dimension }, (_, i) => i / dimension);
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockEmbedContent.mockReset();
        mockGoogleGenAIConstructor.mockReset();
    });

    describe('constructor', () => {
        it('should create instance with required config', () => {
            const embedding = new GeminiEmbedding(defaultConfig);
            expect(embedding).toBeInstanceOf(GeminiEmbedding);
        });

        it('should create GoogleGenAI client with apiKey', () => {
            const config: GeminiEmbeddingConfig = {
                model: 'gemini-embedding-001',
                apiKey: 'my-secret-key',
            };

            new GeminiEmbedding(config);

            expect(mockGoogleGenAIConstructor).toHaveBeenCalledWith({
                apiKey: 'my-secret-key',
            });
        });

        it('should set default dimension for gemini-embedding-001', () => {
            const embedding = new GeminiEmbedding(defaultConfig);
            expect(embedding.getDimension()).toBe(3072);
        });

        it('should use custom outputDimensionality when provided', () => {
            const config: GeminiEmbeddingConfig = {
                model: 'gemini-embedding-001',
                apiKey: 'test-key',
                outputDimensionality: 768,
            };

            const embedding = new GeminiEmbedding(config);
            expect(embedding.getDimension()).toBe(768);
        });

        it('should use default dimension for unknown model', () => {
            const config: GeminiEmbeddingConfig = {
                model: 'unknown-model',
                apiKey: 'test-key',
            };

            const embedding = new GeminiEmbedding(config);
            expect(embedding.getDimension()).toBe(3072); // Default
        });
    });

    describe('getProvider', () => {
        it('should return "Gemini"', () => {
            const embedding = new GeminiEmbedding(defaultConfig);
            expect(embedding.getProvider()).toBe('Gemini');
        });
    });

    describe('getDimension', () => {
        it('should return default dimension of 3072 for gemini-embedding-001', () => {
            const embedding = new GeminiEmbedding(defaultConfig);
            expect(embedding.getDimension()).toBe(3072);
        });

        it('should return custom dimension when set', () => {
            const embedding = new GeminiEmbedding({
                ...defaultConfig,
                outputDimensionality: 1536,
            });
            expect(embedding.getDimension()).toBe(1536);
        });
    });

    describe('getClient', () => {
        it('should return the GoogleGenAI client instance', () => {
            const embedding = new GeminiEmbedding(defaultConfig);
            const client = embedding.getClient();
            expect(client).toBeDefined();
            expect(client.models).toBeDefined();
            expect(client.models.embedContent).toBeDefined();
        });
    });

    describe('getSupportedModels', () => {
        it('should return list of supported models', () => {
            const models = GeminiEmbedding.getSupportedModels();
            expect(models).toHaveProperty('gemini-embedding-001');
        });

        it('should return correct dimensions for gemini-embedding-001', () => {
            const models = GeminiEmbedding.getSupportedModels();
            expect(models['gemini-embedding-001'].dimension).toBe(3072);
        });

        it('should include descriptions for all models', () => {
            const models = GeminiEmbedding.getSupportedModels();
            for (const modelName of Object.keys(models)) {
                expect(models[modelName].description).toBeDefined();
                expect(typeof models[modelName].description).toBe('string');
                expect(models[modelName].description.length).toBeGreaterThan(0);
            }
        });

        it('should include supportedDimensions for gemini-embedding-001', () => {
            const models = GeminiEmbedding.getSupportedModels();
            // Check that supportedDimensions exists and contains expected values
            expect(models['gemini-embedding-001'].supportedDimensions).toBeDefined();
            expect(models['gemini-embedding-001'].supportedDimensions).toContain(3072);
        });
    });

    describe('getSupportedDimensions', () => {
        it('should return supported dimensions for known model', () => {
            const embedding = new GeminiEmbedding(defaultConfig);
            const dimensions = embedding.getSupportedDimensions();
            expect(dimensions).toContain(3072);
            expect(Array.isArray(dimensions)).toBe(true);
        });

        it('should return current dimension array for unknown model', () => {
            const embedding = new GeminiEmbedding({
                model: 'unknown-model',
                apiKey: 'test-key',
            });
            const dimensions = embedding.getSupportedDimensions();
            expect(dimensions).toContain(3072); // Default dimension
        });
    });

    describe('isDimensionSupported', () => {
        it('should return true for supported dimension', () => {
            const embedding = new GeminiEmbedding(defaultConfig);
            // Test that at least the default dimension is supported
            expect(embedding.isDimensionSupported(3072)).toBe(true);
        });

        it('should return false for clearly unsupported dimension', () => {
            const embedding = new GeminiEmbedding(defaultConfig);
            // Test an unusual dimension that is unlikely to be supported
            expect(embedding.isDimensionSupported(999)).toBe(false);
        });
    });

    describe('detectDimension', () => {
        it('should return configured dimension without API call', async () => {
            const embedding = new GeminiEmbedding(defaultConfig);
            const dimension = await embedding.detectDimension();

            expect(dimension).toBe(3072);
            expect(mockEmbedContent).not.toHaveBeenCalled();
        });

        it('should return custom dimension when set', async () => {
            const embedding = new GeminiEmbedding({
                ...defaultConfig,
                outputDimensionality: 768,
            });
            const dimension = await embedding.detectDimension();

            expect(dimension).toBe(768);
        });
    });

    describe('embed', () => {
        it('should generate embedding for text', async () => {
            const mockVector = generateVector(3072);
            mockEmbedContent.mockResolvedValueOnce(createMockResponse([mockVector]));

            const embedding = new GeminiEmbedding(defaultConfig);
            const result = await embedding.embed('Hello, world!');

            expect(result.vector).toEqual(mockVector);
            expect(result.dimension).toBe(mockVector.length);
        });

        it('should call API with correct parameters', async () => {
            mockEmbedContent.mockResolvedValueOnce(createMockResponse([generateVector(3072)]));

            const embedding = new GeminiEmbedding(defaultConfig);
            await embedding.embed('Test text');

            expect(mockEmbedContent).toHaveBeenCalledWith({
                model: 'gemini-embedding-001',
                contents: 'Test text',
                config: {
                    outputDimensionality: 3072,
                },
            });
        });

        it('should use custom outputDimensionality in API call', async () => {
            mockEmbedContent.mockResolvedValueOnce(createMockResponse([generateVector(768)]));

            const embedding = new GeminiEmbedding({
                ...defaultConfig,
                outputDimensionality: 768,
            });
            await embedding.embed('Test');

            expect(mockEmbedContent).toHaveBeenCalledWith({
                model: 'gemini-embedding-001',
                contents: 'Test',
                config: {
                    outputDimensionality: 768,
                },
            });
        });

        it('should preprocess empty string to space', async () => {
            mockEmbedContent.mockResolvedValueOnce(createMockResponse([generateVector(3072)]));

            const embedding = new GeminiEmbedding(defaultConfig);
            await embedding.embed('');

            expect(mockEmbedContent).toHaveBeenCalledWith({
                model: 'gemini-embedding-001',
                contents: ' ',
                config: {
                    outputDimensionality: 3072,
                },
            });
        });

        it('should throw error on invalid API response', async () => {
            mockEmbedContent.mockResolvedValueOnce({ embeddings: null });

            const embedding = new GeminiEmbedding(defaultConfig);

            await expect(embedding.embed('Test')).rejects.toThrow(
                'Gemini embedding failed: Gemini API returned invalid response'
            );
        });

        it('should throw error on empty embeddings array', async () => {
            mockEmbedContent.mockResolvedValueOnce({ embeddings: [] });

            const embedding = new GeminiEmbedding(defaultConfig);

            await expect(embedding.embed('Test')).rejects.toThrow(
                'Gemini embedding failed: Gemini API returned invalid response'
            );
        });

        it('should throw error on missing values', async () => {
            mockEmbedContent.mockResolvedValueOnce({ embeddings: [{}] });

            const embedding = new GeminiEmbedding(defaultConfig);

            await expect(embedding.embed('Test')).rejects.toThrow(
                'Gemini embedding failed: Gemini API returned invalid response'
            );
        });

        it('should throw error on API failure', async () => {
            mockEmbedContent.mockRejectedValueOnce(new Error('Rate limit exceeded'));

            const embedding = new GeminiEmbedding(defaultConfig);

            await expect(embedding.embed('Test')).rejects.toThrow(
                'Gemini embedding failed: Rate limit exceeded'
            );
        });

        it('should handle non-Error exceptions', async () => {
            mockEmbedContent.mockRejectedValueOnce('string error');

            const embedding = new GeminiEmbedding(defaultConfig);

            await expect(embedding.embed('Test')).rejects.toThrow(
                'Gemini embedding failed: Unknown error'
            );
        });
    });

    describe('embedBatch', () => {
        it('should generate embeddings for multiple texts', async () => {
            const mockVectors = [generateVector(3072), generateVector(3072), generateVector(3072)];
            mockEmbedContent.mockResolvedValueOnce(createMockResponse(mockVectors));

            const embedding = new GeminiEmbedding(defaultConfig);
            const results = await embedding.embedBatch(['Text 1', 'Text 2', 'Text 3']);

            expect(results).toHaveLength(3);
            expect(results[0].vector).toEqual(mockVectors[0]);
            expect(results[1].vector).toEqual(mockVectors[1]);
            expect(results[2].vector).toEqual(mockVectors[2]);
        });

        it('should call API with array of texts', async () => {
            mockEmbedContent.mockResolvedValueOnce(createMockResponse([generateVector(3072), generateVector(3072)]));

            const embedding = new GeminiEmbedding(defaultConfig);
            await embedding.embedBatch(['Hello', 'World']);

            expect(mockEmbedContent).toHaveBeenCalledWith({
                model: 'gemini-embedding-001',
                contents: ['Hello', 'World'],
                config: {
                    outputDimensionality: 3072,
                },
            });
        });

        it('should preprocess empty strings in batch', async () => {
            mockEmbedContent.mockResolvedValueOnce(
                createMockResponse([generateVector(3072), generateVector(3072), generateVector(3072)])
            );

            const embedding = new GeminiEmbedding(defaultConfig);
            await embedding.embedBatch(['Text', '', 'More']);

            expect(mockEmbedContent).toHaveBeenCalledWith({
                model: 'gemini-embedding-001',
                contents: ['Text', ' ', 'More'],
                config: {
                    outputDimensionality: 3072,
                },
            });
        });

        it('should throw error on invalid API response', async () => {
            mockEmbedContent.mockResolvedValueOnce({ embeddings: null });

            const embedding = new GeminiEmbedding(defaultConfig);

            await expect(embedding.embedBatch(['Test'])).rejects.toThrow(
                'Gemini batch embedding failed: Gemini API returned invalid response'
            );
        });

        it('should throw error on missing values in batch', async () => {
            mockEmbedContent.mockResolvedValueOnce({
                embeddings: [{ values: [0.1, 0.2] }, {}],
            });

            const embedding = new GeminiEmbedding(defaultConfig);

            await expect(embedding.embedBatch(['Text1', 'Text2'])).rejects.toThrow(
                'Gemini batch embedding failed: Gemini API returned invalid embedding data'
            );
        });

        it('should throw error on API failure', async () => {
            mockEmbedContent.mockRejectedValueOnce(new Error('Service unavailable'));

            const embedding = new GeminiEmbedding(defaultConfig);

            await expect(embedding.embedBatch(['Test'])).rejects.toThrow(
                'Gemini batch embedding failed: Service unavailable'
            );
        });

        it('should handle non-Error exceptions', async () => {
            mockEmbedContent.mockRejectedValueOnce(null);

            const embedding = new GeminiEmbedding(defaultConfig);

            await expect(embedding.embedBatch(['Test'])).rejects.toThrow(
                'Gemini batch embedding failed: Unknown error'
            );
        });
    });

    describe('setModel', () => {
        it('should update model', () => {
            const embedding = new GeminiEmbedding(defaultConfig);
            embedding.setModel('gemini-embedding-001');

            // The model should be updated
            expect(embedding.getDimension()).toBe(3072);
        });

        it('should update dimension for known model', () => {
            const embedding = new GeminiEmbedding({
                model: 'unknown-model',
                apiKey: 'test-key',
            });

            embedding.setModel('gemini-embedding-001');
            expect(embedding.getDimension()).toBe(3072);
        });

        it('should use default dimension for unknown model', () => {
            const embedding = new GeminiEmbedding(defaultConfig);
            embedding.setModel('another-unknown-model');

            expect(embedding.getDimension()).toBe(3072); // Default
        });
    });

    describe('setOutputDimensionality', () => {
        it('should update output dimension', () => {
            const embedding = new GeminiEmbedding(defaultConfig);
            embedding.setOutputDimensionality(768);

            expect(embedding.getDimension()).toBe(768);
        });

        it('should use new dimension in subsequent embed calls', async () => {
            mockEmbedContent.mockResolvedValueOnce(createMockResponse([generateVector(256)]));

            const embedding = new GeminiEmbedding({
                model: 'gemini-embedding-001',
                apiKey: 'test-key',
            });
            embedding.setOutputDimensionality(256);

            await embedding.embed('Test');

            expect(mockEmbedContent).toHaveBeenLastCalledWith({
                model: 'gemini-embedding-001',
                contents: 'Test',
                config: {
                    outputDimensionality: 256,
                },
            });
        });
    });

    describe('text preprocessing integration', () => {
        it('should truncate very long texts', async () => {
            mockEmbedContent.mockResolvedValue(createMockResponse([generateVector(3072)]));

            const embedding = new GeminiEmbedding(defaultConfig);
            // maxTokens is 2048, so max chars is 2048 * 4 = 8192
            const longText = 'a'.repeat(10000);

            await embedding.embed(longText);

            const calledWith = mockEmbedContent.mock.calls[0][0];
            expect(calledWith.contents.length).toBe(8192);
        });

        it('should preserve text under max length', async () => {
            mockEmbedContent.mockResolvedValue(createMockResponse([generateVector(3072)]));

            const embedding = new GeminiEmbedding(defaultConfig);
            const shortText = 'Hello, world!';

            await embedding.embed(shortText);

            const calledWith = mockEmbedContent.mock.calls[0][0];
            expect(calledWith.contents).toBe(shortText);
        });
    });
});

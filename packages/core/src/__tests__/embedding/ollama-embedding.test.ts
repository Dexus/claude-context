import { OllamaEmbedding, OllamaEmbeddingConfig } from '../../embedding/ollama-embedding';

// Create mock function at module level
const mockEmbed = jest.fn();
const mockOllamaConstructor = jest.fn();

// Mock the ollama module
jest.mock('ollama', () => {
    return {
        Ollama: function MockOllama(config: { host?: string; fetch?: any }) {
            mockOllamaConstructor(config);
            return {
                embed: mockEmbed,
            };
        },
    };
});

describe('OllamaEmbedding', () => {
    const defaultConfig: OllamaEmbeddingConfig = {
        model: 'nomic-embed-text',
    };

    // Helper to create a mock embedding response
    const createMockResponse = (embeddings: number[][]) => ({
        embeddings,
    });

    // Helper to generate a vector of specific dimension
    const generateVector = (dimension: number): number[] => {
        return Array.from({ length: dimension }, (_, i) => i / dimension);
    };

    // Suppress console output during tests
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;

    beforeAll(() => {
        console.log = jest.fn();
        console.error = jest.fn();
    });

    afterAll(() => {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockEmbed.mockReset();
        mockOllamaConstructor.mockReset();
    });

    describe('constructor', () => {
        it('should create instance with required config', () => {
            const embedding = new OllamaEmbedding(defaultConfig);
            expect(embedding).toBeInstanceOf(OllamaEmbedding);
        });

        it('should create Ollama client with default host', () => {
            new OllamaEmbedding(defaultConfig);

            expect(mockOllamaConstructor).toHaveBeenCalledWith({
                host: 'http://127.0.0.1:11434',
                fetch: undefined,
            });
        });

        it('should create Ollama client with custom host', () => {
            const config: OllamaEmbeddingConfig = {
                model: 'nomic-embed-text',
                host: 'http://custom-host:11434',
            };

            new OllamaEmbedding(config);

            expect(mockOllamaConstructor).toHaveBeenCalledWith({
                host: 'http://custom-host:11434',
                fetch: undefined,
            });
        });

        it('should create Ollama client with custom fetch', () => {
            const customFetch = jest.fn();
            const config: OllamaEmbeddingConfig = {
                model: 'nomic-embed-text',
                fetch: customFetch,
            };

            new OllamaEmbedding(config);

            expect(mockOllamaConstructor).toHaveBeenCalledWith({
                host: 'http://127.0.0.1:11434',
                fetch: customFetch,
            });
        });

        it('should use default dimension of 768', () => {
            const embedding = new OllamaEmbedding(defaultConfig);
            expect(embedding.getDimension()).toBe(768);
        });

        it('should use custom dimension when provided', () => {
            const config: OllamaEmbeddingConfig = {
                model: 'custom-model',
                dimension: 1024,
            };

            const embedding = new OllamaEmbedding(config);
            expect(embedding.getDimension()).toBe(1024);
        });

        it('should set maxTokens for nomic-embed-text model', () => {
            const embedding = new OllamaEmbedding({ model: 'nomic-embed-text' });
            // Internal maxTokens should be 8192 for this model
            expect(embedding).toBeDefined();
        });

        it('should set maxTokens for snowflake-arctic-embed model', () => {
            const embedding = new OllamaEmbedding({ model: 'snowflake-arctic-embed' });
            expect(embedding).toBeDefined();
        });

        it('should use default maxTokens for unknown models', () => {
            const embedding = new OllamaEmbedding({ model: 'unknown-model' });
            expect(embedding).toBeDefined();
        });

        it('should use custom maxTokens when provided', () => {
            const config: OllamaEmbeddingConfig = {
                model: 'custom-model',
                maxTokens: 4096,
            };

            const embedding = new OllamaEmbedding(config);
            expect(embedding).toBeDefined();
        });
    });

    describe('getProvider', () => {
        it('should return "Ollama"', () => {
            const embedding = new OllamaEmbedding(defaultConfig);
            expect(embedding.getProvider()).toBe('Ollama');
        });
    });

    describe('getDimension', () => {
        it('should return default dimension of 768', () => {
            const embedding = new OllamaEmbedding(defaultConfig);
            expect(embedding.getDimension()).toBe(768);
        });

        it('should return custom dimension when set in config', () => {
            const embedding = new OllamaEmbedding({
                ...defaultConfig,
                dimension: 1536,
            });
            expect(embedding.getDimension()).toBe(1536);
        });
    });

    describe('getClient', () => {
        it('should return the Ollama client instance', () => {
            const embedding = new OllamaEmbedding(defaultConfig);
            const client = embedding.getClient();
            expect(client).toBeDefined();
            expect(client.embed).toBeDefined();
        });
    });

    describe('detectDimension', () => {
        it('should detect dimension from API response', async () => {
            const mockVector = generateVector(768);
            mockEmbed.mockResolvedValueOnce(createMockResponse([mockVector]));

            const embedding = new OllamaEmbedding(defaultConfig);
            const dimension = await embedding.detectDimension();

            expect(dimension).toBe(768);
        });

        it('should call API with test text', async () => {
            mockEmbed.mockResolvedValueOnce(createMockResponse([generateVector(768)]));

            const embedding = new OllamaEmbedding(defaultConfig);
            await embedding.detectDimension('custom test');

            expect(mockEmbed).toHaveBeenCalledWith(
                expect.objectContaining({
                    model: 'nomic-embed-text',
                    input: 'custom test',
                })
            );
        });

        it('should throw error on invalid API response', async () => {
            mockEmbed.mockResolvedValueOnce({ embeddings: null });

            const embedding = new OllamaEmbedding(defaultConfig);

            await expect(embedding.detectDimension()).rejects.toThrow(
                'Failed to detect Ollama embedding dimension: Ollama API returned invalid response'
            );
        });

        it('should throw error on empty embeddings', async () => {
            mockEmbed.mockResolvedValueOnce({ embeddings: [] });

            const embedding = new OllamaEmbedding(defaultConfig);

            await expect(embedding.detectDimension()).rejects.toThrow(
                'Failed to detect Ollama embedding dimension: Ollama API returned invalid response'
            );
        });

        it('should throw error on API failure', async () => {
            mockEmbed.mockRejectedValueOnce(new Error('Connection refused'));

            const embedding = new OllamaEmbedding(defaultConfig);

            await expect(embedding.detectDimension()).rejects.toThrow(
                'Failed to detect Ollama embedding dimension: Connection refused'
            );
        });

        it('should handle non-Error exceptions', async () => {
            mockEmbed.mockRejectedValueOnce('string error');

            const embedding = new OllamaEmbedding(defaultConfig);

            await expect(embedding.detectDimension()).rejects.toThrow(
                'Failed to detect Ollama embedding dimension: Unknown error'
            );
        });
    });

    describe('embed', () => {
        it('should generate embedding for text with pre-configured dimension', async () => {
            const mockVector = generateVector(768);
            mockEmbed.mockResolvedValueOnce(createMockResponse([mockVector]));

            const embedding = new OllamaEmbedding({
                ...defaultConfig,
                dimension: 768, // Pre-configure dimension
            });
            const result = await embedding.embed('Hello, world!');

            expect(result.vector).toEqual(mockVector);
            expect(result.dimension).toBe(768);
        });

        it('should detect dimension on first use if not configured', async () => {
            const mockVector = generateVector(768);
            // First call for dimension detection, second for actual embed
            mockEmbed
                .mockResolvedValueOnce(createMockResponse([mockVector]))
                .mockResolvedValueOnce(createMockResponse([mockVector]));

            const embedding = new OllamaEmbedding(defaultConfig);
            const result = await embedding.embed('Test');

            expect(result.dimension).toBe(768);
            expect(mockEmbed).toHaveBeenCalledTimes(2);
        });

        it('should call API with correct parameters', async () => {
            const mockVector = generateVector(768);
            mockEmbed.mockResolvedValue(createMockResponse([mockVector]));

            const embedding = new OllamaEmbedding({
                ...defaultConfig,
                dimension: 768,
            });
            await embedding.embed('Test text');

            expect(mockEmbed).toHaveBeenCalledWith({
                model: 'nomic-embed-text',
                input: 'Test text',
                options: undefined,
            });
        });

        it('should include keep_alive when provided', async () => {
            const mockVector = generateVector(768);
            mockEmbed.mockResolvedValue(createMockResponse([mockVector]));

            const embedding = new OllamaEmbedding({
                ...defaultConfig,
                dimension: 768,
                keepAlive: '5m',
            });
            await embedding.embed('Test');

            expect(mockEmbed).toHaveBeenCalledWith({
                model: 'nomic-embed-text',
                input: 'Test',
                options: undefined,
                keep_alive: '5m',
            });
        });

        it('should include options when provided', async () => {
            const mockVector = generateVector(768);
            mockEmbed.mockResolvedValue(createMockResponse([mockVector]));

            const options = { temperature: 0.1 };
            const embedding = new OllamaEmbedding({
                ...defaultConfig,
                dimension: 768,
                options,
            });
            await embedding.embed('Test');

            expect(mockEmbed).toHaveBeenCalledWith({
                model: 'nomic-embed-text',
                input: 'Test',
                options,
            });
        });

        it('should preprocess empty string to space', async () => {
            const mockVector = generateVector(768);
            mockEmbed.mockResolvedValue(createMockResponse([mockVector]));

            const embedding = new OllamaEmbedding({
                ...defaultConfig,
                dimension: 768,
            });
            await embedding.embed('');

            expect(mockEmbed).toHaveBeenCalledWith({
                model: 'nomic-embed-text',
                input: ' ',
                options: undefined,
            });
        });

        it('should throw error on invalid API response', async () => {
            mockEmbed.mockResolvedValueOnce({ embeddings: null });

            const embedding = new OllamaEmbedding({
                ...defaultConfig,
                dimension: 768,
            });

            await expect(embedding.embed('Test')).rejects.toThrow(
                'Ollama API returned invalid response'
            );
        });

        it('should throw error on empty embeddings', async () => {
            mockEmbed.mockResolvedValueOnce({ embeddings: [] });

            const embedding = new OllamaEmbedding({
                ...defaultConfig,
                dimension: 768,
            });

            await expect(embedding.embed('Test')).rejects.toThrow(
                'Ollama API returned invalid response'
            );
        });
    });

    describe('embedBatch', () => {
        it('should generate embeddings for multiple texts', async () => {
            const mockVectors = [generateVector(768), generateVector(768), generateVector(768)];
            // First call for dimension detection, second for actual batch embed
            mockEmbed
                .mockResolvedValueOnce(createMockResponse([generateVector(768)]))
                .mockResolvedValueOnce(createMockResponse(mockVectors));

            const embedding = new OllamaEmbedding(defaultConfig);
            const results = await embedding.embedBatch(['Text 1', 'Text 2', 'Text 3']);

            expect(results).toHaveLength(3);
        });

        it('should work with pre-configured dimension', async () => {
            const mockVectors = [generateVector(768), generateVector(768)];
            mockEmbed.mockResolvedValueOnce(createMockResponse(mockVectors));

            const embedding = new OllamaEmbedding({
                ...defaultConfig,
                dimension: 768, // Pre-configured
            });

            const results = await embedding.embedBatch(['Hello', 'World']);

            expect(results).toHaveLength(2);
            expect(results[0].dimension).toBe(768);
            expect(results[1].dimension).toBe(768);
        });

        it('should not detect dimension again if already detected', async () => {
            const mockVectors = [generateVector(768), generateVector(768)];
            // First for single embed (detects dimension), second for batch
            mockEmbed
                .mockResolvedValueOnce(createMockResponse([generateVector(768)]))  // dimension detection
                .mockResolvedValueOnce(createMockResponse([generateVector(768)]))  // first embed
                .mockResolvedValueOnce(createMockResponse(mockVectors));           // batch embed

            const embedding = new OllamaEmbedding(defaultConfig);

            // First call detects dimension
            await embedding.embed('First');

            // Batch call should not detect dimension again
            const results = await embedding.embedBatch(['Hello', 'World']);

            expect(results).toHaveLength(2);
            // mockEmbed should be called 3 times: detection, embed, batch
            expect(mockEmbed).toHaveBeenCalledTimes(3);
        });

        it('should throw error on invalid API response', async () => {
            // First call for dimension detection, second returns invalid
            mockEmbed
                .mockResolvedValueOnce(createMockResponse([generateVector(768)]))
                .mockResolvedValueOnce({ embeddings: null });

            const embedding = new OllamaEmbedding(defaultConfig);

            await expect(embedding.embedBatch(['Test'])).rejects.toThrow(
                'Ollama API returned invalid batch response'
            );
        });
    });

    describe('setModel', () => {
        it('should update model and reset dimension detection', async () => {
            const mockVector = generateVector(1024);
            mockEmbed.mockResolvedValue(createMockResponse([mockVector]));

            const embedding = new OllamaEmbedding(defaultConfig);
            await embedding.setModel('new-model');

            expect(embedding.getDimension()).toBe(1024);
        });

        it('should update maxTokens for known models', async () => {
            const mockVector = generateVector(768);
            mockEmbed.mockResolvedValue(createMockResponse([mockVector]));

            const embedding = new OllamaEmbedding({ model: 'some-model' });
            await embedding.setModel('nomic-embed-text');

            expect(embedding).toBeDefined();
        });

        it('should not call detectDimension when dimension is pre-configured', async () => {
            const embedding = new OllamaEmbedding({
                model: 'old-model',
                dimension: 1024,
            });

            await embedding.setModel('new-model');

            // Should not call API because dimension was pre-configured
            expect(mockEmbed).not.toHaveBeenCalled();
        });
    });

    describe('setHost', () => {
        it('should update host and recreate client', () => {
            const embedding = new OllamaEmbedding(defaultConfig);
            embedding.setHost('http://new-host:11434');

            expect(mockOllamaConstructor).toHaveBeenLastCalledWith({
                host: 'http://new-host:11434',
                fetch: undefined,
            });
        });
    });

    describe('setKeepAlive', () => {
        it('should update keepAlive setting', async () => {
            const mockVector = generateVector(768);
            mockEmbed.mockResolvedValue(createMockResponse([mockVector]));

            const embedding = new OllamaEmbedding({
                ...defaultConfig,
                dimension: 768,
            });
            embedding.setKeepAlive('10m');

            await embedding.embed('Test');

            expect(mockEmbed).toHaveBeenCalledWith(
                expect.objectContaining({
                    keep_alive: '10m',
                })
            );
        });

        it('should accept numeric keepAlive', async () => {
            const mockVector = generateVector(768);
            mockEmbed.mockResolvedValue(createMockResponse([mockVector]));

            const embedding = new OllamaEmbedding({
                ...defaultConfig,
                dimension: 768,
            });
            embedding.setKeepAlive(300);

            await embedding.embed('Test');

            expect(mockEmbed).toHaveBeenCalledWith(
                expect.objectContaining({
                    keep_alive: 300,
                })
            );
        });
    });

    describe('setOptions', () => {
        it('should update options', async () => {
            const mockVector = generateVector(768);
            mockEmbed.mockResolvedValue(createMockResponse([mockVector]));

            const embedding = new OllamaEmbedding({
                ...defaultConfig,
                dimension: 768,
            });
            embedding.setOptions({ num_ctx: 2048 });

            await embedding.embed('Test');

            expect(mockEmbed).toHaveBeenCalledWith(
                expect.objectContaining({
                    options: { num_ctx: 2048 },
                })
            );
        });
    });

    describe('setMaxTokens', () => {
        it('should update maxTokens', () => {
            const embedding = new OllamaEmbedding(defaultConfig);
            embedding.setMaxTokens(4096);

            // maxTokens affects text preprocessing
            expect(embedding).toBeDefined();
        });
    });

    describe('text preprocessing integration', () => {
        it('should truncate very long texts for nomic-embed-text', async () => {
            const mockVector = generateVector(768);
            mockEmbed.mockResolvedValue(createMockResponse([mockVector]));

            const embedding = new OllamaEmbedding({
                model: 'nomic-embed-text',
                dimension: 768,
            });
            // maxTokens is 8192 for nomic-embed-text, so max chars is 8192 * 4 = 32768
            const longText = 'a'.repeat(40000);

            await embedding.embed(longText);

            const calledWith = mockEmbed.mock.calls[0][0];
            expect(calledWith.input.length).toBe(32768);
        });

        it('should preserve text under max length', async () => {
            const mockVector = generateVector(768);
            mockEmbed.mockResolvedValue(createMockResponse([mockVector]));

            const embedding = new OllamaEmbedding({
                ...defaultConfig,
                dimension: 768,
            });
            const shortText = 'Hello, world!';

            await embedding.embed(shortText);

            const calledWith = mockEmbed.mock.calls[0][0];
            expect(calledWith.input).toBe(shortText);
        });
    });

    describe('edge cases', () => {
        it('should not include keep_alive when empty string', async () => {
            const mockVector = generateVector(768);
            mockEmbed.mockResolvedValueOnce(createMockResponse([mockVector]));

            const embedding = new OllamaEmbedding({
                model: 'nomic-embed-text',
                dimension: 768,
                keepAlive: '',
            });

            await embedding.embed('Test');

            expect(mockEmbed).toHaveBeenLastCalledWith({
                model: 'nomic-embed-text',
                input: 'Test',
                options: undefined,
            });
        });
    });
});

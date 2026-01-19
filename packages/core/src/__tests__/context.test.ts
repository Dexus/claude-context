import {
    VectorDatabase,
    VectorDocument,
    VectorSearchResult,
    HybridSearchRequest,
    HybridSearchOptions,
    HybridSearchResult
} from '../vectordb/types';
import { Splitter, CodeChunk } from '../splitter';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock langchain-splitter before any imports that use it
jest.mock('../splitter/langchain-splitter', () => ({
    LangChainCodeSplitter: class MockLangChainCodeSplitter {
        private chunkSize: number = 1000;
        private chunkOverlap: number = 200;

        constructor(chunkSize?: number, chunkOverlap?: number) {
            if (chunkSize) this.chunkSize = chunkSize;
            if (chunkOverlap) this.chunkOverlap = chunkOverlap;
        }

        async split(code: string, language: string, filePath?: string): Promise<CodeChunk[]> {
            const lines = code.split('\n');
            return [{
                content: code,
                metadata: {
                    startLine: 1,
                    endLine: lines.length,
                    language,
                    filePath,
                }
            }];
        }

        setChunkSize(chunkSize: number): void {
            this.chunkSize = chunkSize;
        }

        setChunkOverlap(chunkOverlap: number): void {
            this.chunkOverlap = chunkOverlap;
        }
    }
}));

// Mock OpenAI embedding to avoid API calls
jest.mock('../embedding/openai-embedding', () => ({
    OpenAIEmbedding: class MockOpenAIEmbedding {
        async embed(text: string) {
            return { vector: Array(1536).fill(0.1), dimension: 1536 };
        }
        async embedBatch(texts: string[]) {
            return texts.map(() => ({ vector: Array(1536).fill(0.1), dimension: 1536 }));
        }
        getDimension() { return 1536; }
        getProvider() { return 'MockOpenAI'; }
        async detectDimension() { return 1536; }
    }
}));

// Mock the ast-splitter module to add the getSupportedLanguages static method
jest.mock('../splitter/ast-splitter', () => {
    const actual = jest.requireActual('../splitter/ast-splitter');
    // Add the getSupportedLanguages static method that's referenced in context.ts
    actual.AstCodeSplitter.getSupportedLanguages = () => ['typescript', 'javascript', 'python', 'java', 'cpp', 'c', 'go', 'rust'];
    return actual;
});

// Mock environment manager
jest.mock('../utils/env-manager', () => ({
    envManager: {
        get: jest.fn((key: string) => {
            const envMap: Record<string, string> = {
                'OPENAI_API_KEY': 'test-api-key',
                'HYBRID_MODE': 'true',
                'EMBEDDING_BATCH_SIZE': '10'
            };
            return envMap[key];
        })
    }
}));

// Mock FileSynchronizer
jest.mock('../sync/synchronizer', () => {
    const MockFileSynchronizer = jest.fn().mockImplementation(() => ({
        initialize: jest.fn().mockResolvedValue(undefined),
        checkForChanges: jest.fn().mockResolvedValue({ added: [], removed: [], modified: [] })
    }));
    (MockFileSynchronizer as any).deleteSnapshot = jest.fn().mockResolvedValue(undefined);
    return {
        FileSynchronizer: MockFileSynchronizer
    };
});

// Import Context after all mocks are set up
import { Context, ContextConfig } from '../context';
import { Embedding, EmbeddingVector } from '../embedding/base-embedding';
import { FileSynchronizer } from '../sync/synchronizer';

// Helper to create a mock Embedding instance
function createMockEmbedding(): jest.Mocked<Embedding> {
    return {
        embed: jest.fn().mockResolvedValue({ vector: Array(1536).fill(0.1), dimension: 1536 }),
        embedBatch: jest.fn().mockResolvedValue([{ vector: Array(1536).fill(0.1), dimension: 1536 }]),
        getDimension: jest.fn().mockReturnValue(1536),
        getProvider: jest.fn().mockReturnValue('MockProvider'),
        detectDimension: jest.fn().mockResolvedValue(1536),
        preprocessText: jest.fn().mockImplementation((text: string) => text),
        preprocessTexts: jest.fn().mockImplementation((texts: string[]) => texts)
    } as unknown as jest.Mocked<Embedding>;
}

// Helper to create a mock VectorDatabase instance
function createMockVectorDatabase(): jest.Mocked<VectorDatabase> {
    return {
        createCollection: jest.fn().mockResolvedValue(undefined),
        createHybridCollection: jest.fn().mockResolvedValue(undefined),
        dropCollection: jest.fn().mockResolvedValue(undefined),
        hasCollection: jest.fn().mockResolvedValue(false),
        listCollections: jest.fn().mockResolvedValue([]),
        insert: jest.fn().mockResolvedValue(undefined),
        insertHybrid: jest.fn().mockResolvedValue(undefined),
        search: jest.fn().mockResolvedValue([]),
        hybridSearch: jest.fn().mockResolvedValue([]),
        delete: jest.fn().mockResolvedValue(undefined),
        query: jest.fn().mockResolvedValue([])
    };
}

// Helper to create a mock Splitter instance
function createMockSplitter(): jest.Mocked<Splitter> {
    return {
        split: jest.fn().mockResolvedValue([
            {
                content: 'function test() {}',
                metadata: { startLine: 1, endLine: 1, language: 'typescript', filePath: 'test.ts' }
            }
        ]),
        setChunkSize: jest.fn(),
        setChunkOverlap: jest.fn()
    };
}

describe('Context', () => {
    let mockEmbedding: jest.Mocked<Embedding>;
    let mockVectorDatabase: jest.Mocked<VectorDatabase>;
    let mockSplitter: jest.Mocked<Splitter>;

    // Suppress console.log during tests
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;

    beforeAll(() => {
        console.log = jest.fn();
        console.warn = jest.fn();
    });

    afterAll(() => {
        console.log = originalConsoleLog;
        console.warn = originalConsoleWarn;
    });

    beforeEach(() => {
        jest.clearAllMocks();
        mockEmbedding = createMockEmbedding();
        mockVectorDatabase = createMockVectorDatabase();
        mockSplitter = createMockSplitter();
    });

    describe('constructor', () => {
        it('should throw error when vectorDatabase is not provided', () => {
            expect(() => new Context({
                embedding: mockEmbedding
            })).toThrow('VectorDatabase is required. Please provide a vectorDatabase instance in the config.');
        });

        it('should create instance with required vectorDatabase', () => {
            const context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding
            });

            expect(context).toBeInstanceOf(Context);
        });

        it('should use provided embedding instance', () => {
            const context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding
            });

            expect(context.getEmbedding()).toBe(mockEmbedding);
        });

        it('should use provided splitter instance', () => {
            const context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding,
                codeSplitter: mockSplitter
            });

            expect(context.getCodeSplitter()).toBe(mockSplitter);
        });

        it('should use default splitter when not provided', () => {
            const context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding
            });

            const splitter = context.getCodeSplitter();
            expect(splitter).toBeDefined();
            expect(splitter.constructor.name).toBe('AstCodeSplitter');
        });

        it('should merge custom extensions with defaults', () => {
            const context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding,
                customExtensions: ['.custom', '.myext']
            });

            const extensions = context.getSupportedExtensions();
            expect(extensions).toContain('.ts');
            expect(extensions).toContain('.custom');
            expect(extensions).toContain('.myext');
        });

        it('should merge custom ignore patterns with defaults', () => {
            const context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding,
                customIgnorePatterns: ['custom_dir/**', '*.custom']
            });

            const patterns = context.getIgnorePatterns();
            expect(patterns).toContain('node_modules/**');
            expect(patterns).toContain('custom_dir/**');
            expect(patterns).toContain('*.custom');
        });

        it('should remove duplicate extensions', () => {
            const context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding,
                customExtensions: ['.ts', '.js']  // These are already in defaults
            });

            const extensions = context.getSupportedExtensions();
            const tsCount = extensions.filter(e => e === '.ts').length;
            const jsCount = extensions.filter(e => e === '.js').length;
            expect(tsCount).toBe(1);
            expect(jsCount).toBe(1);
        });

        it('should remove duplicate ignore patterns', () => {
            const context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding,
                customIgnorePatterns: ['node_modules/**', 'dist/**']  // These are already in defaults
            });

            const patterns = context.getIgnorePatterns();
            const nodeModulesCount = patterns.filter(p => p === 'node_modules/**').length;
            expect(nodeModulesCount).toBe(1);
        });
    });

    describe('getter methods', () => {
        let context: Context;

        beforeEach(() => {
            context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding,
                codeSplitter: mockSplitter
            });
        });

        it('should return embedding instance', () => {
            expect(context.getEmbedding()).toBe(mockEmbedding);
        });

        it('should return vector database instance', () => {
            expect(context.getVectorDatabase()).toBe(mockVectorDatabase);
        });

        it('should return code splitter instance', () => {
            expect(context.getCodeSplitter()).toBe(mockSplitter);
        });

        it('should return copy of supported extensions', () => {
            const extensions1 = context.getSupportedExtensions();
            const extensions2 = context.getSupportedExtensions();

            expect(extensions1).toEqual(extensions2);
            expect(extensions1).not.toBe(extensions2);  // Should be a copy
        });

        it('should return copy of ignore patterns', () => {
            const patterns1 = context.getIgnorePatterns();
            const patterns2 = context.getIgnorePatterns();

            expect(patterns1).toEqual(patterns2);
            expect(patterns1).not.toBe(patterns2);  // Should be a copy
        });

        it('should return copy of synchronizers map', () => {
            const sync1 = context.getSynchronizers();
            const sync2 = context.getSynchronizers();

            expect(sync1).not.toBe(sync2);  // Should be a copy
        });
    });

    describe('getCollectionName', () => {
        let context: Context;

        beforeEach(() => {
            context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding
            });
        });

        it('should generate consistent collection name for same path', () => {
            const name1 = context.getCollectionName('/test/path');
            const name2 = context.getCollectionName('/test/path');

            expect(name1).toBe(name2);
        });

        it('should generate different names for different paths', () => {
            const name1 = context.getCollectionName('/path1');
            const name2 = context.getCollectionName('/path2');

            expect(name1).not.toBe(name2);
        });

        it('should include hybrid prefix when hybrid mode is enabled', () => {
            const name = context.getCollectionName('/test/path');
            expect(name).toMatch(/^hybrid_code_chunks_/);
        });

        it('should use hash of path in collection name', () => {
            const name = context.getCollectionName('/test/path');
            // Should have format: hybrid_code_chunks_XXXXXXXX (8 char hash)
            expect(name).toMatch(/^hybrid_code_chunks_[a-f0-9]{8}$/);
        });
    });

    describe('hasIndex', () => {
        let context: Context;

        beforeEach(() => {
            context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding
            });
        });

        it('should return true when collection exists', async () => {
            mockVectorDatabase.hasCollection.mockResolvedValue(true);

            const result = await context.hasIndex('/test/path');

            expect(result).toBe(true);
            expect(mockVectorDatabase.hasCollection).toHaveBeenCalled();
        });

        it('should return false when collection does not exist', async () => {
            mockVectorDatabase.hasCollection.mockResolvedValue(false);

            const result = await context.hasIndex('/test/path');

            expect(result).toBe(false);
        });
    });

    describe('clearIndex', () => {
        let context: Context;

        beforeEach(() => {
            context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding
            });
        });

        it('should drop collection when it exists', async () => {
            mockVectorDatabase.hasCollection.mockResolvedValue(true);

            await context.clearIndex('/test/path');

            expect(mockVectorDatabase.dropCollection).toHaveBeenCalled();
        });

        it('should not drop collection when it does not exist', async () => {
            mockVectorDatabase.hasCollection.mockResolvedValue(false);

            await context.clearIndex('/test/path');

            expect(mockVectorDatabase.dropCollection).not.toHaveBeenCalled();
        });

        it('should call progress callback', async () => {
            const progressCallback = jest.fn();
            mockVectorDatabase.hasCollection.mockResolvedValue(true);

            await context.clearIndex('/test/path', progressCallback);

            expect(progressCallback).toHaveBeenCalledWith({
                phase: 'Checking existing index...',
                current: 0,
                total: 100,
                percentage: 0
            });
            expect(progressCallback).toHaveBeenCalledWith({
                phase: 'Index cleared',
                current: 100,
                total: 100,
                percentage: 100
            });
        });
    });

    describe('updateIgnorePatterns', () => {
        let context: Context;

        beforeEach(() => {
            context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding
            });
        });

        it('should merge new patterns with defaults', () => {
            context.updateIgnorePatterns(['new_pattern/**', '*.new']);

            const patterns = context.getIgnorePatterns();
            expect(patterns).toContain('node_modules/**');  // Default
            expect(patterns).toContain('new_pattern/**');    // New
            expect(patterns).toContain('*.new');             // New
        });

        it('should remove duplicates', () => {
            context.updateIgnorePatterns(['node_modules/**', '*.new']);

            const patterns = context.getIgnorePatterns();
            const count = patterns.filter(p => p === 'node_modules/**').length;
            expect(count).toBe(1);
        });
    });

    describe('addCustomIgnorePatterns', () => {
        let context: Context;

        beforeEach(() => {
            context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding
            });
        });

        it('should add patterns to existing list', () => {
            const initialCount = context.getIgnorePatterns().length;

            context.addCustomIgnorePatterns(['custom1/**', 'custom2/**']);

            const patterns = context.getIgnorePatterns();
            expect(patterns).toContain('custom1/**');
            expect(patterns).toContain('custom2/**');
            expect(patterns.length).toBe(initialCount + 2);
        });

        it('should not add duplicate patterns', () => {
            context.addCustomIgnorePatterns(['unique_pattern/**']);
            const countAfterFirst = context.getIgnorePatterns().length;

            context.addCustomIgnorePatterns(['unique_pattern/**']);
            const countAfterSecond = context.getIgnorePatterns().length;

            expect(countAfterFirst).toBe(countAfterSecond);
        });

        it('should do nothing for empty array', () => {
            const initialPatterns = context.getIgnorePatterns();

            context.addCustomIgnorePatterns([]);

            expect(context.getIgnorePatterns()).toEqual(initialPatterns);
        });
    });

    describe('resetIgnorePatternsToDefaults', () => {
        let context: Context;

        beforeEach(() => {
            context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding,
                customIgnorePatterns: ['custom/**']
            });
        });

        it('should remove custom patterns', () => {
            expect(context.getIgnorePatterns()).toContain('custom/**');

            context.resetIgnorePatternsToDefaults();

            expect(context.getIgnorePatterns()).not.toContain('custom/**');
        });

        it('should keep default patterns', () => {
            context.resetIgnorePatternsToDefaults();

            const patterns = context.getIgnorePatterns();
            expect(patterns).toContain('node_modules/**');
            expect(patterns).toContain('dist/**');
            expect(patterns).toContain('.git/**');
        });
    });

    describe('addCustomExtensions', () => {
        let context: Context;

        beforeEach(() => {
            context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding
            });
        });

        it('should add new extensions', () => {
            context.addCustomExtensions(['.myext', '.custom']);

            const extensions = context.getSupportedExtensions();
            expect(extensions).toContain('.myext');
            expect(extensions).toContain('.custom');
        });

        it('should normalize extensions without leading dot', () => {
            context.addCustomExtensions(['myext', 'custom']);

            const extensions = context.getSupportedExtensions();
            expect(extensions).toContain('.myext');
            expect(extensions).toContain('.custom');
        });

        it('should not duplicate extensions', () => {
            context.addCustomExtensions(['.uniqueext']);
            const countAfterFirst = context.getSupportedExtensions().length;

            context.addCustomExtensions(['.uniqueext']);
            const countAfterSecond = context.getSupportedExtensions().length;

            expect(countAfterFirst).toBe(countAfterSecond);
        });

        it('should do nothing for empty array', () => {
            const initialExtensions = context.getSupportedExtensions();

            context.addCustomExtensions([]);

            expect(context.getSupportedExtensions()).toEqual(initialExtensions);
        });
    });

    describe('updateEmbedding', () => {
        let context: Context;

        beforeEach(() => {
            context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding
            });
        });

        it('should replace embedding instance', () => {
            const newEmbedding = createMockEmbedding();
            newEmbedding.getProvider.mockReturnValue('NewProvider');

            context.updateEmbedding(newEmbedding);

            expect(context.getEmbedding()).toBe(newEmbedding);
            expect(context.getEmbedding().getProvider()).toBe('NewProvider');
        });
    });

    describe('updateVectorDatabase', () => {
        let context: Context;

        beforeEach(() => {
            context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding
            });
        });

        it('should replace vector database instance', () => {
            const newVectorDb = createMockVectorDatabase();

            context.updateVectorDatabase(newVectorDb);

            expect(context.getVectorDatabase()).toBe(newVectorDb);
        });
    });

    describe('updateSplitter', () => {
        let context: Context;

        beforeEach(() => {
            context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding,
                codeSplitter: mockSplitter
            });
        });

        it('should replace splitter instance', () => {
            const newSplitter = createMockSplitter();

            context.updateSplitter(newSplitter);

            expect(context.getCodeSplitter()).toBe(newSplitter);
        });
    });

    describe('setSynchronizer', () => {
        let context: Context;

        beforeEach(() => {
            context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding
            });
        });

        it('should set synchronizer for collection', () => {
            const mockSync = {
                initialize: jest.fn(),
                checkForChanges: jest.fn()
            } as unknown as FileSynchronizer;

            context.setSynchronizer('test-collection', mockSync);

            const synchronizers = context.getSynchronizers();
            expect(synchronizers.get('test-collection')).toBe(mockSync);
        });

        it('should overwrite existing synchronizer', () => {
            const sync1 = { initialize: jest.fn() } as unknown as FileSynchronizer;
            const sync2 = { initialize: jest.fn() } as unknown as FileSynchronizer;

            context.setSynchronizer('test-collection', sync1);
            context.setSynchronizer('test-collection', sync2);

            const synchronizers = context.getSynchronizers();
            expect(synchronizers.get('test-collection')).toBe(sync2);
        });
    });

    describe('getSplitterInfo', () => {
        it('should return ast splitter info when using AstCodeSplitter', () => {
            const context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding
                // Uses default AstCodeSplitter
            });

            const info = context.getSplitterInfo();

            expect(info.type).toBe('ast');
            expect(info.hasBuiltinFallback).toBe(true);
            // supportedLanguages may or may not be populated depending on the AST splitter implementation
            // The important thing is that the method returns valid info for AST type
        });

        it('should return langchain splitter info when using custom splitter', () => {
            const context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding,
                codeSplitter: mockSplitter  // Custom mock splitter
            });

            const info = context.getSplitterInfo();

            expect(info.type).toBe('langchain');
            expect(info.hasBuiltinFallback).toBe(false);
        });
    });

    describe('isLanguageSupported', () => {
        it('should return true for supported languages with AstCodeSplitter', () => {
            const context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding
            });

            expect(context.isLanguageSupported('typescript')).toBe(true);
            expect(context.isLanguageSupported('javascript')).toBe(true);
            expect(context.isLanguageSupported('python')).toBe(true);
        });

        it('should return true for any language with custom splitter', () => {
            const context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding,
                codeSplitter: mockSplitter
            });

            // LangChain splitter supports most languages
            expect(context.isLanguageSupported('any_language')).toBe(true);
        });
    });

    describe('getSplitterStrategyForLanguage', () => {
        it('should return ast strategy for supported language', () => {
            const context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding
            });

            const result = context.getSplitterStrategyForLanguage('typescript');

            expect(result.strategy).toBe('ast');
            expect(result.reason).toContain('supported by AST');
        });

        it('should return langchain strategy for unsupported language with AST', () => {
            const context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding
            });

            const result = context.getSplitterStrategyForLanguage('obscure_language_xyz');

            expect(result.strategy).toBe('langchain');
            expect(result.reason).toContain('fallback');
        });

        it('should return langchain strategy when using custom splitter', () => {
            const context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding,
                codeSplitter: mockSplitter
            });

            const result = context.getSplitterStrategyForLanguage('typescript');

            expect(result.strategy).toBe('langchain');
            expect(result.reason).toContain('LangChain splitter');
        });
    });

    describe('semanticSearch', () => {
        let context: Context;

        beforeEach(() => {
            context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding
            });
        });

        it('should return empty array when collection does not exist', async () => {
            mockVectorDatabase.hasCollection.mockResolvedValue(false);

            const results = await context.semanticSearch('/test/path', 'test query');

            expect(results).toEqual([]);
        });

        it('should perform hybrid search when hybrid mode is enabled', async () => {
            mockVectorDatabase.hasCollection.mockResolvedValue(true);
            mockVectorDatabase.query.mockResolvedValue([{ id: '1' }]);
            mockVectorDatabase.hybridSearch.mockResolvedValue([
                {
                    document: {
                        id: '1',
                        content: 'test content',
                        vector: [],
                        relativePath: 'test.ts',
                        startLine: 1,
                        endLine: 10,
                        fileExtension: '.ts',
                        metadata: { language: 'typescript' }
                    },
                    score: 0.9
                }
            ]);

            const results = await context.semanticSearch('/test/path', 'test query');

            expect(mockVectorDatabase.hybridSearch).toHaveBeenCalled();
            expect(results).toHaveLength(1);
            expect(results[0].content).toBe('test content');
            expect(results[0].score).toBe(0.9);
        });

        it('should respect topK parameter', async () => {
            mockVectorDatabase.hasCollection.mockResolvedValue(true);
            mockVectorDatabase.query.mockResolvedValue([{ id: '1' }]);
            mockVectorDatabase.hybridSearch.mockResolvedValue([]);

            await context.semanticSearch('/test/path', 'query', 10);

            const hybridSearchCalls = mockVectorDatabase.hybridSearch.mock.calls;
            expect(hybridSearchCalls[0][1][0].limit).toBe(10);
            expect(hybridSearchCalls[0][1][1].limit).toBe(10);
        });

        it('should pass filter expression to hybrid search', async () => {
            mockVectorDatabase.hasCollection.mockResolvedValue(true);
            mockVectorDatabase.query.mockResolvedValue([{ id: '1' }]);
            mockVectorDatabase.hybridSearch.mockResolvedValue([]);

            await context.semanticSearch('/test/path', 'query', 5, 0.5, 'language == "typescript"');

            const options = mockVectorDatabase.hybridSearch.mock.calls[0][2] as HybridSearchOptions;
            expect(options.filterExpr).toBe('language == "typescript"');
        });

        it('should format results correctly from hybrid search', async () => {
            mockVectorDatabase.hasCollection.mockResolvedValue(true);
            mockVectorDatabase.query.mockResolvedValue([{ id: '1' }]);
            mockVectorDatabase.hybridSearch.mockResolvedValue([
                {
                    document: {
                        id: '1',
                        content: 'function test() {}',
                        vector: [],
                        relativePath: 'src/test.ts',
                        startLine: 5,
                        endLine: 10,
                        fileExtension: '.ts',
                        metadata: { language: 'typescript' }
                    },
                    score: 0.85
                }
            ]);

            const results = await context.semanticSearch('/test/path', 'test function');

            expect(results[0]).toEqual({
                content: 'function test() {}',
                relativePath: 'src/test.ts',
                startLine: 5,
                endLine: 10,
                language: 'typescript',
                score: 0.85
            });
        });
    });

    describe('getIgnorePatternsFromFile', () => {
        it('should parse ignore patterns from file content', async () => {
            const mockContent = `
# Comment line
node_modules
dist/
*.log

# Another comment
temp/
`;
            jest.spyOn(fs.promises, 'readFile').mockResolvedValue(mockContent);

            const patterns = await Context.getIgnorePatternsFromFile('/test/.gitignore');

            expect(patterns).toContain('node_modules');
            expect(patterns).toContain('dist/');
            expect(patterns).toContain('*.log');
            expect(patterns).toContain('temp/');
            expect(patterns).not.toContain('# Comment line');
            expect(patterns).not.toContain('');
        });

        it('should return empty array when file does not exist', async () => {
            jest.spyOn(fs.promises, 'readFile').mockRejectedValue(new Error('ENOENT'));

            const patterns = await Context.getIgnorePatternsFromFile('/nonexistent/.gitignore');

            expect(patterns).toEqual([]);
        });
    });

    describe('default supported extensions', () => {
        let context: Context;

        beforeEach(() => {
            context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding
            });
        });

        it('should include common programming language extensions', () => {
            const extensions = context.getSupportedExtensions();

            expect(extensions).toContain('.ts');
            expect(extensions).toContain('.tsx');
            expect(extensions).toContain('.js');
            expect(extensions).toContain('.jsx');
            expect(extensions).toContain('.py');
            expect(extensions).toContain('.java');
            expect(extensions).toContain('.cpp');
            expect(extensions).toContain('.c');
            expect(extensions).toContain('.go');
            expect(extensions).toContain('.rs');
        });

        it('should include markdown extensions', () => {
            const extensions = context.getSupportedExtensions();

            expect(extensions).toContain('.md');
            expect(extensions).toContain('.markdown');
        });

        it('should include jupyter notebook extension', () => {
            const extensions = context.getSupportedExtensions();

            expect(extensions).toContain('.ipynb');
        });
    });

    describe('default ignore patterns', () => {
        let context: Context;

        beforeEach(() => {
            context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding
            });
        });

        it('should include common build directories', () => {
            const patterns = context.getIgnorePatterns();

            expect(patterns).toContain('node_modules/**');
            expect(patterns).toContain('dist/**');
            expect(patterns).toContain('build/**');
            expect(patterns).toContain('out/**');
            expect(patterns).toContain('target/**');
        });

        it('should include version control directories', () => {
            const patterns = context.getIgnorePatterns();

            expect(patterns).toContain('.git/**');
            expect(patterns).toContain('.svn/**');
            expect(patterns).toContain('.hg/**');
        });

        it('should include IDE directories', () => {
            const patterns = context.getIgnorePatterns();

            expect(patterns).toContain('.vscode/**');
            expect(patterns).toContain('.idea/**');
        });

        it('should include common minified file patterns', () => {
            const patterns = context.getIgnorePatterns();

            expect(patterns).toContain('*.min.js');
            expect(patterns).toContain('*.min.css');
            expect(patterns).toContain('*.bundle.js');
            expect(patterns).toContain('*.map');
        });
    });

    describe('edge cases', () => {
        it('should handle empty config', () => {
            // Empty config should throw because vectorDatabase is required
            expect(() => new Context({})).toThrow('VectorDatabase is required');
        });

        it('should handle config with only vectorDatabase', () => {
            const context = new Context({
                vectorDatabase: mockVectorDatabase
            });

            expect(context).toBeInstanceOf(Context);
            expect(context.getVectorDatabase()).toBe(mockVectorDatabase);
        });

        it('should handle multiple simultaneous operations', async () => {
            const context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding
            });

            mockVectorDatabase.hasCollection
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false)
                .mockResolvedValueOnce(true);

            const results = await Promise.all([
                context.hasIndex('/path1'),
                context.hasIndex('/path2'),
                context.hasIndex('/path3')
            ]);

            expect(results).toEqual([true, false, true]);
        });

        it('should store custom extensions as provided', () => {
            // Constructor stores customExtensions as-is (unlike addCustomExtensions method which normalizes)
            const context = new Context({
                vectorDatabase: mockVectorDatabase,
                embedding: mockEmbedding,
                customExtensions: ['.myext', '.CUSTOM']  // With dots
            });

            const extensions = context.getSupportedExtensions();
            expect(extensions).toContain('.myext');
            expect(extensions).toContain('.CUSTOM');
        });
    });
});

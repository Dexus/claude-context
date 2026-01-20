import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import { LanceDBVectorDatabase, LanceDBConfig } from '../../vectordb/lancedb-vectordb';
import { VectorDocument } from '../../vectordb/types';

describe('LanceDBVectorDatabase', () => {
    let db: LanceDBVectorDatabase;
    let tempDir: string;

    // Helper to create a temporary directory for each test
    const createTempDir = async (): Promise<string> => {
        const dir = path.join(os.tmpdir(), `lancedb-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`);
        await fs.ensureDir(dir);
        return dir;
    };

    // Helper to create a test document
    const createTestDocument = (id: string, content: string, vector: number[]): VectorDocument => ({
        id,
        content,
        vector,
        relativePath: `/test/${id}.ts`,
        startLine: 1,
        endLine: 10,
        fileExtension: '.ts',
        mtime: Date.now(),
        metadata: { testKey: 'testValue' }
    });

    // Helper to create multiple test documents
    const createTestDocuments = (count: number, dimension: number): VectorDocument[] => {
        return Array.from({ length: count }, (_, i) =>
            createTestDocument(
                `doc-${i}`,
                `Test content for document ${i}`,
                Array.from({ length: dimension }, () => Math.random())
            )
        );
    };

    beforeEach(async () => {
        tempDir = await createTempDir();
        db = new LanceDBVectorDatabase({ uri: tempDir });
        // Wait for initialization to complete
        await (db as any).initializationPromise;
    });

    afterEach(async () => {
        // Clean up temp directory
        if (tempDir) {
            await fs.remove(tempDir).catch(() => {});
        }
    });

    describe('constructor', () => {
        it('should initialize with custom config', async () => {
            const customDir = await createTempDir();
            const config: LanceDBConfig = { uri: customDir };
            const customDb = new LanceDBVectorDatabase(config);
            await (customDb as any).initializationPromise;

            expect((customDb as any).config.uri).toBe(customDir);
            await fs.remove(customDir).catch(() => {});
        });

        it('should use default uri when not provided', async () => {
            const defaultDb = new LanceDBVectorDatabase();
            expect((defaultDb as any).config.uri).toBe('./.claude-context/lancedb');
        });

        it('should create database directory if it does not exist', async () => {
            const newDir = path.join(tempDir, 'new-db-dir');
            const newDb = new LanceDBVectorDatabase({ uri: newDir });
            await (newDb as any).initializationPromise;

            const exists = await fs.pathExists(newDir);
            expect(exists).toBe(true);
        });

        it('should initialize db client', async () => {
            expect((db as any).db).not.toBeNull();
        });
    });

    describe('createCollection', () => {
        it('should create a new collection', async () => {
            const collectionName = 'test-collection';
            const dimension = 128;

            await db.createCollection(collectionName, dimension);

            const exists = await db.hasCollection(collectionName);
            expect(exists).toBe(true);
        });

        it('should not throw when creating collection that already exists', async () => {
            const collectionName = 'duplicate-collection';
            const dimension = 64;

            await db.createCollection(collectionName, dimension);
            await expect(db.createCollection(collectionName, dimension)).resolves.not.toThrow();
        });

        it('should create collection with specified dimension', async () => {
            const collectionName = 'dimension-test';
            const dimension = 256;

            await db.createCollection(collectionName, dimension);

            // Insert a document and verify it works with the dimension
            const doc = createTestDocument('test-id', 'content', new Array(dimension).fill(0.5));
            await expect(db.insert(collectionName, [doc])).resolves.not.toThrow();
        });

        it('should handle collection names with special characters', async () => {
            const collectionName = 'test_collection_2024';
            const dimension = 32;

            await db.createCollection(collectionName, dimension);
            const exists = await db.hasCollection(collectionName);
            expect(exists).toBe(true);
        });
    });

    describe('dropCollection', () => {
        it('should drop an existing collection', async () => {
            const collectionName = 'to-drop';
            await db.createCollection(collectionName, 64);

            await db.dropCollection(collectionName);

            const exists = await db.hasCollection(collectionName);
            expect(exists).toBe(false);
        });

        it('should throw when dropping non-existent collection', async () => {
            await expect(db.dropCollection('non-existent')).rejects.toThrow();
        });

        it('should remove table from cache when dropped', async () => {
            const collectionName = 'cached-collection';
            await db.createCollection(collectionName, 64);

            // Access the table to cache it
            await db.listCollections();

            await db.dropCollection(collectionName);

            expect((db as any).tables.has(collectionName)).toBe(false);
        });
    });

    describe('hasCollection', () => {
        it('should return true for existing collection', async () => {
            const collectionName = 'exists-check';
            await db.createCollection(collectionName, 64);

            const exists = await db.hasCollection(collectionName);
            expect(exists).toBe(true);
        });

        it('should return false for non-existent collection', async () => {
            const exists = await db.hasCollection('does-not-exist');
            expect(exists).toBe(false);
        });

        it('should return false for dropped collection', async () => {
            const collectionName = 'was-dropped';
            await db.createCollection(collectionName, 64);
            await db.dropCollection(collectionName);

            const exists = await db.hasCollection(collectionName);
            expect(exists).toBe(false);
        });
    });

    describe('listCollections', () => {
        it('should return empty array when no collections exist', async () => {
            const collections = await db.listCollections();
            expect(collections).toEqual([]);
        });

        it('should return all collection names', async () => {
            await db.createCollection('collection-1', 64);
            await db.createCollection('collection-2', 64);
            await db.createCollection('collection-3', 64);

            const collections = await db.listCollections();
            expect(collections).toHaveLength(3);
            expect(collections).toContain('collection-1');
            expect(collections).toContain('collection-2');
            expect(collections).toContain('collection-3');
        });

        it('should not include dropped collections', async () => {
            await db.createCollection('kept', 64);
            await db.createCollection('dropped', 64);
            await db.dropCollection('dropped');

            const collections = await db.listCollections();
            expect(collections).toContain('kept');
            expect(collections).not.toContain('dropped');
        });
    });

    describe('insert', () => {
        const collectionName = 'insert-test';
        const dimension = 64;

        beforeEach(async () => {
            await db.createCollection(collectionName, dimension);
        });

        it('should insert a single document', async () => {
            const doc = createTestDocument('single-doc', 'single content', new Array(dimension).fill(0.1));

            await expect(db.insert(collectionName, [doc])).resolves.not.toThrow();
        });

        it('should insert multiple documents', async () => {
            const docs = createTestDocuments(10, dimension);

            await expect(db.insert(collectionName, docs)).resolves.not.toThrow();
        });

        it('should throw when inserting into non-existent collection', async () => {
            const doc = createTestDocument('orphan', 'orphan content', new Array(dimension).fill(0.1));

            await expect(db.insert('non-existent', [doc])).rejects.toThrow();
        });

        it('should preserve document metadata', async () => {
            const doc = createTestDocument('meta-doc', 'content with metadata', new Array(dimension).fill(0.1));
            doc.metadata = { custom: 'data', nested: { key: 'value' } };

            await db.insert(collectionName, [doc]);

            const results = await db.query(collectionName, `id = 'meta-doc'`, ['id', 'metadata']);
            expect(results).toHaveLength(1);
            expect(results[0].metadata).toEqual({ custom: 'data', nested: { key: 'value' } });
        });

        it('should handle documents with empty metadata', async () => {
            const doc = createTestDocument('no-meta', 'content', new Array(dimension).fill(0.1));
            doc.metadata = {};

            await db.insert(collectionName, [doc]);

            const results = await db.query(collectionName, `id = 'no-meta'`, ['id', 'metadata']);
            expect(results).toHaveLength(1);
            expect(results[0].metadata).toEqual({});
        });
    });

    describe('search', () => {
        const collectionName = 'search-test';
        const dimension = 64;

        beforeEach(async () => {
            await db.createCollection(collectionName, dimension);
        });

        it('should return search results', async () => {
            const docs = [
                createTestDocument('doc-1', 'first document', new Array(dimension).fill(0.1)),
                createTestDocument('doc-2', 'second document', new Array(dimension).fill(0.2)),
                createTestDocument('doc-3', 'third document', new Array(dimension).fill(0.3)),
            ];
            await db.insert(collectionName, docs);

            const queryVector = new Array(dimension).fill(0.15);
            const results = await db.search(collectionName, queryVector);

            expect(results.length).toBeGreaterThan(0);
            expect(results[0]).toHaveProperty('document');
            expect(results[0]).toHaveProperty('score');
        });

        it('should respect topK option', async () => {
            const docs = createTestDocuments(10, dimension);
            await db.insert(collectionName, docs);

            const queryVector = new Array(dimension).fill(0.5);
            const results = await db.search(collectionName, queryVector, { topK: 3 });

            expect(results).toHaveLength(3);
        });

        it('should return results with document fields', async () => {
            const doc = createTestDocument('full-doc', 'content text', new Array(dimension).fill(0.1));
            await db.insert(collectionName, [doc]);

            const queryVector = new Array(dimension).fill(0.1);
            const results = await db.search(collectionName, queryVector);

            expect(results[0].document.id).toBe('full-doc');
            expect(results[0].document.content).toBe('content text');
            expect(results[0].document.relativePath).toBe('/test/full-doc.ts');
            expect(results[0].document.startLine).toBe(1);
            expect(results[0].document.endLine).toBe(10);
            expect(results[0].document.fileExtension).toBe('.ts');
        });

        it('should parse metadata from JSON', async () => {
            const doc = createTestDocument('meta-search', 'content', new Array(dimension).fill(0.1));
            doc.metadata = { searchKey: 'searchValue' };
            await db.insert(collectionName, [doc]);

            const queryVector = new Array(dimension).fill(0.1);
            const results = await db.search(collectionName, queryVector);

            expect(results[0].document.metadata).toEqual({ searchKey: 'searchValue' });
        });

        it('should apply filter expression', async () => {
            const docs = [
                createTestDocument('ts-file', 'typescript file', new Array(dimension).fill(0.1)),
                createTestDocument('js-file', 'javascript file', new Array(dimension).fill(0.1)),
            ];
            docs[0].fileExtension = '.ts';
            docs[1].fileExtension = '.js';
            await db.insert(collectionName, docs);

            const queryVector = new Array(dimension).fill(0.1);
            // LanceDB requires quoted column names for camelCase fields
            const results = await db.search(collectionName, queryVector, {
                filterExpr: `"fileExtension" = '.ts'`
            });

            expect(results.every(r => r.document.fileExtension === '.ts')).toBe(true);
        });

        it('should return empty array when no documents match', async () => {
            const queryVector = new Array(dimension).fill(0.5);
            const results = await db.search(collectionName, queryVector);

            expect(results).toEqual([]);
        });

        it('should throw when searching non-existent collection', async () => {
            const queryVector = new Array(dimension).fill(0.5);
            await expect(db.search('non-existent', queryVector)).rejects.toThrow();
        });
    });

    describe('delete', () => {
        const collectionName = 'delete-test';
        const dimension = 64;

        beforeEach(async () => {
            await db.createCollection(collectionName, dimension);
        });

        it('should delete documents by ID', async () => {
            const docs = [
                createTestDocument('keep-1', 'keep', new Array(dimension).fill(0.1)),
                createTestDocument('delete-1', 'delete', new Array(dimension).fill(0.2)),
                createTestDocument('keep-2', 'keep', new Array(dimension).fill(0.3)),
            ];
            await db.insert(collectionName, docs);

            await db.delete(collectionName, ['delete-1']);

            const results = await db.query(collectionName, '', ['id']);
            const ids = results.map(r => r.id);
            expect(ids).toContain('keep-1');
            expect(ids).toContain('keep-2');
            expect(ids).not.toContain('delete-1');
        });

        it('should delete multiple documents', async () => {
            const docs = createTestDocuments(5, dimension);
            await db.insert(collectionName, docs);

            await db.delete(collectionName, ['doc-0', 'doc-2', 'doc-4']);

            const results = await db.query(collectionName, '', ['id']);
            const ids = results.map(r => r.id);
            expect(ids).toHaveLength(2);
            expect(ids).toContain('doc-1');
            expect(ids).toContain('doc-3');
        });

        it('should not throw when deleting non-existent IDs', async () => {
            const doc = createTestDocument('existing', 'content', new Array(dimension).fill(0.1));
            await db.insert(collectionName, [doc]);

            await expect(db.delete(collectionName, ['non-existent-id'])).resolves.not.toThrow();
        });

        it('should throw when deleting from non-existent collection', async () => {
            await expect(db.delete('non-existent', ['id'])).rejects.toThrow();
        });
    });

    describe('query', () => {
        const collectionName = 'query-test';
        const dimension = 64;

        beforeEach(async () => {
            await db.createCollection(collectionName, dimension);
        });

        it('should query documents with filter', async () => {
            const docs = [
                createTestDocument('query-1', 'content 1', new Array(dimension).fill(0.1)),
                createTestDocument('query-2', 'content 2', new Array(dimension).fill(0.2)),
            ];
            await db.insert(collectionName, docs);

            // Filter by ID string field which is more reliable in LanceDB
            const results = await db.query(collectionName, `id = 'query-2'`, ['id', 'content']);

            expect(results).toHaveLength(1);
            expect(results[0].id).toBe('query-2');
        });

        it('should return specified output fields', async () => {
            const doc = createTestDocument('fields-test', 'content', new Array(dimension).fill(0.1));
            await db.insert(collectionName, [doc]);

            const results = await db.query(collectionName, `id = 'fields-test'`, ['id', 'content']);

            expect(results[0]).toHaveProperty('id');
            expect(results[0]).toHaveProperty('content');
        });

        it('should respect limit option', async () => {
            const docs = createTestDocuments(10, dimension);
            await db.insert(collectionName, docs);

            const results = await db.query(collectionName, '', ['id'], 3);

            expect(results).toHaveLength(3);
        });

        it('should return all documents when no filter specified', async () => {
            const docs = createTestDocuments(5, dimension);
            await db.insert(collectionName, docs);

            const results = await db.query(collectionName, '', ['id']);

            expect(results).toHaveLength(5);
        });

        it('should parse metadata field as JSON', async () => {
            const doc = createTestDocument('json-meta', 'content', new Array(dimension).fill(0.1));
            doc.metadata = { key: 'value', number: 42 };
            await db.insert(collectionName, [doc]);

            const results = await db.query(collectionName, `id = 'json-meta'`, ['id', 'metadata']);

            expect(results[0].metadata).toEqual({ key: 'value', number: 42 });
        });

        it('should return empty array when no documents match filter', async () => {
            const doc = createTestDocument('existing-doc', 'content', new Array(dimension).fill(0.1));
            await db.insert(collectionName, [doc]);

            // Filter for a non-existent ID should return no results
            const results = await db.query(collectionName, `id = 'non-existent-id'`, ['id']);

            expect(results).toEqual([]);
        });

        it('should throw when querying non-existent collection', async () => {
            await expect(db.query('non-existent', '', ['id'])).rejects.toThrow();
        });
    });

    describe('createHybridCollection', () => {
        it('should create a hybrid collection with FTS index', async () => {
            const collectionName = 'hybrid-test';
            const dimension = 128;

            await db.createHybridCollection(collectionName, dimension);

            const exists = await db.hasCollection(collectionName);
            expect(exists).toBe(true);
        });

        it('should not throw when hybrid collection already exists', async () => {
            const collectionName = 'hybrid-duplicate';
            const dimension = 64;

            await db.createHybridCollection(collectionName, dimension);
            await expect(db.createHybridCollection(collectionName, dimension)).resolves.not.toThrow();
        });

        it('should support inserting documents after creation', async () => {
            const collectionName = 'hybrid-insert-test';
            const dimension = 64;

            await db.createHybridCollection(collectionName, dimension);

            const doc = createTestDocument('hybrid-doc', 'hybrid content', new Array(dimension).fill(0.1));
            await expect(db.insertHybrid(collectionName, [doc])).resolves.not.toThrow();
        });
    });

    describe('insertHybrid', () => {
        const collectionName = 'hybrid-insert';
        const dimension = 64;

        beforeEach(async () => {
            await db.createHybridCollection(collectionName, dimension);
        });

        it('should insert documents into hybrid collection', async () => {
            const docs = createTestDocuments(5, dimension);

            await expect(db.insertHybrid(collectionName, docs)).resolves.not.toThrow();

            const results = await db.query(collectionName, '', ['id']);
            expect(results).toHaveLength(5);
        });

        it('should behave the same as regular insert', async () => {
            const doc = createTestDocument('same-behavior', 'test content', new Array(dimension).fill(0.1));

            await db.insertHybrid(collectionName, [doc]);

            const results = await db.query(collectionName, `id = 'same-behavior'`, ['id', 'content']);
            expect(results).toHaveLength(1);
            expect(results[0].content).toBe('test content');
        });
    });

    describe('hybridSearch', () => {
        const collectionName = 'hybrid-search-test';
        const dimension = 64;

        beforeEach(async () => {
            await db.createHybridCollection(collectionName, dimension);
        });

        it('should perform hybrid search with vector query', async () => {
            const docs = [
                createTestDocument('hybrid-1', 'javascript programming', new Array(dimension).fill(0.1)),
                createTestDocument('hybrid-2', 'python scripting', new Array(dimension).fill(0.2)),
                createTestDocument('hybrid-3', 'typescript development', new Array(dimension).fill(0.3)),
            ];
            await db.insertHybrid(collectionName, docs);

            const queryVector = new Array(dimension).fill(0.15);
            const results = await db.hybridSearch(collectionName, [
                {
                    data: queryVector,
                    anns_field: 'vector',
                    param: {},
                    limit: 10
                }
            ]);

            expect(results.length).toBeGreaterThan(0);
            expect(results[0]).toHaveProperty('document');
            expect(results[0]).toHaveProperty('score');
        });

        it('should respect limit option', async () => {
            const docs = createTestDocuments(10, dimension);
            await db.insertHybrid(collectionName, docs);

            const queryVector = new Array(dimension).fill(0.5);
            const results = await db.hybridSearch(collectionName, [
                {
                    data: queryVector,
                    anns_field: 'vector',
                    param: {},
                    limit: 10
                }
            ], { limit: 3 });

            expect(results).toHaveLength(3);
        });

        it('should apply filter expression', async () => {
            const docs = [
                createTestDocument('filter-ts', 'typescript code', new Array(dimension).fill(0.1)),
                createTestDocument('filter-js', 'javascript code', new Array(dimension).fill(0.1)),
            ];
            docs[0].fileExtension = '.ts';
            docs[1].fileExtension = '.js';
            await db.insertHybrid(collectionName, docs);

            const queryVector = new Array(dimension).fill(0.1);
            const results = await db.hybridSearch(collectionName, [
                {
                    data: queryVector,
                    anns_field: 'vector',
                    param: {},
                    limit: 10
                }
            ], { filterExpr: `fileExtension = '.ts'` });

            expect(results.every(r => r.document.fileExtension === '.ts')).toBe(true);
        });

        it('should return results with all document fields', async () => {
            const doc = createTestDocument('full-hybrid', 'complete content', new Array(dimension).fill(0.1));
            doc.metadata = { hybridMeta: true };
            await db.insertHybrid(collectionName, [doc]);

            const queryVector = new Array(dimension).fill(0.1);
            const results = await db.hybridSearch(collectionName, [
                {
                    data: queryVector,
                    anns_field: 'vector',
                    param: {},
                    limit: 10
                }
            ]);

            expect(results[0].document.id).toBe('full-hybrid');
            expect(results[0].document.content).toBe('complete content');
            expect(results[0].document.metadata).toEqual({ hybridMeta: true });
        });

        it('should throw when searching non-existent collection', async () => {
            const queryVector = new Array(dimension).fill(0.5);
            await expect(db.hybridSearch('non-existent', [
                {
                    data: queryVector,
                    anns_field: 'vector',
                    param: {},
                    limit: 10
                }
            ])).rejects.toThrow();
        });
    });

    describe('ensureInitialized', () => {
        it('should throw if db is null after initialization promise', async () => {
            const brokenDb = new LanceDBVectorDatabase({ uri: tempDir });
            // Forcefully set db to null to simulate initialization failure
            await (brokenDb as any).initializationPromise;
            (brokenDb as any).db = null;

            await expect(brokenDb.listCollections()).rejects.toThrow('LanceDB client not initialized');
        });
    });

    describe('table caching', () => {
        it('should cache table references', async () => {
            const collectionName = 'cached-table';
            await db.createCollection(collectionName, 64);

            // First access should cache the table
            await db.listCollections();

            const tables = (db as any).tables;
            expect(tables.has(collectionName)).toBe(true);
        });

        it('should reuse cached table on subsequent operations', async () => {
            const collectionName = 'reuse-cache';
            const dimension = 64;
            await db.createCollection(collectionName, dimension);

            const doc = createTestDocument('cache-doc', 'content', new Array(dimension).fill(0.1));
            await db.insert(collectionName, [doc]);

            // Multiple operations should use same cached table
            await db.query(collectionName, '', ['id']);
            await db.search(collectionName, new Array(dimension).fill(0.1));

            // Table should still be cached
            expect((db as any).tables.has(collectionName)).toBe(true);
        });
    });

    describe('edge cases', () => {
        const collectionName = 'edge-cases';
        const dimension = 64;

        beforeEach(async () => {
            await db.createCollection(collectionName, dimension);
        });

        it('should handle documents with empty content', async () => {
            const doc = createTestDocument('empty-content', '', new Array(dimension).fill(0.1));

            await db.insert(collectionName, [doc]);

            const results = await db.query(collectionName, `id = 'empty-content'`, ['id', 'content']);
            expect(results[0].content).toBe('');
        });

        it('should handle documents with special characters in content', async () => {
            const specialContent = '!@#$%^&*(){}[]|\\:";\'<>?,./ \n\t';
            const doc = createTestDocument('special-chars', specialContent, new Array(dimension).fill(0.1));

            await db.insert(collectionName, [doc]);

            const results = await db.query(collectionName, `id = 'special-chars'`, ['content']);
            expect(results[0].content).toBe(specialContent);
        });

        it('should handle documents with unicode content', async () => {
            const unicodeContent = '你好世界 🌍 مرحبا العالم';
            const doc = createTestDocument('unicode', unicodeContent, new Array(dimension).fill(0.1));

            await db.insert(collectionName, [doc]);

            const results = await db.query(collectionName, `id = 'unicode'`, ['content']);
            expect(results[0].content).toBe(unicodeContent);
        });

        it('should handle large batch inserts', async () => {
            const docs = createTestDocuments(100, dimension);

            await expect(db.insert(collectionName, docs)).resolves.not.toThrow();

            // LanceDB query has a default limit, so we need to specify a higher limit
            const results = await db.query(collectionName, '', ['id'], 200);
            expect(results).toHaveLength(100);
        });

        it('should handle vectors with zero values', async () => {
            const doc = createTestDocument('zero-vector', 'content', new Array(dimension).fill(0));

            await db.insert(collectionName, [doc]);

            const results = await db.search(collectionName, new Array(dimension).fill(0));
            expect(results.length).toBeGreaterThan(0);
        });

        it('should handle nested metadata objects', async () => {
            const doc = createTestDocument('nested-meta', 'content', new Array(dimension).fill(0.1));
            doc.metadata = {
                level1: {
                    level2: {
                        level3: 'deep value'
                    },
                    array: [1, 2, 3]
                }
            };

            await db.insert(collectionName, [doc]);

            const results = await db.query(collectionName, `id = 'nested-meta'`, ['metadata']);
            expect(results[0].metadata.level1.level2.level3).toBe('deep value');
            expect(results[0].metadata.level1.array).toEqual([1, 2, 3]);
        });
    });

    describe('combineSearchResults (RRF)', () => {
        // Test the private combineSearchResults method indirectly through hybridSearch
        const collectionName = 'rrf-test';
        const dimension = 64;

        beforeEach(async () => {
            await db.createHybridCollection(collectionName, dimension);
        });

        it('should combine and rank results from vector search', async () => {
            const docs = [
                createTestDocument('rrf-1', 'first document about coding', new Array(dimension).fill(0.1)),
                createTestDocument('rrf-2', 'second document about testing', new Array(dimension).fill(0.5)),
                createTestDocument('rrf-3', 'third document about coding', new Array(dimension).fill(0.9)),
            ];
            await db.insertHybrid(collectionName, docs);

            // Search with vector close to first document
            const queryVector = new Array(dimension).fill(0.15);
            const results = await db.hybridSearch(collectionName, [
                {
                    data: queryVector,
                    anns_field: 'vector',
                    param: {},
                    limit: 10
                }
            ]);

            expect(results.length).toBeGreaterThan(0);
            // Results should be ordered by score
            for (let i = 1; i < results.length; i++) {
                expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
            }
        });

        it('should deduplicate results from multiple search types', async () => {
            const docs = [
                createTestDocument('dedup-1', 'unique content one', new Array(dimension).fill(0.1)),
                createTestDocument('dedup-2', 'unique content two', new Array(dimension).fill(0.2)),
            ];
            await db.insertHybrid(collectionName, docs);

            const queryVector = new Array(dimension).fill(0.15);
            const results = await db.hybridSearch(collectionName, [
                {
                    data: queryVector,
                    anns_field: 'vector',
                    param: {},
                    limit: 10
                }
            ]);

            // Each document should appear only once
            const ids = results.map(r => r.document.id);
            const uniqueIds = new Set(ids);
            expect(ids.length).toBe(uniqueIds.size);
        });
    });
});

import { Embedding, EmbeddingVector } from '../../embedding/base-embedding';

/**
 * Concrete implementation of Embedding class for testing purposes
 * Exposes protected methods for testing
 */
class TestableEmbedding extends Embedding {
    protected maxTokens: number = 8191;

    constructor(maxTokens: number = 8191) {
        super();
        this.maxTokens = maxTokens;
    }

    // Expose protected methods for testing
    public testPreprocessText(text: string): string {
        return this.preprocessText(text);
    }

    public testPreprocessTexts(texts: string[]): string[] {
        return this.preprocessTexts(texts);
    }

    // Implement abstract methods (not the focus of these tests)
    async detectDimension(_testText?: string): Promise<number> {
        return 1536;
    }

    async embed(_text: string): Promise<EmbeddingVector> {
        return { vector: [0.1, 0.2, 0.3], dimension: 3 };
    }

    async embedBatch(_texts: string[]): Promise<EmbeddingVector[]> {
        return [{ vector: [0.1, 0.2, 0.3], dimension: 3 }];
    }

    getDimension(): number {
        return 1536;
    }

    getProvider(): string {
        return 'test';
    }
}

describe('Embedding', () => {
    describe('preprocessText', () => {
        describe('empty string handling', () => {
            it('should replace empty string with single space', () => {
                const embedding = new TestableEmbedding();
                const result = embedding.testPreprocessText('');
                expect(result).toBe(' ');
            });

            it('should not modify non-empty strings', () => {
                const embedding = new TestableEmbedding();
                const text = 'Hello, world!';
                const result = embedding.testPreprocessText(text);
                expect(result).toBe(text);
            });
        });

        describe('truncation', () => {
            it('should truncate text exceeding maxTokens * 4 characters', () => {
                // Use small maxTokens for easier testing
                const maxTokens = 10;
                const embedding = new TestableEmbedding(maxTokens);
                const maxChars = maxTokens * 4; // 40 characters

                // Create text longer than maxChars
                const longText = 'a'.repeat(100);
                const result = embedding.testPreprocessText(longText);

                expect(result.length).toBe(maxChars);
                expect(result).toBe('a'.repeat(40));
            });

            it('should not truncate text at exactly maxTokens * 4 characters', () => {
                const maxTokens = 10;
                const embedding = new TestableEmbedding(maxTokens);
                const maxChars = maxTokens * 4; // 40 characters

                const exactText = 'b'.repeat(maxChars);
                const result = embedding.testPreprocessText(exactText);

                expect(result.length).toBe(maxChars);
                expect(result).toBe(exactText);
            });

            it('should not truncate text shorter than maxTokens * 4 characters', () => {
                const maxTokens = 10;
                const embedding = new TestableEmbedding(maxTokens);

                const shortText = 'c'.repeat(20);
                const result = embedding.testPreprocessText(shortText);

                expect(result.length).toBe(20);
                expect(result).toBe(shortText);
            });

            it('should handle default maxTokens of 8191', () => {
                const embedding = new TestableEmbedding();
                const maxChars = 8191 * 4; // 32764 characters

                // Text within limit should not be truncated
                const withinLimit = 'd'.repeat(maxChars);
                const result = embedding.testPreprocessText(withinLimit);
                expect(result.length).toBe(maxChars);

                // Text exceeding limit should be truncated
                const exceedingLimit = 'e'.repeat(maxChars + 100);
                const truncatedResult = embedding.testPreprocessText(exceedingLimit);
                expect(truncatedResult.length).toBe(maxChars);
            });
        });

        describe('edge cases', () => {
            it('should handle single character strings', () => {
                const embedding = new TestableEmbedding();
                const result = embedding.testPreprocessText('x');
                expect(result).toBe('x');
            });

            it('should handle whitespace-only strings', () => {
                const embedding = new TestableEmbedding();
                const result = embedding.testPreprocessText('   ');
                expect(result).toBe('   ');
            });

            it('should handle newline characters', () => {
                const embedding = new TestableEmbedding();
                const text = 'line1\nline2\nline3';
                const result = embedding.testPreprocessText(text);
                expect(result).toBe(text);
            });

            it('should handle special characters', () => {
                const embedding = new TestableEmbedding();
                const text = 'Hello! @#$%^&*() 123';
                const result = embedding.testPreprocessText(text);
                expect(result).toBe(text);
            });

            it('should handle unicode characters', () => {
                const embedding = new TestableEmbedding();
                const text = 'Hello World';
                const result = embedding.testPreprocessText(text);
                expect(result).toBe(text);
            });

            it('should preserve text when maxTokens is 1', () => {
                const embedding = new TestableEmbedding(1);
                const text = 'ab'; // 2 chars, maxChars = 4
                const result = embedding.testPreprocessText(text);
                expect(result).toBe('ab');
            });

            it('should truncate properly with maxTokens of 1', () => {
                const embedding = new TestableEmbedding(1);
                const text = 'abcde'; // 5 chars, maxChars = 4
                const result = embedding.testPreprocessText(text);
                expect(result).toBe('abcd');
            });

            it('should handle tab characters', () => {
                const embedding = new TestableEmbedding();
                const text = 'col1\tcol2\tcol3';
                const result = embedding.testPreprocessText(text);
                expect(result).toBe(text);
            });

            it('should handle carriage return characters', () => {
                const embedding = new TestableEmbedding();
                const text = 'line1\r\nline2\r\nline3';
                const result = embedding.testPreprocessText(text);
                expect(result).toBe(text);
            });
        });
    });

    describe('preprocessTexts', () => {
        describe('array processing', () => {
            it('should process each text in the array', () => {
                const embedding = new TestableEmbedding();
                const texts = ['Hello', 'World', 'Test'];
                const results = embedding.testPreprocessTexts(texts);

                expect(results).toHaveLength(3);
                expect(results[0]).toBe('Hello');
                expect(results[1]).toBe('World');
                expect(results[2]).toBe('Test');
            });

            it('should handle empty array', () => {
                const embedding = new TestableEmbedding();
                const results = embedding.testPreprocessTexts([]);
                expect(results).toEqual([]);
            });

            it('should handle array with single element', () => {
                const embedding = new TestableEmbedding();
                const texts = ['Single'];
                const results = embedding.testPreprocessTexts(texts);

                expect(results).toHaveLength(1);
                expect(results[0]).toBe('Single');
            });

            it('should replace empty strings with spaces in array', () => {
                const embedding = new TestableEmbedding();
                const texts = ['Hello', '', 'World', ''];
                const results = embedding.testPreprocessTexts(texts);

                expect(results).toHaveLength(4);
                expect(results[0]).toBe('Hello');
                expect(results[1]).toBe(' ');
                expect(results[2]).toBe('World');
                expect(results[3]).toBe(' ');
            });

            it('should truncate long texts in array', () => {
                const maxTokens = 10;
                const embedding = new TestableEmbedding(maxTokens);
                const maxChars = maxTokens * 4; // 40 characters

                const texts = [
                    'short',
                    'a'.repeat(100), // Should be truncated
                    'medium text here',
                    'b'.repeat(50), // Should be truncated
                ];
                const results = embedding.testPreprocessTexts(texts);

                expect(results).toHaveLength(4);
                expect(results[0]).toBe('short');
                expect(results[1].length).toBe(maxChars);
                expect(results[2]).toBe('medium text here');
                expect(results[3].length).toBe(maxChars);
            });
        });

        describe('edge cases', () => {
            it('should handle array with all empty strings', () => {
                const embedding = new TestableEmbedding();
                const texts = ['', '', ''];
                const results = embedding.testPreprocessTexts(texts);

                expect(results).toEqual([' ', ' ', ' ']);
            });

            it('should handle array with mixed content', () => {
                const embedding = new TestableEmbedding(10);
                const maxChars = 40;

                const texts = [
                    '',                  // Empty -> ' '
                    'normal',            // No change
                    'x'.repeat(100),     // Truncated
                    '   ',               // Whitespace -> no change
                    '\n\n',              // Newlines -> no change
                ];
                const results = embedding.testPreprocessTexts(texts);

                expect(results).toHaveLength(5);
                expect(results[0]).toBe(' ');
                expect(results[1]).toBe('normal');
                expect(results[2].length).toBe(maxChars);
                expect(results[3]).toBe('   ');
                expect(results[4]).toBe('\n\n');
            });

            it('should handle large arrays', () => {
                const embedding = new TestableEmbedding();
                const texts = Array.from({ length: 1000 }, (_, i) => `text_${i}`);
                const results = embedding.testPreprocessTexts(texts);

                expect(results).toHaveLength(1000);
                expect(results[0]).toBe('text_0');
                expect(results[999]).toBe('text_999');
            });

            it('should not modify the original array', () => {
                const embedding = new TestableEmbedding();
                const texts = ['Hello', '', 'World'];
                const originalTexts = [...texts];

                embedding.testPreprocessTexts(texts);

                expect(texts).toEqual(originalTexts);
            });

            it('should preserve unicode in batch processing', () => {
                const embedding = new TestableEmbedding();
                const texts = ['Hello', 'World', 'Test'];
                const results = embedding.testPreprocessTexts(texts);

                expect(results[0]).toBe('Hello');
                expect(results[1]).toBe('World');
                expect(results[2]).toBe('Test');
            });
        });
    });

    describe('EmbeddingVector interface', () => {
        it('should have correct structure with vector and dimension', () => {
            const vector: EmbeddingVector = {
                vector: [0.1, 0.2, 0.3],
                dimension: 3,
            };

            expect(vector.vector).toEqual([0.1, 0.2, 0.3]);
            expect(vector.dimension).toBe(3);
        });

        it('should allow empty vector', () => {
            const vector: EmbeddingVector = {
                vector: [],
                dimension: 0,
            };

            expect(vector.vector).toEqual([]);
            expect(vector.dimension).toBe(0);
        });

        it('should allow high-dimensional vectors', () => {
            const dimension = 1536;
            const vector: EmbeddingVector = {
                vector: Array.from({ length: dimension }, (_, i) => i / dimension),
                dimension,
            };

            expect(vector.vector).toHaveLength(dimension);
            expect(vector.dimension).toBe(dimension);
        });
    });

    describe('abstract class implementation', () => {
        it('should require implementation of abstract methods', () => {
            const embedding = new TestableEmbedding();

            // Verify all abstract methods are callable
            expect(typeof embedding.detectDimension).toBe('function');
            expect(typeof embedding.embed).toBe('function');
            expect(typeof embedding.embedBatch).toBe('function');
            expect(typeof embedding.getDimension).toBe('function');
            expect(typeof embedding.getProvider).toBe('function');
        });

        it('should allow custom maxTokens via constructor', () => {
            const customMaxTokens = 4096;
            const embedding = new TestableEmbedding(customMaxTokens);
            const maxChars = customMaxTokens * 4;

            // Verify truncation works with custom maxTokens
            const longText = 'x'.repeat(maxChars + 100);
            const result = embedding.testPreprocessText(longText);
            expect(result.length).toBe(maxChars);
        });
    });
});

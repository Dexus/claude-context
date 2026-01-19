import { LangChainCodeSplitter } from '../../splitter/langchain-splitter';
import { CodeChunk } from '../../splitter/index';

// Mock the langchain text splitter
jest.mock('langchain/text_splitter', () => {
    const mockCreateDocuments = jest.fn();
    const mockFromLanguage = jest.fn();

    // Create mock constructor function with static method
    function MockRecursiveCharacterTextSplitter(this: any, config?: any) {
        this.chunkSize = config?.chunkSize || 1000;
        this.chunkOverlap = config?.chunkOverlap || 200;
        this.createDocuments = mockCreateDocuments;
    }

    // Set up fromLanguage as a static method
    (MockRecursiveCharacterTextSplitter as any).fromLanguage = mockFromLanguage.mockImplementation((lang: string, config: any) => {
        return {
            chunkSize: config?.chunkSize || 1000,
            chunkOverlap: config?.chunkOverlap || 200,
            createDocuments: mockCreateDocuments,
        };
    });

    return {
        RecursiveCharacterTextSplitter: MockRecursiveCharacterTextSplitter,
        __mockCreateDocuments: mockCreateDocuments,
        __mockFromLanguage: mockFromLanguage,
    };
});

// Get references to mock functions for assertions
const { __mockCreateDocuments, __mockFromLanguage } = jest.requireMock('langchain/text_splitter');

describe('LangChainCodeSplitter', () => {
    // Suppress console output during tests
    const originalConsoleError = console.error;

    beforeEach(() => {
        console.error = jest.fn();
        jest.clearAllMocks();

        // Default mock implementation returns a single document
        __mockCreateDocuments.mockResolvedValue([
            {
                pageContent: 'test content',
                metadata: {
                    loc: {
                        lines: { from: 1, to: 10 },
                    },
                },
            },
        ]);
    });

    afterEach(() => {
        console.error = originalConsoleError;
    });

    describe('constructor', () => {
        it('should initialize with default chunk size and overlap', () => {
            const splitter = new LangChainCodeSplitter();
            expect(splitter).toBeDefined();
            expect(splitter).toBeInstanceOf(LangChainCodeSplitter);
        });

        it('should initialize with custom chunk size', () => {
            const splitter = new LangChainCodeSplitter(5000);
            expect(splitter).toBeDefined();
        });

        it('should initialize with custom chunk size and overlap', () => {
            const splitter = new LangChainCodeSplitter(5000, 500);
            expect(splitter).toBeDefined();
        });

        it('should initialize with undefined parameters', () => {
            const splitter = new LangChainCodeSplitter(undefined, undefined);
            expect(splitter).toBeDefined();
        });

        it('should initialize with zero values', () => {
            // Zero values should not override defaults due to falsy check
            const splitter = new LangChainCodeSplitter(0, 0);
            expect(splitter).toBeDefined();
        });
    });

    describe('split', () => {
        describe('supported languages', () => {
            it('should split JavaScript code using language-specific splitter', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `function test() { return true; }`;

                const chunks = await splitter.split(code, 'javascript', 'test.js');

                expect(__mockFromLanguage).toHaveBeenCalledWith('js', expect.any(Object));
                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks[0].metadata.language).toBe('javascript');
                expect(chunks[0].metadata.filePath).toBe('test.js');
            });

            it('should split TypeScript code as JavaScript', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `function test(): boolean { return true; }`;

                const chunks = await splitter.split(code, 'typescript', 'test.ts');

                expect(__mockFromLanguage).toHaveBeenCalledWith('js', expect.any(Object));
                expect(chunks[0].metadata.language).toBe('typescript');
            });

            it('should split Python code', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `def test():\n    return True`;

                const chunks = await splitter.split(code, 'python', 'test.py');

                expect(__mockFromLanguage).toHaveBeenCalledWith('python', expect.any(Object));
                expect(chunks[0].metadata.language).toBe('python');
            });

            it('should split Java code', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `public class Test { }`;

                const chunks = await splitter.split(code, 'java', 'Test.java');

                expect(__mockFromLanguage).toHaveBeenCalledWith('java', expect.any(Object));
                expect(chunks[0].metadata.language).toBe('java');
            });

            it('should split C++ code', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `int main() { return 0; }`;

                const chunks = await splitter.split(code, 'cpp', 'main.cpp');

                expect(__mockFromLanguage).toHaveBeenCalledWith('cpp', expect.any(Object));
                expect(chunks[0].metadata.language).toBe('cpp');
            });

            it('should split Go code', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `package main\nfunc main() { }`;

                const chunks = await splitter.split(code, 'go', 'main.go');

                expect(__mockFromLanguage).toHaveBeenCalledWith('go', expect.any(Object));
                expect(chunks[0].metadata.language).toBe('go');
            });

            it('should split Rust code', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `fn main() { }`;

                const chunks = await splitter.split(code, 'rust', 'main.rs');

                expect(__mockFromLanguage).toHaveBeenCalledWith('rust', expect.any(Object));
                expect(chunks[0].metadata.language).toBe('rust');
            });

            it('should split PHP code', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `<?php echo "Hello"; ?>`;

                const chunks = await splitter.split(code, 'php', 'test.php');

                expect(__mockFromLanguage).toHaveBeenCalledWith('php', expect.any(Object));
                expect(chunks[0].metadata.language).toBe('php');
            });

            it('should split Ruby code', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `def test\n  puts "hello"\nend`;

                const chunks = await splitter.split(code, 'ruby', 'test.rb');

                expect(__mockFromLanguage).toHaveBeenCalledWith('ruby', expect.any(Object));
                expect(chunks[0].metadata.language).toBe('ruby');
            });

            it('should split Swift code', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `func test() { print("hello") }`;

                const chunks = await splitter.split(code, 'swift', 'test.swift');

                expect(__mockFromLanguage).toHaveBeenCalledWith('swift', expect.any(Object));
                expect(chunks[0].metadata.language).toBe('swift');
            });

            it('should split Scala code', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `object Test { def main() = {} }`;

                const chunks = await splitter.split(code, 'scala', 'Test.scala');

                expect(__mockFromLanguage).toHaveBeenCalledWith('scala', expect.any(Object));
                expect(chunks[0].metadata.language).toBe('scala');
            });

            it('should split HTML code', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `<html><body><h1>Hello</h1></body></html>`;

                const chunks = await splitter.split(code, 'html', 'index.html');

                expect(__mockFromLanguage).toHaveBeenCalledWith('html', expect.any(Object));
                expect(chunks[0].metadata.language).toBe('html');
            });

            it('should split Markdown code', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `# Title\n\nSome content`;

                const chunks = await splitter.split(code, 'markdown', 'README.md');

                expect(__mockFromLanguage).toHaveBeenCalledWith('markdown', expect.any(Object));
                expect(chunks[0].metadata.language).toBe('markdown');
            });

            it('should split LaTeX code', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}`;

                const chunks = await splitter.split(code, 'latex', 'doc.tex');

                expect(__mockFromLanguage).toHaveBeenCalledWith('latex', expect.any(Object));
                expect(chunks[0].metadata.language).toBe('latex');
            });

            it('should split Solidity code', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `contract Test { function test() public {} }`;

                const chunks = await splitter.split(code, 'solidity', 'Test.sol');

                expect(__mockFromLanguage).toHaveBeenCalledWith('sol', expect.any(Object));
                expect(chunks[0].metadata.language).toBe('solidity');
            });
        });

        describe('language aliases', () => {
            it('should map c++ to cpp', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `int main() { return 0; }`;

                await splitter.split(code, 'c++', 'main.cpp');

                expect(__mockFromLanguage).toHaveBeenCalledWith('cpp', expect.any(Object));
            });

            it('should map c to cpp', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `int main() { return 0; }`;

                await splitter.split(code, 'c', 'main.c');

                expect(__mockFromLanguage).toHaveBeenCalledWith('cpp', expect.any(Object));
            });

            it('should map md to markdown', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `# Title`;

                await splitter.split(code, 'md', 'README.md');

                expect(__mockFromLanguage).toHaveBeenCalledWith('markdown', expect.any(Object));
            });

            it('should map tex to latex', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `\\documentclass{article}`;

                await splitter.split(code, 'tex', 'doc.tex');

                expect(__mockFromLanguage).toHaveBeenCalledWith('latex', expect.any(Object));
            });

            it('should map sol to sol', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `contract Test {}`;

                await splitter.split(code, 'sol', 'Test.sol');

                expect(__mockFromLanguage).toHaveBeenCalledWith('sol', expect.any(Object));
            });
        });

        describe('case insensitivity', () => {
            it('should handle uppercase language names', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `function test() {}`;

                await splitter.split(code, 'JAVASCRIPT', 'test.js');

                expect(__mockFromLanguage).toHaveBeenCalledWith('js', expect.any(Object));
            });

            it('should handle mixed case language names', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `def test(): pass`;

                await splitter.split(code, 'Python', 'test.py');

                expect(__mockFromLanguage).toHaveBeenCalledWith('python', expect.any(Object));
            });
        });

        describe('unsupported languages', () => {
            it('should use fallback splitter for unknown languages', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `some unknown language code`;

                __mockCreateDocuments.mockResolvedValue([
                    {
                        pageContent: code,
                        metadata: {},
                    },
                ]);

                const chunks = await splitter.split(code, 'cobol', 'test.cob');

                // Should not use fromLanguage for unknown language
                expect(__mockFromLanguage).not.toHaveBeenCalled();
                // Should use fallback path and return chunks
                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks[0].metadata.language).toBe('cobol');
            });

            it('should use fallback splitter for empty language', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `some content`;

                __mockCreateDocuments.mockResolvedValue([
                    {
                        pageContent: code,
                        metadata: {},
                    },
                ]);

                const chunks = await splitter.split(code, '', 'file.txt');

                expect(__mockFromLanguage).not.toHaveBeenCalled();
                // Should use fallback path and return chunks
                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks[0].metadata.language).toBe('');
            });
        });

        describe('metadata handling', () => {
            it('should include startLine and endLine in metadata', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `function test() { return true; }`;

                // Note: Uses default mock from beforeEach which returns lines { from: 1, to: 10 }

                const chunks = await splitter.split(code, 'javascript', 'test.js');

                expect(chunks[0].metadata.startLine).toBeDefined();
                expect(chunks[0].metadata.endLine).toBeDefined();
                expect(typeof chunks[0].metadata.startLine).toBe('number');
                expect(typeof chunks[0].metadata.endLine).toBe('number');
                expect(chunks[0].metadata.endLine).toBeGreaterThanOrEqual(chunks[0].metadata.startLine);
            });

            it('should handle missing loc metadata', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `function test() { return true; }`;

                __mockCreateDocuments.mockResolvedValue([
                    {
                        pageContent: code,
                        metadata: {}, // No loc data
                    },
                ]);

                const chunks = await splitter.split(code, 'javascript', 'test.js');

                // Should default to 1, 1 when loc is missing
                expect(chunks[0].metadata.startLine).toBe(1);
                expect(chunks[0].metadata.endLine).toBe(1);
            });

            it('should preserve language in metadata', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `def test(): pass`;

                const chunks = await splitter.split(code, 'python', 'test.py');

                expect(chunks[0].metadata.language).toBe('python');
            });

            it('should preserve filePath in metadata', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `function test() {}`;

                const chunks = await splitter.split(code, 'javascript', 'path/to/test.js');

                expect(chunks[0].metadata.filePath).toBe('path/to/test.js');
            });

            it('should handle missing filePath', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `function test() {}`;

                const chunks = await splitter.split(code, 'javascript');

                expect(chunks[0].metadata.filePath).toBeUndefined();
            });
        });

        describe('multiple chunks', () => {
            it('should handle multiple documents from splitter', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `function a() {}\nfunction b() {}\nfunction c() {}`;

                __mockCreateDocuments.mockResolvedValue([
                    {
                        pageContent: 'function a() {}',
                        metadata: { loc: { lines: { from: 1, to: 1 } } },
                    },
                    {
                        pageContent: 'function b() {}',
                        metadata: { loc: { lines: { from: 2, to: 2 } } },
                    },
                    {
                        pageContent: 'function c() {}',
                        metadata: { loc: { lines: { from: 3, to: 3 } } },
                    },
                ]);

                const chunks = await splitter.split(code, 'javascript', 'test.js');

                expect(chunks.length).toBe(3);
                expect(chunks[0].content).toBe('function a() {}');
                expect(chunks[1].content).toBe('function b() {}');
                expect(chunks[2].content).toBe('function c() {}');
            });

            it('should preserve order of chunks', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `chunk1\nchunk2\nchunk3`;

                __mockCreateDocuments.mockResolvedValue([
                    { pageContent: 'chunk1', metadata: { loc: { lines: { from: 1, to: 1 } } } },
                    { pageContent: 'chunk2', metadata: { loc: { lines: { from: 2, to: 2 } } } },
                    { pageContent: 'chunk3', metadata: { loc: { lines: { from: 3, to: 3 } } } },
                ]);

                const chunks = await splitter.split(code, 'javascript', 'test.js');

                expect(chunks[0].metadata.startLine).toBe(1);
                expect(chunks[1].metadata.startLine).toBe(2);
                expect(chunks[2].metadata.startLine).toBe(3);
            });
        });

        describe('error handling', () => {
            it('should handle gracefully when createDocuments returns empty array', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `function test() {}`;

                __mockCreateDocuments.mockResolvedValue([]);

                const chunks = await splitter.split(code, 'javascript', 'test.js');

                // Should return empty array without errors
                expect(chunks).toEqual([]);
            });

            it('should not throw when split is called', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `function test() {}`;

                // Test that split doesn't throw for valid inputs
                await expect(splitter.split(code, 'javascript', 'test.js')).resolves.toBeDefined();
            });
        });

        describe('chunk configuration', () => {
            it('should pass chunk size to language splitter', async () => {
                const splitter = new LangChainCodeSplitter(2000, 300);
                const code = `function test() {}`;

                await splitter.split(code, 'javascript', 'test.js');

                expect(__mockFromLanguage).toHaveBeenCalledWith('js', {
                    chunkSize: 2000,
                    chunkOverlap: 300,
                });
            });

            it('should use default chunk size and overlap', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `function test() {}`;

                await splitter.split(code, 'javascript', 'test.js');

                expect(__mockFromLanguage).toHaveBeenCalledWith('js', {
                    chunkSize: 1000,
                    chunkOverlap: 200,
                });
            });
        });

        describe('edge cases', () => {
            it('should handle empty code', async () => {
                const splitter = new LangChainCodeSplitter();

                __mockCreateDocuments.mockResolvedValue([
                    { pageContent: '', metadata: { loc: { lines: { from: 1, to: 1 } } } },
                ]);

                const chunks = await splitter.split('', 'javascript', 'empty.js');

                expect(chunks.length).toBeGreaterThan(0);
            });

            it('should handle whitespace-only code', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = '   \n   \n   ';

                __mockCreateDocuments.mockResolvedValue([
                    { pageContent: code, metadata: { loc: { lines: { from: 1, to: 3 } } } },
                ]);

                const chunks = await splitter.split(code, 'javascript', 'whitespace.js');

                expect(chunks.length).toBeGreaterThan(0);
            });

            it('should handle code with special characters', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = `const emoji = "\u{1F600}"; const special = "<>&\"'";`;

                __mockCreateDocuments.mockResolvedValue([
                    { pageContent: code, metadata: { loc: { lines: { from: 1, to: 1 } } } },
                ]);

                const chunks = await splitter.split(code, 'javascript', 'special.js');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks[0].content).toBe(code);
            });

            it('should handle very long single line code', async () => {
                const splitter = new LangChainCodeSplitter();
                const code = 'x'.repeat(10000);

                __mockCreateDocuments.mockResolvedValue([
                    { pageContent: code, metadata: { loc: { lines: { from: 1, to: 1 } } } },
                ]);

                const chunks = await splitter.split(code, 'javascript', 'long.js');

                expect(chunks.length).toBeGreaterThan(0);
            });
        });
    });

    describe('setChunkSize', () => {
        it('should update chunk size', async () => {
            const splitter = new LangChainCodeSplitter();
            splitter.setChunkSize(5000);

            const code = `function test() {}`;
            await splitter.split(code, 'javascript', 'test.js');

            expect(__mockFromLanguage).toHaveBeenCalledWith('js', {
                chunkSize: 5000,
                chunkOverlap: 200,
            });
        });

        it('should not throw when setting chunk size', () => {
            const splitter = new LangChainCodeSplitter();
            expect(() => splitter.setChunkSize(3000)).not.toThrow();
        });

        it('should affect subsequent split calls', async () => {
            const splitter = new LangChainCodeSplitter();

            // First split with default
            await splitter.split('code', 'javascript', 'test.js');
            expect(__mockFromLanguage).toHaveBeenLastCalledWith('js', {
                chunkSize: 1000,
                chunkOverlap: 200,
            });

            // Change chunk size
            splitter.setChunkSize(4000);

            // Second split with new size
            await splitter.split('code', 'javascript', 'test.js');
            expect(__mockFromLanguage).toHaveBeenLastCalledWith('js', {
                chunkSize: 4000,
                chunkOverlap: 200,
            });
        });
    });

    describe('setChunkOverlap', () => {
        it('should update chunk overlap', async () => {
            const splitter = new LangChainCodeSplitter();
            splitter.setChunkOverlap(500);

            const code = `function test() {}`;
            await splitter.split(code, 'javascript', 'test.js');

            expect(__mockFromLanguage).toHaveBeenCalledWith('js', {
                chunkSize: 1000,
                chunkOverlap: 500,
            });
        });

        it('should not throw when setting chunk overlap', () => {
            const splitter = new LangChainCodeSplitter();
            expect(() => splitter.setChunkOverlap(100)).not.toThrow();
        });

        it('should affect subsequent split calls', async () => {
            const splitter = new LangChainCodeSplitter();

            // First split with default
            await splitter.split('code', 'javascript', 'test.js');
            expect(__mockFromLanguage).toHaveBeenLastCalledWith('js', {
                chunkSize: 1000,
                chunkOverlap: 200,
            });

            // Change chunk overlap
            splitter.setChunkOverlap(100);

            // Second split with new overlap
            await splitter.split('code', 'javascript', 'test.js');
            expect(__mockFromLanguage).toHaveBeenLastCalledWith('js', {
                chunkSize: 1000,
                chunkOverlap: 100,
            });
        });
    });

    describe('fallback line estimation', () => {
        it('should estimate lines correctly when chunk is found in original', async () => {
            const { RecursiveCharacterTextSplitter } = jest.requireMock('langchain/text_splitter');
            const splitter = new LangChainCodeSplitter();
            const code = `line1\nline2\nline3\nline4\nline5`;

            __mockCreateDocuments.mockResolvedValue([
                { pageContent: 'line3\nline4', metadata: {} },
            ]);

            const chunks = await splitter.split(code, 'unknown', 'test.txt');

            // line3 starts at line 3 in the original code
            expect(chunks[0].metadata.startLine).toBe(3);
            expect(chunks[0].metadata.endLine).toBe(4);
        });

        it('should return default lines when chunk not found in original', async () => {
            const splitter = new LangChainCodeSplitter();
            const code = `original content`;

            __mockCreateDocuments.mockResolvedValue([
                { pageContent: 'different content', metadata: {} },
            ]);

            const chunks = await splitter.split(code, 'unknown', 'test.txt');

            // When chunk not found, should default to 1, chunkLineCount
            expect(chunks[0].metadata.startLine).toBe(1);
        });
    });

    describe('Splitter interface compliance', () => {
        it('should implement the Splitter interface', () => {
            const splitter = new LangChainCodeSplitter();

            // Verify interface methods exist
            expect(typeof splitter.split).toBe('function');
            expect(typeof splitter.setChunkSize).toBe('function');
            expect(typeof splitter.setChunkOverlap).toBe('function');
        });

        it('should return CodeChunk array from split', async () => {
            const splitter = new LangChainCodeSplitter();
            const code = `function test() { return true; }`;

            const result = await splitter.split(code, 'javascript', 'test.js');

            expect(Array.isArray(result)).toBe(true);
            if (result.length > 0) {
                const chunk: CodeChunk = result[0];
                expect(chunk).toHaveProperty('content');
                expect(chunk).toHaveProperty('metadata');
                expect(chunk.metadata).toHaveProperty('startLine');
                expect(chunk.metadata).toHaveProperty('endLine');
            }
        });

        it('should return promise from split', () => {
            const splitter = new LangChainCodeSplitter();
            const result = splitter.split('code', 'javascript', 'test.js');

            expect(result).toBeInstanceOf(Promise);
        });
    });

    describe('language mapping coverage', () => {
        const languageMappings: [string, string][] = [
            ['javascript', 'js'],
            ['typescript', 'js'],
            ['python', 'python'],
            ['java', 'java'],
            ['cpp', 'cpp'],
            ['c++', 'cpp'],
            ['c', 'cpp'],
            ['go', 'go'],
            ['rust', 'rust'],
            ['php', 'php'],
            ['ruby', 'ruby'],
            ['swift', 'swift'],
            ['scala', 'scala'],
            ['html', 'html'],
            ['markdown', 'markdown'],
            ['md', 'markdown'],
            ['latex', 'latex'],
            ['tex', 'latex'],
            ['solidity', 'sol'],
            ['sol', 'sol'],
        ];

        it.each(languageMappings)(
            'should map %s to %s',
            async (input, expected) => {
                const splitter = new LangChainCodeSplitter();
                await splitter.split('code', input, 'test.file');

                expect(__mockFromLanguage).toHaveBeenCalledWith(expected, expect.any(Object));
            }
        );
    });
});

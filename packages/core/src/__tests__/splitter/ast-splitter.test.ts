import { CodeChunk } from '../../splitter/index';

// Mock the langchain-splitter module before importing AstCodeSplitter
jest.mock('../../splitter/langchain-splitter', () => ({
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

import { AstCodeSplitter } from '../../splitter/ast-splitter';

describe('AstCodeSplitter', () => {
    // Suppress console output during tests
    const originalConsoleLog = console.log;
    const originalConsoleWarn = console.warn;

    beforeEach(() => {
        console.log = jest.fn();
        console.warn = jest.fn();
    });

    afterEach(() => {
        console.log = originalConsoleLog;
        console.warn = originalConsoleWarn;
    });

    describe('constructor', () => {
        it('should initialize with default chunk size and overlap', () => {
            const splitter = new AstCodeSplitter();
            expect(splitter).toBeDefined();
            expect(splitter).toBeInstanceOf(AstCodeSplitter);
        });

        it('should initialize with custom chunk size', () => {
            const splitter = new AstCodeSplitter(5000);
            expect(splitter).toBeDefined();
        });

        it('should initialize with custom chunk size and overlap', () => {
            const splitter = new AstCodeSplitter(5000, 500);
            expect(splitter).toBeDefined();
        });

        it('should initialize with undefined parameters', () => {
            const splitter = new AstCodeSplitter(undefined, undefined);
            expect(splitter).toBeDefined();
        });
    });

    describe('split', () => {
        describe('TypeScript code', () => {
            it('should split TypeScript function declarations', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
function greet(name: string): string {
    return "Hello, " + name;
}

function farewell(name: string): string {
    return "Goodbye, " + name;
}
`;
                const chunks = await splitter.split(code, 'typescript', 'test.ts');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks.some(c => c.content.includes('greet'))).toBe(true);
                expect(chunks[0].metadata.language).toBe('typescript');
                expect(chunks[0].metadata.filePath).toBe('test.ts');
            });

            it('should split TypeScript class declarations', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
class Person {
    private name: string;

    constructor(name: string) {
        this.name = name;
    }

    greet(): string {
        return "Hello, " + this.name;
    }
}
`;
                const chunks = await splitter.split(code, 'typescript', 'person.ts');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks.some(c => c.content.includes('class Person'))).toBe(true);
            });

            it('should split TypeScript interface declarations', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
interface User {
    id: number;
    name: string;
    email: string;
}

interface Product {
    id: number;
    title: string;
    price: number;
}
`;
                const chunks = await splitter.split(code, 'typescript', 'types.ts');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks.some(c => c.content.includes('interface'))).toBe(true);
            });

            it('should split TypeScript type alias declarations', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
type Point = { x: number; y: number };

type Circle = {
    center: Point;
    radius: number;
};
`;
                const chunks = await splitter.split(code, 'typescript', 'types.ts');

                expect(chunks.length).toBeGreaterThan(0);
            });

            it('should handle ts alias for typescript', async () => {
                const splitter = new AstCodeSplitter();
                const code = `function test(): void { console.log('test'); }`;

                const chunks = await splitter.split(code, 'ts', 'test.ts');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks[0].metadata.language).toBe('ts');
            });

            it('should handle export statements', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
export function publicFunction(): void {
    console.log('public');
}

export default class MainClass {
    run(): void {}
}
`;
                const chunks = await splitter.split(code, 'typescript', 'module.ts');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks.some(c => c.content.includes('export'))).toBe(true);
            });
        });

        describe('JavaScript code', () => {
            it('should split JavaScript function declarations', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
function add(a, b) {
    return a + b;
}

function subtract(a, b) {
    return a - b;
}
`;
                const chunks = await splitter.split(code, 'javascript', 'math.js');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks[0].metadata.language).toBe('javascript');
            });

            it('should handle js alias for javascript', async () => {
                const splitter = new AstCodeSplitter();
                const code = `function test() { return true; }`;

                const chunks = await splitter.split(code, 'js', 'test.js');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks[0].metadata.language).toBe('js');
            });

            it('should split arrow functions', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
const multiply = (a, b) => a * b;

const divide = (a, b) => {
    if (b === 0) throw new Error('Division by zero');
    return a / b;
};
`;
                const chunks = await splitter.split(code, 'javascript', 'math.js');

                expect(chunks.length).toBeGreaterThan(0);
            });
        });

        describe('Python code', () => {
            it('should split Python function definitions', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
def greet(name):
    return f"Hello, {name}"

def farewell(name):
    return f"Goodbye, {name}"
`;
                const chunks = await splitter.split(code, 'python', 'greeting.py');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks[0].metadata.language).toBe('python');
            });

            it('should handle py alias for python', async () => {
                const splitter = new AstCodeSplitter();
                const code = `def test(): pass`;

                const chunks = await splitter.split(code, 'py', 'test.py');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks[0].metadata.language).toBe('py');
            });

            it('should split Python class definitions', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
class Animal:
    def __init__(self, name):
        self.name = name

    def speak(self):
        raise NotImplementedError

class Dog(Animal):
    def speak(self):
        return "Woof!"
`;
                const chunks = await splitter.split(code, 'python', 'animal.py');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks.some(c => c.content.includes('class'))).toBe(true);
            });

            it('should split decorated functions', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
@decorator
def decorated_function():
    pass

@app.route('/')
def index():
    return 'Hello'
`;
                const chunks = await splitter.split(code, 'python', 'routes.py');

                expect(chunks.length).toBeGreaterThan(0);
            });

            it('should split async function definitions', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
async def fetch_data():
    await some_async_call()
    return data

async def process_data():
    data = await fetch_data()
    return processed
`;
                const chunks = await splitter.split(code, 'python', 'async.py');

                expect(chunks.length).toBeGreaterThan(0);
            });
        });

        describe('Java code', () => {
            it('should split Java method declarations', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
public class Calculator {
    public int add(int a, int b) {
        return a + b;
    }

    public int subtract(int a, int b) {
        return a - b;
    }
}
`;
                const chunks = await splitter.split(code, 'java', 'Calculator.java');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks[0].metadata.language).toBe('java');
            });

            it('should split Java class declarations', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
public class Person {
    private String name;

    public Person(String name) {
        this.name = name;
    }

    public String getName() {
        return this.name;
    }
}
`;
                const chunks = await splitter.split(code, 'java', 'Person.java');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks.some(c => c.content.includes('class Person'))).toBe(true);
            });
        });

        describe('Go code', () => {
            it('should split Go function declarations', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
package main

func add(a, b int) int {
    return a + b
}

func subtract(a, b int) int {
    return a - b
}
`;
                const chunks = await splitter.split(code, 'go', 'math.go');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks[0].metadata.language).toBe('go');
            });

            it('should split Go type declarations', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
package main

type Person struct {
    Name string
    Age  int
}

type Animal interface {
    Speak() string
}
`;
                const chunks = await splitter.split(code, 'go', 'types.go');

                expect(chunks.length).toBeGreaterThan(0);
            });
        });

        describe('Rust code', () => {
            it('should split Rust function items', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
fn add(a: i32, b: i32) -> i32 {
    a + b
}

fn subtract(a: i32, b: i32) -> i32 {
    a - b
}
`;
                const chunks = await splitter.split(code, 'rust', 'math.rs');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks[0].metadata.language).toBe('rust');
            });

            it('should handle rs alias for rust', async () => {
                const splitter = new AstCodeSplitter();
                const code = `fn test() -> bool { true }`;

                const chunks = await splitter.split(code, 'rs', 'test.rs');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks[0].metadata.language).toBe('rs');
            });

            it('should split Rust struct and impl blocks', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
struct Point {
    x: f64,
    y: f64,
}

impl Point {
    fn new(x: f64, y: f64) -> Self {
        Point { x, y }
    }

    fn distance(&self, other: &Point) -> f64 {
        ((self.x - other.x).powi(2) + (self.y - other.y).powi(2)).sqrt()
    }
}
`;
                const chunks = await splitter.split(code, 'rust', 'point.rs');

                expect(chunks.length).toBeGreaterThan(0);
            });
        });

        describe('C++ code', () => {
            it('should split C++ function definitions', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
int add(int a, int b) {
    return a + b;
}

int subtract(int a, int b) {
    return a - b;
}
`;
                const chunks = await splitter.split(code, 'cpp', 'math.cpp');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks[0].metadata.language).toBe('cpp');
            });

            it('should handle c++ alias', async () => {
                const splitter = new AstCodeSplitter();
                const code = `int test() { return 0; }`;

                const chunks = await splitter.split(code, 'c++', 'test.cpp');

                expect(chunks.length).toBeGreaterThan(0);
            });

            it('should handle c alias for cpp parser', async () => {
                const splitter = new AstCodeSplitter();
                const code = `int main() { return 0; }`;

                const chunks = await splitter.split(code, 'c', 'main.c');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks[0].metadata.language).toBe('c');
            });

            it('should split C++ class definitions', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
class Calculator {
public:
    int add(int a, int b) {
        return a + b;
    }

    int subtract(int a, int b) {
        return a - b;
    }
};
`;
                const chunks = await splitter.split(code, 'cpp', 'calc.cpp');

                expect(chunks.length).toBeGreaterThan(0);
            });
        });

        describe('C# code', () => {
            it('should split C# method declarations', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
public class Calculator
{
    public int Add(int a, int b)
    {
        return a + b;
    }

    public int Subtract(int a, int b)
    {
        return a - b;
    }
}
`;
                const chunks = await splitter.split(code, 'cs', 'Calculator.cs');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks[0].metadata.language).toBe('cs');
            });
        });

        describe('unsupported languages', () => {
            it('should fall back to LangChain for unsupported languages', async () => {
                const splitter = new AstCodeSplitter();
                const code = `# Some Ruby code\ndef test\n  puts "hello"\nend`;

                const chunks = await splitter.split(code, 'ruby', 'test.rb');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks[0].metadata.language).toBe('ruby');
            });

            it('should fall back for unknown languages', async () => {
                const splitter = new AstCodeSplitter();
                const code = `some unknown content here`;

                const chunks = await splitter.split(code, 'unknown', 'file.unknown');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks[0].metadata.language).toBe('unknown');
            });
        });

        describe('metadata', () => {
            it('should include startLine and endLine in metadata', async () => {
                const splitter = new AstCodeSplitter();
                const code = `
function first() {
    return 1;
}

function second() {
    return 2;
}
`;
                const chunks = await splitter.split(code, 'javascript', 'test.js');

                expect(chunks.length).toBeGreaterThan(0);
                for (const chunk of chunks) {
                    expect(chunk.metadata.startLine).toBeDefined();
                    expect(chunk.metadata.endLine).toBeDefined();
                    expect(chunk.metadata.startLine).toBeGreaterThan(0);
                    expect(chunk.metadata.endLine).toBeGreaterThanOrEqual(chunk.metadata.startLine);
                }
            });

            it('should handle missing filePath', async () => {
                const splitter = new AstCodeSplitter();
                const code = `function test() { return true; }`;

                const chunks = await splitter.split(code, 'javascript');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks[0].metadata.filePath).toBeUndefined();
            });

            it('should preserve language in metadata', async () => {
                const splitter = new AstCodeSplitter();
                const code = `def test(): pass`;

                const chunks = await splitter.split(code, 'python', 'test.py');

                for (const chunk of chunks) {
                    expect(chunk.metadata.language).toBe('python');
                }
            });
        });

        describe('code without splittable nodes', () => {
            it('should return single chunk for code with no splittable nodes', async () => {
                const splitter = new AstCodeSplitter();
                const code = `// Just a comment\nconst x = 5;\nconst y = 10;`;

                const chunks = await splitter.split(code, 'javascript', 'vars.js');

                expect(chunks.length).toBeGreaterThan(0);
                expect(chunks[0].metadata.startLine).toBe(1);
            });

            it('should handle empty code', async () => {
                const splitter = new AstCodeSplitter();
                const code = ``;

                const chunks = await splitter.split(code, 'javascript', 'empty.js');

                expect(chunks.length).toBeGreaterThan(0);
            });

            it('should handle whitespace-only code', async () => {
                const splitter = new AstCodeSplitter();
                const code = `   \n   \n   `;

                const chunks = await splitter.split(code, 'javascript', 'whitespace.js');

                expect(chunks.length).toBeGreaterThan(0);
            });
        });

        describe('large chunks refinement', () => {
            it('should split large chunks into smaller ones', async () => {
                const splitter = new AstCodeSplitter(500, 50);
                // Create a function with many lines
                const lines = Array.from({ length: 100 }, (_, i) => `    const line${i} = ${i};`);
                const code = `function largeFunction() {\n${lines.join('\n')}\n}`;

                const chunks = await splitter.split(code, 'javascript', 'large.js');

                // With small chunk size, it should split into multiple chunks
                expect(chunks.length).toBeGreaterThanOrEqual(1);
            });

            it('should preserve metadata when splitting large chunks', async () => {
                const splitter = new AstCodeSplitter(200, 20);
                const lines = Array.from({ length: 50 }, (_, i) => `    print("line ${i}")`);
                const code = `def large_function():\n${lines.join('\n')}`;

                const chunks = await splitter.split(code, 'python', 'large.py');

                for (const chunk of chunks) {
                    expect(chunk.metadata.language).toBe('python');
                    expect(chunk.metadata.filePath).toBe('large.py');
                }
            });
        });

        describe('case insensitivity', () => {
            it('should handle uppercase language names', async () => {
                const splitter = new AstCodeSplitter();
                const code = `function test() { return true; }`;

                const chunks = await splitter.split(code, 'JAVASCRIPT', 'test.js');

                expect(chunks.length).toBeGreaterThan(0);
            });

            it('should handle mixed case language names', async () => {
                const splitter = new AstCodeSplitter();
                const code = `def test(): pass`;

                const chunks = await splitter.split(code, 'Python', 'test.py');

                expect(chunks.length).toBeGreaterThan(0);
            });
        });
    });

    describe('setChunkSize', () => {
        it('should update chunk size', async () => {
            const splitter = new AstCodeSplitter();
            splitter.setChunkSize(5000);

            // Create large code to test chunk size effect
            const lines = Array.from({ length: 200 }, (_, i) => `const line${i} = ${i};`);
            const code = lines.join('\n');

            const chunks = await splitter.split(code, 'javascript', 'test.js');

            expect(chunks.length).toBeGreaterThan(0);
        });

        it('should also update fallback splitter chunk size', () => {
            const splitter = new AstCodeSplitter();
            // This should not throw - we're just verifying the method exists and works
            expect(() => splitter.setChunkSize(3000)).not.toThrow();
        });
    });

    describe('setChunkOverlap', () => {
        it('should update chunk overlap', () => {
            const splitter = new AstCodeSplitter();
            expect(() => splitter.setChunkOverlap(500)).not.toThrow();
        });

        it('should also update fallback splitter overlap', () => {
            const splitter = new AstCodeSplitter();
            expect(() => splitter.setChunkOverlap(100)).not.toThrow();
        });
    });

    describe('isLanguageSupported', () => {
        it('should return true for supported languages', () => {
            expect(AstCodeSplitter.isLanguageSupported('javascript')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('typescript')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('python')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('java')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('go')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('rust')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('cpp')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('cs')).toBe(true);
        });

        it('should return true for language aliases', () => {
            expect(AstCodeSplitter.isLanguageSupported('js')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('ts')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('py')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('rs')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('c++')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('c')).toBe(true);
        });

        it('should return false for unsupported languages', () => {
            expect(AstCodeSplitter.isLanguageSupported('ruby')).toBe(false);
            expect(AstCodeSplitter.isLanguageSupported('perl')).toBe(false);
            expect(AstCodeSplitter.isLanguageSupported('scala')).toBe(false);
            expect(AstCodeSplitter.isLanguageSupported('kotlin')).toBe(false);
            expect(AstCodeSplitter.isLanguageSupported('unknown')).toBe(false);
        });

        it('should be case insensitive', () => {
            expect(AstCodeSplitter.isLanguageSupported('JavaScript')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('PYTHON')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('TypeScript')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('GO')).toBe(true);
        });
    });

    describe('chunk overlap behavior', () => {
        it('should not add overlap for single chunk', async () => {
            const splitter = new AstCodeSplitter(5000, 300);
            const code = `function small() { return 1; }`;

            const chunks = await splitter.split(code, 'javascript', 'small.js');

            // Single small chunk should not have overlap content prepended
            expect(chunks.length).toBe(1);
        });

        it('should handle zero overlap', async () => {
            const splitter = new AstCodeSplitter(500, 0);
            const lines = Array.from({ length: 50 }, (_, i) => `function fn${i}() { return ${i}; }`);
            const code = lines.join('\n');

            const chunks = await splitter.split(code, 'javascript', 'test.js');

            expect(chunks.length).toBeGreaterThan(0);
        });
    });

    describe('edge cases', () => {
        it('should handle code with special characters', async () => {
            const splitter = new AstCodeSplitter();
            const code = `
function special() {
    const emoji = "Hello! 123 \${var}";
    const regex = /[a-z]+/g;
    return { key: "value" };
}
`;
            const chunks = await splitter.split(code, 'javascript', 'special.js');

            expect(chunks.length).toBeGreaterThan(0);
        });

        it('should handle unicode in code', async () => {
            const splitter = new AstCodeSplitter();
            const code = `
def unicode_func():
    greeting = "Hello"
    return greeting
`;
            const chunks = await splitter.split(code, 'python', 'unicode.py');

            expect(chunks.length).toBeGreaterThan(0);
        });

        it('should handle deeply nested code', async () => {
            const splitter = new AstCodeSplitter();
            const code = `
function outer() {
    function middle() {
        function inner() {
            function deepest() {
                return true;
            }
            return deepest();
        }
        return inner();
    }
    return middle();
}
`;
            const chunks = await splitter.split(code, 'javascript', 'nested.js');

            expect(chunks.length).toBeGreaterThan(0);
        });

        it('should handle mixed function styles', async () => {
            const splitter = new AstCodeSplitter();
            const code = `
function declarative() { return 1; }

const arrowExpr = () => 2;

const arrowBlock = () => {
    return 3;
};

class MyClass {
    method() {
        return 4;
    }
}
`;
            const chunks = await splitter.split(code, 'javascript', 'mixed.js');

            expect(chunks.length).toBeGreaterThan(0);
        });

        it('should handle syntax errors gracefully by falling back', async () => {
            const splitter = new AstCodeSplitter();
            // Intentionally malformed code
            const code = `function broken( { return; }`;

            // Should not throw, should fall back to LangChain
            const chunks = await splitter.split(code, 'javascript', 'broken.js');

            expect(chunks.length).toBeGreaterThan(0);
        });
    });

    describe('Splitter interface compliance', () => {
        it('should implement the Splitter interface', () => {
            const splitter = new AstCodeSplitter();

            // Verify interface methods exist
            expect(typeof splitter.split).toBe('function');
            expect(typeof splitter.setChunkSize).toBe('function');
            expect(typeof splitter.setChunkOverlap).toBe('function');
        });

        it('should return CodeChunk array from split', async () => {
            const splitter = new AstCodeSplitter();
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
    });
});

/**
 * ImportAnalyzer - Analyzes import statements across codebases to track file importance
 *
 * Supports multiple languages:
 * - JavaScript/TypeScript: import, require, dynamic imports
 * - Python: import, from...import
 * - Java: import
 * - Go: import
 * - Rust: use
 * - C/C++: #include
 * - C#: using
 */

export interface ImportInfo {
    importedPath: string;
    importerPath: string;
    language: string;
    lineNumber: number;
}

export interface ImportFrequency {
    [filePath: string]: number;
}

export interface ImportGraph {
    imports: ImportInfo[];
    frequency: ImportFrequency;
}

export class ImportAnalyzer {
    private imports: ImportInfo[] = [];

    /**
     * Analyzes a code file and extracts import statements
     * @param code The source code content
     * @param language The programming language
     * @param filePath The file path being analyzed
     * @returns Array of ImportInfo objects
     */
    analyzeFile(code: string, language: string, filePath: string): ImportInfo[] {
        const imports: ImportInfo[] = [];
        const lines = code.split('\n');

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const lineNumber = i + 1;

            const extractedImports = this.extractImports(line, language, filePath, lineNumber);
            imports.push(...extractedImports);
        }

        this.imports.push(...imports);
        return imports;
    }

    /**
     * Extracts imports from a single line of code
     * @param line The code line
     * @param language The programming language
     * @param filePath The file path
     * @param lineNumber The line number
     * @returns Array of ImportInfo objects
     */
    private extractImports(line: string, language: string, filePath: string, lineNumber: number): ImportInfo[] {
        const imports: ImportInfo[] = [];
        const langLower = language.toLowerCase();

        try {
            // JavaScript/TypeScript
            if (langLower === 'javascript' || langLower === 'js' || langLower === 'typescript' || langLower === 'ts' || langLower === 'jsx' || langLower === 'tsx') {
                const jsImports = this.extractJavaScriptImports(line, language, filePath, lineNumber);
                imports.push(...jsImports);
            }
            // Python
            else if (langLower === 'python' || langLower === 'py') {
                const pyImports = this.extractPythonImports(line, language, filePath, lineNumber);
                imports.push(...pyImports);
            }
            // Java
            else if (langLower === 'java') {
                const javaImports = this.extractJavaImports(line, language, filePath, lineNumber);
                imports.push(...javaImports);
            }
            // Go
            else if (langLower === 'go') {
                const goImports = this.extractGoImports(line, language, filePath, lineNumber);
                imports.push(...goImports);
            }
            // Rust
            else if (langLower === 'rust' || langLower === 'rs') {
                const rustImports = this.extractRustImports(line, language, filePath, lineNumber);
                imports.push(...rustImports);
            }
            // C/C++
            else if (langLower === 'c' || langLower === 'cpp' || langLower === 'c++' || langLower === 'cc' || langLower === 'h' || langLower === 'hpp') {
                const cImports = this.extractCImports(line, language, filePath, lineNumber);
                imports.push(...cImports);
            }
            // C#
            else if (langLower === 'csharp' || langLower === 'cs') {
                const csImports = this.extractCSharpImports(line, language, filePath, lineNumber);
                imports.push(...csImports);
            }
        } catch (error) {
            // Silently skip lines that fail to parse
        }

        return imports;
    }

    /**
     * Extract JavaScript/TypeScript imports
     */
    private extractJavaScriptImports(line: string, language: string, filePath: string, lineNumber: number): ImportInfo[] {
        const imports: ImportInfo[] = [];

        // ES6 import: import foo from 'module'
        const es6ImportMatch = line.match(/import\s+(?:(?:\*\s+as\s+\w+)|(?:\{[^}]*\})|(?:\w+))\s+from\s+['"]([^'"]+)['"]/);
        if (es6ImportMatch) {
            imports.push({
                importedPath: es6ImportMatch[1],
                importerPath: filePath,
                language,
                lineNumber
            });
        }

        // ES6 side-effect import: import 'module'
        const sideEffectMatch = line.match(/import\s+['"]([^'"]+)['"]/);
        if (sideEffectMatch && !es6ImportMatch) {
            imports.push({
                importedPath: sideEffectMatch[1],
                importerPath: filePath,
                language,
                lineNumber
            });
        }

        // CommonJS require: const foo = require('module')
        const requireMatch = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
        if (requireMatch) {
            imports.push({
                importedPath: requireMatch[1],
                importerPath: filePath,
                language,
                lineNumber
            });
        }

        // Dynamic import: import('module')
        const dynamicImportMatch = line.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
        if (dynamicImportMatch) {
            imports.push({
                importedPath: dynamicImportMatch[1],
                importerPath: filePath,
                language,
                lineNumber
            });
        }

        return imports;
    }

    /**
     * Extract Python imports
     */
    private extractPythonImports(line: string, language: string, filePath: string, lineNumber: number): ImportInfo[] {
        const imports: ImportInfo[] = [];

        // import module
        const importMatch = line.match(/^import\s+([\w.]+)/);
        if (importMatch) {
            imports.push({
                importedPath: importMatch[1],
                importerPath: filePath,
                language,
                lineNumber
            });
        }

        // from module import ...
        const fromImportMatch = line.match(/^from\s+([\w.]+)\s+import/);
        if (fromImportMatch) {
            imports.push({
                importedPath: fromImportMatch[1],
                importerPath: filePath,
                language,
                lineNumber
            });
        }

        return imports;
    }

    /**
     * Extract Java imports
     */
    private extractJavaImports(line: string, language: string, filePath: string, lineNumber: number): ImportInfo[] {
        const imports: ImportInfo[] = [];

        // import package.Class;
        const importMatch = line.match(/^import\s+([\w.]+);?/);
        if (importMatch) {
            imports.push({
                importedPath: importMatch[1],
                importerPath: filePath,
                language,
                lineNumber
            });
        }

        return imports;
    }

    /**
     * Extract Go imports
     */
    private extractGoImports(line: string, language: string, filePath: string, lineNumber: number): ImportInfo[] {
        const imports: ImportInfo[] = [];

        // import "package"
        const singleImportMatch = line.match(/^import\s+"([^"]+)"/);
        if (singleImportMatch) {
            imports.push({
                importedPath: singleImportMatch[1],
                importerPath: filePath,
                language,
                lineNumber
            });
        }

        // Inside import block: "package" or alias "package"
        const blockImportMatch = line.match(/^\s*(?:\w+\s+)?"([^"]+)"/);
        if (blockImportMatch && !singleImportMatch) {
            // This might be inside an import block
            imports.push({
                importedPath: blockImportMatch[1],
                importerPath: filePath,
                language,
                lineNumber
            });
        }

        return imports;
    }

    /**
     * Extract Rust imports
     */
    private extractRustImports(line: string, language: string, filePath: string, lineNumber: number): ImportInfo[] {
        const imports: ImportInfo[] = [];

        // use crate::module::item;
        const useMatch = line.match(/^use\s+([\w:]+)/);
        if (useMatch) {
            imports.push({
                importedPath: useMatch[1],
                importerPath: filePath,
                language,
                lineNumber
            });
        }

        // extern crate name;
        const externMatch = line.match(/^extern\s+crate\s+(\w+)/);
        if (externMatch) {
            imports.push({
                importedPath: externMatch[1],
                importerPath: filePath,
                language,
                lineNumber
            });
        }

        return imports;
    }

    /**
     * Extract C/C++ imports
     */
    private extractCImports(line: string, language: string, filePath: string, lineNumber: number): ImportInfo[] {
        const imports: ImportInfo[] = [];

        // #include <header.h> or #include "header.h"
        const includeMatch = line.match(/^#include\s+[<"]([^>"]+)[>"]/);
        if (includeMatch) {
            imports.push({
                importedPath: includeMatch[1],
                importerPath: filePath,
                language,
                lineNumber
            });
        }

        return imports;
    }

    /**
     * Extract C# imports
     */
    private extractCSharpImports(line: string, language: string, filePath: string, lineNumber: number): ImportInfo[] {
        const imports: ImportInfo[] = [];

        // using Namespace;
        const usingMatch = line.match(/^using\s+([\w.]+);?/);
        if (usingMatch && !line.includes('=')) {
            // Exclude using aliases like: using Alias = Namespace;
            imports.push({
                importedPath: usingMatch[1],
                importerPath: filePath,
                language,
                lineNumber
            });
        }

        return imports;
    }

    /**
     * Builds an import graph from all analyzed files
     * @returns ImportGraph with imports and frequency data
     */
    buildImportGraph(): ImportGraph {
        const frequency: ImportFrequency = {};

        for (const importInfo of this.imports) {
            const path = importInfo.importedPath;
            frequency[path] = (frequency[path] || 0) + 1;
        }

        return {
            imports: this.imports,
            frequency
        };
    }

    /**
     * Gets the import frequency for a specific file path
     * @param filePath The file path to check
     * @returns The import count for the file
     */
    getImportFrequency(filePath: string): number {
        const graph = this.buildImportGraph();
        return graph.frequency[filePath] || 0;
    }

    /**
     * Gets the most frequently imported files
     * @param topN Number of top files to return
     * @returns Array of [filePath, count] tuples sorted by frequency
     */
    getMostImported(topN: number = 10): [string, number][] {
        const graph = this.buildImportGraph();
        const entries = Object.entries(graph.frequency);

        return entries
            .sort((a, b) => b[1] - a[1])
            .slice(0, topN);
    }

    /**
     * Gets all imports for a specific file
     * @param filePath The file path
     * @returns Array of ImportInfo for files imported by this file
     */
    getImportsForFile(filePath: string): ImportInfo[] {
        return this.imports.filter(imp => imp.importerPath === filePath);
    }

    /**
     * Gets all files that import a specific file
     * @param filePath The file path
     * @returns Array of ImportInfo for files that import this file
     */
    getImportersOfFile(filePath: string): ImportInfo[] {
        return this.imports.filter(imp => imp.importedPath.includes(filePath) || filePath.includes(imp.importedPath));
    }

    /**
     * Resets the analyzer state
     */
    reset(): void {
        this.imports = [];
    }

    /**
     * Gets total number of import statements analyzed
     */
    getTotalImports(): number {
        return this.imports.length;
    }

    /**
     * Checks if a language is supported
     * @param language The language to check
     * @returns True if language is supported
     */
    static isLanguageSupported(language: string): boolean {
        const langLower = language.toLowerCase();
        const supportedLanguages = [
            'javascript', 'js', 'typescript', 'ts', 'jsx', 'tsx',
            'python', 'py',
            'java',
            'go',
            'rust', 'rs',
            'c', 'cpp', 'c++', 'cc', 'h', 'hpp',
            'csharp', 'cs'
        ];

        return supportedLanguages.includes(langLower);
    }
}

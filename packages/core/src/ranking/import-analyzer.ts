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

/**
 * Information about a parse error for debugging
 */
export interface ParseError {
    filePath: string;
    lineNumber: number;
    error: string;
}

export class ImportAnalyzer {
    private imports: ImportInfo[] = [];
    private cachedGraph: ImportGraph | null = null;
    private parseErrors: ParseError[] = [];
    private static readonly MAX_LOGGED_ERRORS = 5;

    /**
     * Analyzes a code file and extracts import statements
     * @param code The source code content
     * @param language The programming language
     * @param filePath The file path being analyzed
     * @returns Array of ImportInfo objects
     */
    analyzeFile(code: string, language: string, filePath: string): ImportInfo[] {
        const imports: ImportInfo[] = [];

        // Preprocess code to handle multiline imports (JS/TS)
        const langLower = language.toLowerCase();
        const processedCode = this.preprocessMultilineImports(code, langLower);

        const lines = processedCode.split(/\r?\n/);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const lineNumber = i + 1;

            const extractedImports = this.extractImports(line, language, filePath, lineNumber);
            imports.push(...extractedImports);
        }

        this.imports.push(...imports);
        this.cachedGraph = null; // Invalidate cache when new imports are added
        return imports;
    }

    /**
     * Preprocess code to join multiline imports into single lines
     * This handles imports like:
     * import {
     *   foo,
     *   bar
     * } from 'module';
     */
    private preprocessMultilineImports(code: string, langLower: string): string {
        // Only preprocess for JS/TS where multiline imports are common
        if (!['javascript', 'js', 'typescript', 'ts', 'jsx', 'tsx'].includes(langLower)) {
            return code;
        }

        // Join multiline imports: match `import {` ... `} from '...'` across lines
        // This regex handles the common case of destructured imports spanning multiple lines
        return code.replace(
            /import\s*\{([^}]*)\}\s*from\s*(['"][^'"]+['"])/gs,
            (match, imports, source) => {
                // Normalize whitespace in the import list
                const normalizedImports = imports.replace(/\s+/g, ' ').trim();
                return `import { ${normalizedImports} } from ${source}`;
            }
        );
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
            const errorMessage = error instanceof Error ? error.message : String(error);
            // Store parse error for later retrieval
            this.parseErrors.push({
                filePath,
                lineNumber,
                error: errorMessage
            });
            // Log first few errors at warn level, then only if DEBUG is set
            const errorCount = this.parseErrors.length;
            if (errorCount <= ImportAnalyzer.MAX_LOGGED_ERRORS) {
                console.warn(`[ImportAnalyzer] Failed to parse line ${lineNumber} in ${filePath}: ${errorMessage}`);
                if (errorCount === ImportAnalyzer.MAX_LOGGED_ERRORS) {
                    console.warn(`[ImportAnalyzer] Suppressing further parse error warnings. Set DEBUG=1 for all errors.`);
                }
            } else if (process.env.DEBUG) {
                console.debug(`[ImportAnalyzer] Failed to parse line ${lineNumber} in ${filePath}: ${errorMessage}`);
            }
        }

        return imports;
    }

    /**
     * Extract JavaScript/TypeScript imports
     */
    private extractJavaScriptImports(line: string, language: string, filePath: string, lineNumber: number): ImportInfo[] {
        const imports: ImportInfo[] = [];

        // ES6 import: handles multiple patterns including combined imports
        // - import foo from 'module'
        // - import { foo } from 'module'
        // - import * as foo from 'module'
        // - import type { Foo } from 'module'
        // - import React, { useState } from 'react' (combined default + named)
        const es6ImportMatch = line.match(/import\s+(?:type\s+)?(?:\w+\s*,\s*)?(?:(?:\*\s+as\s+\w+)|(?:\{[^}]*\})|(?:\w+))\s+from\s+['"]([^'"]+)['"]/);
        if (es6ImportMatch) {
            imports.push({
                importedPath: es6ImportMatch[1],
                importerPath: filePath,
                language,
                lineNumber
            });
        }

        // Re-exports: export { foo } from 'module' or export * from 'module'
        const reExportMatch = line.match(/export\s+(?:(?:\*)|(?:\{[^}]*\}))\s+from\s+['"]([^'"]+)['"]/);
        if (reExportMatch) {
            imports.push({
                importedPath: reExportMatch[1],
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
        // Be restrictive: only match lines that contain ONLY the import pattern
        // (optional alias followed by quoted path, nothing else except whitespace and comments)
        // This prevents matching var declarations like `var config = "database"`
        const blockImportMatch = line.match(/^\s*(?:(\w+)\s+)?"([^"]+)"\s*(?:\/\/.*)?$/);
        if (blockImportMatch && !singleImportMatch) {
            // Additional validation: if there's an alias, it should be a valid Go identifier
            // (not keywords like var, const, func, etc.)
            const alias = blockImportMatch[1];
            const goKeywords = ['var', 'const', 'func', 'type', 'struct', 'interface', 'map', 'chan', 'go', 'defer', 'return', 'if', 'else', 'for', 'switch', 'case', 'default', 'select', 'break', 'continue', 'fallthrough', 'goto', 'package', 'import', 'range'];
            if (!alias || !goKeywords.includes(alias)) {
                imports.push({
                    importedPath: blockImportMatch[2],
                    importerPath: filePath,
                    language,
                    lineNumber
                });
            }
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
        // Return cached graph if available
        if (this.cachedGraph !== null) {
            return this.cachedGraph;
        }

        const frequency: ImportFrequency = {};

        for (const importInfo of this.imports) {
            const path = importInfo.importedPath;
            frequency[path] = (frequency[path] || 0) + 1;
        }

        this.cachedGraph = {
            imports: this.imports,
            frequency
        };

        return this.cachedGraph;
    }

    /**
     * Gets the import frequency for a specific file path
     * Uses cached graph for performance
     * @param filePath The file path to check
     * @returns The import count for the file
     */
    getImportFrequency(filePath: string): number {
        const graph = this.buildImportGraph(); // Uses cache
        return graph.frequency[filePath] || 0;
    }

    /**
     * Gets the most frequently imported files
     * Uses cached graph for performance
     * @param topN Number of top files to return
     * @returns Array of [filePath, count] tuples sorted by frequency
     */
    getMostImported(topN: number = 10): [string, number][] {
        const graph = this.buildImportGraph(); // Uses cache
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
        const normalizedTarget = this.normalizePath(filePath);
        const targetBasename = this.getBasename(normalizedTarget);

        return this.imports.filter(imp => {
            const normalizedImport = this.normalizePath(imp.importedPath);
            const importBasename = this.getBasename(normalizedImport);

            return (
                this.isExactMatch(normalizedImport, normalizedTarget) ||
                this.isSuffixMatch(normalizedImport, normalizedTarget) ||
                this.isBasenameMatch(normalizedImport, normalizedTarget, importBasename, targetBasename)
            );
        });
    }

    /**
     * Check if two normalized paths match exactly
     * @param normalizedImport First normalized path
     * @param normalizedTarget Second normalized path
     * @returns True if paths match exactly
     */
    private isExactMatch(normalizedImport: string, normalizedTarget: string): boolean {
        return normalizedImport === normalizedTarget;
    }

    /**
     * Check if paths match via suffix (one path ends with the other)
     * Ensures match occurs at a path boundary to avoid partial filename matches
     * @param normalizedImport First normalized path
     * @param normalizedTarget Second normalized path
     * @returns True if paths match via suffix at a path boundary
     */
    private isSuffixMatch(normalizedImport: string, normalizedTarget: string): boolean {
        // Check if one path ends with the other
        if (!normalizedTarget.endsWith(normalizedImport) && !normalizedImport.endsWith(normalizedTarget)) {
            return false;
        }

        // Ensure we're matching at a path boundary (not partial filename)
        const longer = normalizedTarget.length > normalizedImport.length ? normalizedTarget : normalizedImport;
        const shorter = normalizedTarget.length > normalizedImport.length ? normalizedImport : normalizedTarget;
        const idx = longer.lastIndexOf(shorter);
        return idx === 0 || longer[idx - 1] === '/';
    }

    /**
     * Check if paths match via basename with additional heuristics
     * @param normalizedImport First normalized path
     * @param normalizedTarget Second normalized path
     * @param importBasename Basename of the import path
     * @param targetBasename Basename of the target path
     * @returns True if basenames match with sufficient uniqueness
     */
    private isBasenameMatch(
        normalizedImport: string,
        normalizedTarget: string,
        importBasename: string,
        targetBasename: string
    ): boolean {
        // Basenames must be identical and not a generic name
        if (targetBasename !== importBasename || targetBasename === 'index') {
            return false;
        }

        // Very long basenames (>8 chars) are likely unique enough
        if (targetBasename.length > 8) {
            return true;
        }

        // For shorter basenames, require at least one common directory segment
        const targetDirs = normalizedTarget.split('/').slice(0, -1);
        const importDirs = normalizedImport.split('/').slice(0, -1);
        return targetDirs.some(dir => dir.length > 0 && importDirs.includes(dir));
    }

    /**
     * Normalize a path for comparison
     * Removes leading ./ or ../, trailing extensions, and normalizes separators
     */
    private normalizePath(p: string): string {
        return p
            .replace(/^(\.\.?\/)+/, '')          // Remove ALL leading ./ or ../ segments
            .replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/i, '')  // Remove common extensions
            .replace(/\/index$/i, '')            // Remove trailing /index
            .replace(/\\/g, '/');                // Normalize separators
    }

    /**
     * Get the basename (filename without extension) from a path
     */
    private getBasename(p: string): string {
        const parts = p.split('/');
        return parts[parts.length - 1] || '';
    }

    /**
     * Resets the analyzer state
     */
    reset(): void {
        this.imports = [];
        this.cachedGraph = null;
        this.parseErrors = [];
    }

    /**
     * Gets total number of import statements analyzed
     */
    getTotalImports(): number {
        return this.imports.length;
    }

    /**
     * Gets parse errors encountered during analysis
     * Useful for debugging and data quality assessment
     * @returns Array of parse errors
     */
    getParseErrors(): ParseError[] {
        return [...this.parseErrors];
    }

    /**
     * Gets the number of parse errors encountered
     * @returns Number of parse errors
     */
    getParseErrorCount(): number {
        return this.parseErrors.length;
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

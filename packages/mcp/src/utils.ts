import * as path from "path";

/**
 * Truncate content to specified length
 */
export function truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
        return content;
    }
    return content.substring(0, maxLength) + '...';
}

/**
 * Ensure path is absolute. If relative path is provided, resolve it properly.
 */
export function ensureAbsolutePath(inputPath: string): string {
    // If already absolute, return as is
    if (path.isAbsolute(inputPath)) {
        return inputPath;
    }

    // For relative paths, resolve to absolute path
    const resolved = path.resolve(inputPath);
    return resolved;
}

export function trackCodebasePath(codebasePath: string): void {
    const absolutePath = ensureAbsolutePath(codebasePath);
    console.log(`[TRACKING] Tracked codebase path: ${absolutePath} (not marked as indexed)`);
}

/**
 * Build filter expression from extensionFilter array
 * Validates extensions and returns either a filter expression or an error
 */
export function buildExtensionFilterExpression(extensionFilter?: any[]): { filterExpr?: string; error?: string } {
    if (!Array.isArray(extensionFilter) || extensionFilter.length === 0) {
        return {};
    }

    const cleaned = extensionFilter
        .filter((v: any) => typeof v === 'string')
        .map((v: string) => v.trim())
        .filter((v: string) => v.length > 0);

    const invalid = cleaned.filter((e: string) => !(e.startsWith('.') && e.length > 1 && !/\s/.test(e)));
    if (invalid.length > 0) {
        return {
            error: `Error: Invalid file extensions in extensionFilter: ${JSON.stringify(invalid)}. Use proper extensions like '.ts', '.py'.`
        };
    }

    const quoted = cleaned.map((e: string) => `'${e}'`).join(', ');
    return {
        filterExpr: `fileExtension in [${quoted}]`
    };
}

/**
 * Format a search result for display.
 * @param result The search result object
 * @param index The result index (0-based)
 * @param absolutePath The codebase absolute path
 * @param showScore If true, show score; if false, show rank
 */
export function formatSearchResult(
    result: { relativePath: string; startLine: number; endLine: number; content: string; language: string; score?: number },
    index: number,
    absolutePath: string,
    showScore: boolean = false
): string {
    const location = `${result.relativePath}:${result.startLine}-${result.endLine}`;
    const context = truncateContent(result.content, 5000);
    const codebaseInfo = path.basename(absolutePath);
    const rankOrScore = showScore && result.score !== undefined
        ? `Score: ${result.score.toFixed(3)}`
        : `Rank: ${index + 1}`;

    return `${index + 1}. Code snippet (${result.language}) [${codebaseInfo}]\n` +
        `   Location: ${location}\n` +
        `   ${rankOrScore}\n` +
        `   Context: \n\`\`\`${result.language}\n${context}\n\`\`\`\n`;
}

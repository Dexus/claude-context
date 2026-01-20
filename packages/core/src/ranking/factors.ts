/**
 * Ranking factor calculation functions
 * All scores are normalized to [0, 1] range
 */

import { VectorDocument } from '../vectordb/types';

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Scale factor for sigmoid normalization in term frequency scoring */
const SIGMOID_SCALE_FACTOR = 100;

/**
 * Calculate recency score using exponential decay
 * More recent files get higher scores
 *
 * @param mtime File modification timestamp in milliseconds
 * @param halfLifeDays Half-life for exponential decay (default: 90 days)
 * @returns Recency score between 0 and 1
 */
export function calculateRecencyScore(mtime: number, halfLifeDays: number = 90): number {
    const now = Date.now();
    const daysSinceModification = (now - mtime) / (1000 * 60 * 60 * 24);

    // Exponential decay: score = 2^(-days / halfLife)
    // At halfLife days, score = 0.5
    // At 0 days, score = 1.0
    const score = Math.pow(2, -daysSinceModification / halfLifeDays);

    // Clamp to [0, 1] range
    return Math.max(0, Math.min(1, score));
}

/**
 * Calculate import frequency score
 * Files that are imported more frequently get higher scores
 *
 * @param importCount Number of times this file is imported
 * @param maxImportCount Maximum import count in the codebase
 * @returns Import score between 0 and 1
 */
export function calculateImportScore(importCount: number, maxImportCount: number): number {
    if (maxImportCount === 0) {
        return 0;
    }

    // Normalize by max imports
    const score = importCount / maxImportCount;

    // Clamp to [0, 1] range
    return Math.max(0, Math.min(1, score));
}

/**
 * Calculate term frequency score
 * Files with more query term matches get higher scores
 *
 * @param content Document content
 * @param queryTerms Array of query terms to search for
 * @returns Term frequency score between 0 and 1
 */
export function calculateTermFrequencyScore(content: string, queryTerms: string[]): number {
    if (queryTerms.length === 0 || content.length === 0) {
        return 0;
    }

    const contentLower = content.toLowerCase();
    let totalMatches = 0;

    // Count matches for each query term
    for (const term of queryTerms) {
        const termLower = term.toLowerCase();
        const regex = new RegExp(escapeRegex(termLower), 'g');
        const matches = contentLower.match(regex);
        totalMatches += matches ? matches.length : 0;
    }

    // Return 0 if no matches found
    if (totalMatches === 0) {
        return 0;
    }

    // Normalize by content length (in words)
    // This prevents longer documents from having artificially high scores
    const words = content.split(/\s+/).length;
    const normalizedScore = totalMatches / Math.max(1, words);

    // Apply exponential saturation function to map to [0, 1] range
    // Uses 1 - exp(-k*x) which maps 0→0 and increases asymptotically to 1
    // This provides better discrimination than sigmoid which always returns >= 0.5
    const score = 1 - Math.exp(-SIGMOID_SCALE_FACTOR * normalizedScore);

    return Math.max(0, Math.min(1, score));
}

/**
 * Extract query terms from a search query
 * Splits on whitespace and removes empty strings
 *
 * @param query Search query string
 * @returns Array of query terms
 */
export function extractQueryTerms(query: string): string[] {
    return query
        .split(/\s+/)
        .filter(term => term.length > 0)
        .map(term => term.trim());
}

/**
 * Calculate all ranking factors for a document
 *
 * @param document Vector document with metadata
 * @param query Search query string
 * @param maxImportCount Maximum import count in the codebase
 * @param halfLifeDays Half-life for recency decay (default: 90 days)
 * @returns Object with all ranking factor scores
 */
export function calculateAllFactors(
    document: VectorDocument,
    query: string,
    maxImportCount: number,
    halfLifeDays: number = 90
): {
    recencyScore: number;
    importScore: number;
    termFreqScore: number;
} {
    const recencyScore = calculateRecencyScore(document.mtime, halfLifeDays);

    const importCount = document.metadata?.importCount ?? 0;
    const importScore = calculateImportScore(importCount, maxImportCount);

    const queryTerms = extractQueryTerms(query);
    const termFreqScore = calculateTermFrequencyScore(document.content, queryTerms);

    return {
        recencyScore,
        importScore,
        termFreqScore,
    };
}

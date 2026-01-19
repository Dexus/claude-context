/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },
  // Run tests sequentially to avoid mock-fs interference between test files
  maxWorkers: 1,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/__tests__/**',
    '!src/**/index.ts',
    '!src/types.ts',
    // Exclude external API providers that require real services to test
    '!src/embedding/gemini-embedding.ts',
    '!src/embedding/ollama-embedding.ts',
    '!src/embedding/voyageai-embedding.ts',
    '!src/vectordb/milvus-vectordb.ts',
    '!src/vectordb/milvus-restful-vectordb.ts',
    '!src/vectordb/zilliz-utils.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    // Per-file thresholds for critical modules
    './src/splitter/*.ts': {
      branches: 80,
      functions: 85,
      lines: 90,
      statements: 90,
    },
    './src/sync/*.ts': {
      branches: 75,
      functions: 95,
      lines: 90,
      statements: 90,
    },
    './src/utils/*.ts': {
      branches: 90,
      functions: 100,
      lines: 95,
      statements: 95,
    },
  },
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  testTimeout: 30000,
  verbose: true,
};

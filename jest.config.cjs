module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: process.env.JEST_ROOT_DIR || process.cwd(),
  testRegex: 'src/.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
};

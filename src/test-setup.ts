/**
 * Jest Test Setup
 * 
 * Global test configuration and mocks
 */

// Mock uuid to avoid ES module issues in Jest
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-' + Math.random().toString(36).substring(7)),
}));

// Suppress console.error in tests unless needed
const originalError = console.error;
beforeAll(() => {
  console.error = jest.fn((...args) => {
    // Allow specific error messages through
    if (args[0]?.includes?.('Warning:') || args[0]?.includes?.('Error:')) {
      originalError(...args);
    }
  });
});

afterAll(() => {
  console.error = originalError;
});

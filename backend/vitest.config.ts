import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      JWT_ACCESS_SECRET: 'test-jwt-access-secret-for-vitest',
      JWT_REFRESH_SECRET: 'test-jwt-refresh-secret-for-vitest',
      ENCRYPTION_KEY: 'test-encryption-key-32-chars!!!!',
    },
  },
});

/** The test server's maintenance secret (playwright.config.ts): a fixed value, the test database being throwaway. */
export const MAINTENANCE_SECRET_TEST = "e2e-maintenance-secret-not-for-production";

/** The test server's administrator (playwright.config.ts, ADMIN_EMAIL): a Google account made in the database. */
export const ADMIN_EMAIL_TEST = "admin@e2e.test";

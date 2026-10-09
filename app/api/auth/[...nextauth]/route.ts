import { handlers } from "@/src/auth/auth";

// Auth.js's endpoints: the redirect to Google, its callback, the session, sign-out. Outside the password (proxy.ts).
export const { GET, POST } = handlers;

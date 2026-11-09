/** Runtime settings from the environment (see .env.example), read when used. */
export const config = {
  get port() {
    return Number(process.env.PORT ?? 4000);
  },
  get mongoUri() {
    return process.env.MONGODB_URI ?? "mongodb://localhost:27017/keyway";
  },
  /** Demo sign-in and reset are on unless DEMO_MODE=off (matches NEXT_PUBLIC_DEMO_MODE in Keyway). */
  get demoMode() {
    return process.env.DEMO_MODE !== "off";
  },
};

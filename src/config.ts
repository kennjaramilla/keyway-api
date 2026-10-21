/** Runtime settings from the environment (see .env.example). */
export const config = {
  port: Number(process.env.PORT ?? 4000),
  mongoUri: process.env.MONGODB_URI ?? "mongodb://localhost:27017/keyway",
};

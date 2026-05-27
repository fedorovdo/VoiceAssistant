import { buildApp } from "./app.js";

const host = process.env.BACKEND_HOST ?? "127.0.0.1";
const port = Number(process.env.BACKEND_PORT ?? 8787);

const app = buildApp();

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

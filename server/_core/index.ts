import { createServer } from "http";
import { serveStatic, setupVite } from "./vite";
import { app } from "../app";

async function startServer() {
  const server = createServer(app);

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = Number.parseInt(process.env.PORT || "3000", 10);
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  startServer().catch((error) => {
    console.error("[v0] Server startup failed", error);
    process.exitCode = 1;
  });
}

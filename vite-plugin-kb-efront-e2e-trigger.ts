import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";

/**
 * Dev-server only: POST /__kb/run-efront-e2e runs Playwright via `node …/node_modules/@playwright/test/cli.js test …`.
 * Avoids `spawn(npx.cmd, …)` which often throws `spawn EINVAL` on Windows (especially with Node 20+).
 */
export function kbEfrontE2eTriggerPlugin(): Plugin {
  return {
    name: "kb-efront-e2e-trigger",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathOnly = req.url?.split("?")[0] ?? "";
        if (pathOnly !== "/__kb/run-efront-e2e" || req.method !== "POST") {
          next();
          return;
        }

        const rootAbs = resolve(server.config.root);
        const cliPath = join(rootAbs, "node_modules", "@playwright", "test", "cli.js");

        try {
          if (!existsSync(cliPath)) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(
              JSON.stringify({
                ok: false,
                error: "Playwright CLI not found under node_modules. Run npm install.",
              }),
            );
            return;
          }

          execFile(
            process.execPath,
            [cliPath, "test", "--config=playwright.efront.config.ts"],
            {
              cwd: rootAbs,
              windowsHide: true,
              stdio: "ignore",
            },
            (err) => {
              if (err) {
                console.warn("[kb-efront-e2e-trigger] Playwright finished with error:", err.message);
              }
            },
          );

          res.statusCode = 202;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: msg }));
        }
      });
    },
  };
}

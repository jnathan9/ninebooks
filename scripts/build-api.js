import { mkdirSync, copyFileSync, writeFileSync } from "node:fs";
mkdirSync(".build-api", { recursive: true });
copyFileSync("src/worker.js", ".build-api/_worker.js");
writeFileSync(
  ".build-api/index.html",
  '<!doctype html><title>Nine Books API</title><a href="https://thestalwart.com/ninebooks/">Nine Books</a>',
);

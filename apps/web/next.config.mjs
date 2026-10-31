import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: false,
  images: {
    qualities: [75, 90],
  },
  outputFileTracingRoot: path.resolve(__dirname, "../../"),
  outputFileTracingIncludes: {
    // files the pages read at request time (seeded examples, the demo PR, the eval table, the dogfood receipts)
    "/*": ["../../examples/**/*", "../../fixtures/github/**/*", "../../eval/results.md", "../../docs/dogfood/*.txt", "./src/fonts/*.woff"],
  },
};

export default nextConfig;

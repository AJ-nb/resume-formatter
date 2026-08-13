/**
 * Build script for resume-formatter.
 * Merges CSS and JS into the HTML template, producing a standalone single-file HTML.
 * Uses Node.js native modules only — no npm dependencies required.
 *
 * Usage: node scripts/build.mjs
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");

// CSS files to include (in order)
const CSS_FILES = [
  "styles/app.css",
  "styles/resume.css",
  "styles/print.css",
];

// JS files to include (in dependency order)
const JS_FILES = [
  "js/utils.js",
  "js/state.js",
  "js/parser.js",
  "js/json-importer.js",
  "js/validator.js",
  "js/renderer.js",
  "js/editor.js",
  "js/persistence.js",
  "js/exporter.js",
  "js/overflow.js",
  "js/photo.js",
  "js/app.js",
];

/**
 * Read and concatenate CSS files.
 * @returns {string}
 */
function buildStyles() {
  let css = "";

  for (const file of CSS_FILES) {
    const path = join(SRC, file);
    if (!existsSync(path)) {
      console.warn(`  ⚠️  Missing: ${file}`);
      continue;
    }
    const content = readFileSync(path, "utf-8");
    css += `/* ${file} */\n${content}\n`;
  }

  return `<style>\n${css}\n</style>`;
}

/**
 * Read and concatenate JS files.
 * @returns {string}
 */
function buildScripts() {
  let js = "";

  for (const file of JS_FILES) {
    const path = join(SRC, file);
    if (!existsSync(path)) {
      console.warn(`  ⚠️  Missing: ${file}`);
      continue;
    }
    const content = readFileSync(path, "utf-8");
    js += `// ${file}\n${content}\n`;
  }

  return `<script>\n${js}\n</script>`;
}

/**
 * Main build function.
 */
function build() {
  console.log("Building resume-formatter...\n");

  // Read template
  const templatePath = join(SRC, "index.template.html");
  if (!existsSync(templatePath)) {
    console.error("  ✗ Template not found:", templatePath);
    process.exit(1);
  }
  let html = readFileSync(templatePath, "utf-8");

  // Build CSS
  console.log("  Building CSS...");
  const styles = buildStyles();
  html = html.replace("<!-- __STYLES__ -->", styles);

  // Build JS
  console.log("  Building JS...");
  const scripts = buildScripts();

  // Inject default resume MD as a constant
  const defaultResumeFilename = "sample-resume.md";
  const defaultMdPath = join(ROOT, "fixtures/valid", defaultResumeFilename);
  let defaultMdScript = "";
  if (existsSync(defaultMdPath)) {
    const mdContent = readFileSync(defaultMdPath, "utf-8");
    const escaped = JSON.stringify(mdContent);
    defaultMdScript = `<script>const DEFAULT_RESUME_MD = ${escaped};\nconst DEFAULT_RESUME_FILENAME = ${JSON.stringify(defaultResumeFilename)};</script>`;
    console.log("  Injecting default resume...");
  }

  html = html.replace("<!-- __SCRIPTS__ -->", defaultMdScript + "\n" + scripts);

  // Ensure dist directory exists
  if (!existsSync(DIST)) {
    mkdirSync(DIST, { recursive: true });
  }

  // Keep the downloadable artifact and the two GitHub Pages entry files identical.
  const outputPaths = [
    join(DIST, "resume-formatter.html"),
    join(ROOT, "index.html"),
    join(ROOT, "resume-formatter.html"),
  ];
  for (const outputPath of outputPaths) {
    writeFileSync(outputPath, html, "utf-8");
  }

  const sizeKB = (Buffer.byteLength(html, "utf-8") / 1024).toFixed(1);
  console.log(`\n  ✓ Built: ${outputPaths.join(", ")}`);
  console.log(`    Size: ${sizeKB} KB\n`);
}

build();

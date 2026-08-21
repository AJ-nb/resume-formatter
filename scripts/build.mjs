import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));

const rawPlugin = {
  name: "raw-module",
  setup(build) {
    build.onResolve({ filter: /\?raw$/ }, (args) => {
      const specifier = args.path.replace(/\?raw$/, "");
      const path = specifier.startsWith(".")
        ? join(args.resolveDir, specifier)
        : require.resolve(specifier, { paths: [args.resolveDir] });
      return { path, namespace: "raw-module" };
    });
    build.onLoad({ filter: /.*/, namespace: "raw-module" }, async (args) => ({
      contents: `export default ${JSON.stringify(await readFile(args.path, "utf8"))};`,
      loader: "js",
    }));
  },
};

async function bundleJavaScript() {
  const result = await esbuild.build({
    entryPoints: [join(root, "src/v2/app.js")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    target: ["chrome109", "edge109", "safari16.4"],
    minify: true,
    legalComments: "eof",
    plugins: [rawPlugin],
    define: { __BUILD_VERSION__: JSON.stringify(packageJson.version) },
    logLevel: "info",
  });
  return result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
}

async function bundleCss() {
  const result = await esbuild.build({
    entryPoints: [join(root, "src/styles/v2.css")],
    bundle: true,
    write: false,
    minify: true,
    legalComments: "eof",
    loader: { ".css": "css" },
    logLevel: "info",
  });
  return result.outputFiles[0].text.replace(/<\/style/gi, "<\\/style");
}

async function build() {
  console.log(`Building Resume Formatter v${packageJson.version}...`);
  const [template, javascript, css] = await Promise.all([
    readFile(join(root, "src/index.template.html"), "utf8"),
    bundleJavaScript(),
    bundleCss(),
  ]);
  const html = template
    .replace("__APP_VERSION__", packageJson.version)
    .replace("<!-- __STYLES__ -->", () => `<style>${css}</style>`)
    .replace("<!-- __SCRIPTS__ -->", () => `<script>${javascript}</script>`);

  const outputs = [
    join(root, "index.html"),
    join(root, "resume-formatter.html"),
    join(root, "dist/resume-formatter.html"),
  ];
  await mkdir(join(root, "dist"), { recursive: true });
  await Promise.all(outputs.map((path) => writeFile(path, html, "utf8")));
  console.log(`Built ${outputs.length} identical offline files (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB).`);
}

await build();

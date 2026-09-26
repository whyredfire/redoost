import tailwind from "bun-plugin-tailwind";
import { cp, rm } from "node:fs/promises";
import path from "node:path";

const outdir = path.join(process.cwd(), "dist");
await rm(outdir, { recursive: true, force: true });

const entrypoints = [...new Bun.Glob("src/**/*.html").scanSync()];

// Files served as-is, like llms.txt
await cp("public", outdir, { recursive: true });

const result = await Bun.build({
  entrypoints,
  outdir,
  plugins: [tailwind],
  minify: true,
  target: "browser",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});

for (const output of result.outputs) {
  console.log(` ${path.relative(process.cwd(), output.path)}  ${(output.size / 1024).toFixed(1)} KB`);
}

// Pre-compressed copies for Nginx's gzip_static; index.html stays plain so sub_filter can rewrite it
for (const file of new Bun.Glob("**/*.{js,css,svg,txt}").scanSync(outdir)) {
  const full = path.join(outdir, file);
  const data = await Bun.file(full).bytes();
  await Bun.write(`${full}.gz`, Bun.gzipSync(data, { level: 9 }));
}

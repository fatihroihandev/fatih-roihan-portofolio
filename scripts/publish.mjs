// Unified publishing pipeline for roihan-ai-office-v2.
// Usage:
//   node scripts/publish.mjs                     -> builds articles, builds id/index.html, verifies sync & runs SEO check.mjs
//   node scripts/publish.mjs --download-images   -> also downloads remote https:// cover/inline images locally
//   node scripts/publish.mjs --git-push          -> commits and pushes built artifacts to origin
import { execSync } from "node:child_process";

const run = (cmd) => {
    console.log(`\n> ${cmd}`);
    execSync(cmd, { stdio: "inherit" });
};

const downloadFlag = process.argv.includes("--download-images") ? " --download-images" : "";

run(`node scripts/build-articles.mjs${downloadFlag}`);
run("node scripts/build-id.mjs --check");
run("node scripts/build-id.mjs");
run("node scripts/check.mjs");

if (process.argv.includes("--git-push")) {
    run("git add index.html id/ articles/ content/ sitemap.xml assets/");
    run('git commit -m "chore(articles): publish and update SEO via roihan-ai-office-v2"');
    run("git push");
}

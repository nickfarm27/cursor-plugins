#!/usr/bin/env node

import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PSTACK = join(ROOT, "pstack");
const SKILLS = join(PSTACK, "skills");
const TEAM_KIT_SKILLS = join(ROOT, "cursor-team-kit", "skills");
// Outside pstack/ so Cursor, which copies the whole plugin folder, does not install these trees too.
const OUT = join(ROOT, "harness", "pstack");
const COMMAND = "node scripts/generate-pstack-harness-trees.mjs";
const GITHUB = "https://github.com/cursor/plugins";
const LINK = /\]\(([^)\s]+)\)/g;
const README = `# pstack harness tree

This folder is generated from \`pstack/skills\`, \`pstack/agents\`, \`pstack/docs/harness/claude-code.md\`, \`pstack/docs/harness/codex.md\`, \`pstack/LICENSE\`, \`pstack/plugin.json\`, and three \`cursor-team-kit\` skills. Do not edit it by hand.

Cursor uses \`pstack/\` directly. Claude Code installs \`claude-code/\` and Codex installs \`codex/\`. The trees leave out the rest of \`pstack/docs\` and \`pstack/README.md\`. A relative link to a pstack file that a tree leaves out points at that file on GitHub \`main\` instead.

After editing those sources, run \`${COMMAND}\` from the repository root and commit the result.
`;

const TERMS = [
  { key: "`Task`", re: /`Task`|\bTask (tool|subagent|call)/ },
  { key: "`AskQuestion`", re: /AskQuestion/ },
  { key: "todolist", re: /\btodo ?list\b/i },
  { key: "generalPurpose", re: /generalPurpose/ },
  { key: "poteto-agent", re: /poteto-agent/ },
  { key: "comment-sicko", re: /comment-sicko/ },
  { key: "`readonly: true`", re: /readonly: (true|false)|readonly\/Ask/ },
  { key: "`environment: \"cloud\"`", re: /environment: "(cloud|local)"/ },
  { key: "cloud_base_branch", re: /cloud_base_branch/ },
  { key: "`run_in_background: true`", re: /run_in_background/ },
  { key: "`resume`", re: /`resume`/ },
  { key: "`file_attachments`", re: /file_attachments/ },
  { key: "claude-", re: /\bclaude-[a-z]+-\d/ },
  { key: "grok-", re: /\bgrok-\d/ },
  { key: "gpt-", re: /\bgpt-\d/ },
  { key: "inherit-parent", re: /inherit-parent/ },
  { key: "pstack-models.mdc", re: /pstack-models\.mdc/ },
  { key: ".cursor/skills/", re: /\.cursor\/skills/ },
  { key: "~/.cursor/plugins/", re: /\.cursor\/plugins|\.cursor-plugin/ },
  { key: ".cursor/rules/", re: /\.cursor\/rules|always-applied rule/ },
  { key: "agent-transcripts", re: /agent-transcripts|\.cursor\/projects/ },
  { key: "Cursor-only features", re: /Bugbot|Cursor [Aa]utomation|cursor\.(sh|com)\/automations|[Cc]loud [Aa]gent/ },
];
// Cursor built-ins and cursor-team-kit names that only the Codex adapter maps.
const CODEX_TERMS = [
  { key: "`/loop`", re: /\/loop\b/ },
  { key: "`create-skill`", re: /create-skill/ },
  { key: "`babysit`", re: /built-in babysit|babysit skill/ },
  { key: "`cursor-team-kit`", re: /cursor-team-kit/ },
];
const ROUTE_KEY = "Run another pstack skill";

const TREES = [
  {
    name: "claude-code",
    harness: "Claude Code",
    adapter: "docs/harness/claude-code.md",
    manifests: ["plugin.json", ".claude-plugin/plugin.json"],
    terms: TERMS,
    exclude: [],
    teamKit: [],
    codex: false,
  },
  {
    name: "codex",
    harness: "Codex",
    adapter: "docs/harness/codex.md",
    manifests: [".codex-plugin/plugin.json"],
    terms: [...TERMS, ...CODEX_TERMS],
    // Drives Cursor's Grok Bot routines, which Codex does not have.
    exclude: ["make-bot-ui"],
    teamKit: ["deslop", "control-ui", "control-cli"],
    codex: true,
  },
];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (name === ".DS_Store" || name === "node_modules") return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function file(path) {
  return { bytes: readFileSync(path), executable: (statSync(path).mode & 0o111) !== 0 };
}

const allSkills = readdirSync(SKILLS).filter((name) => existsSync(join(SKILLS, name, "SKILL.md")));

function skillDir(tree, skill) {
  return tree.teamKit.includes(skill) ? join(TEAM_KIT_SKILLS, skill) : join(SKILLS, skill);
}

function classify(tree, skills, skill) {
  const dir = skillDir(tree, skill);
  const others = skills.filter((name) => name !== skill).join("|");
  const route = new RegExp(`the \\*\\*(?<bold>${others})\\*\\* skill|\`/(?<command>${others})\``, "g");
  const linksToSkill = (line, name) => line.includes(`(../${name}/`);
  const namesBareSkill = (line) =>
    [...line.matchAll(route)].some(({ groups }) => !linksToSkill(line, groups.bold ?? groups.command));
  const usesCursorNames = new Set();
  for (const path of walk(dir).filter((path) => path.endsWith(".md"))) {
    const text = readFileSync(path, "utf8");
    for (const term of tree.terms) if (term.re.test(text)) usesCursorNames.add(term.key);
    if (text.split("\n").some(namesBareSkill)) usesCursorNames.add(ROUTE_KEY);
  }
  const text = readFileSync(join(dir, "SKILL.md"), "utf8");
  const wrap = usesCursorNames.size > 0 && /^# /m.test(text);
  return { usesCursorNames, wrap };
}

// The pstack-relative path that a relative link in `from` points at, if that path exists.
function resolve(from, href) {
  const target = href.replace(/[#?].*/, "");
  if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) return undefined;
  const path = posix.join(posix.dirname(from), target).replace(/\/$/, "");
  return existsSync(join(PSTACK, path)) ? path : undefined;
}

function has(files, path) {
  return files.has(path) || [...files.keys()].some((key) => key.startsWith(`${path}/`));
}

function frontmatter(text, key) {
  const block = text.match(/^---\n([\s\S]*?)\n---/);
  const line = block?.[1].split("\n").find((entry) => entry.startsWith(`${key}:`));
  return line?.slice(key.length + 1).trim();
}

function codexManifest() {
  const manifest = JSON.parse(readFileSync(join(PSTACK, "plugin.json"), "utf8"));
  delete manifest.$schema;
  manifest.skills = "./skills/";
  manifest.interface = {
    displayName: "pstack",
    shortDescription: "Rigorous agent workflows: poteto-mode, playbooks, review, verification",
    developerName: manifest.author?.name ?? "Cursor",
    category: "Developer Tools",
  };
  return { bytes: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), executable: false };
}

// Codex reads invocation policy from agents/openai.yaml, not from SKILL.md frontmatter.
function openaiYaml(name) {
  return Buffer.from(`interface:\n  display_name: "${name}"\npolicy:\n  allow_implicit_invocation: false\n`);
}

function render(tree) {
  const skills = [...allSkills.filter((skill) => !tree.exclude.includes(skill)), ...tree.teamKit];
  const classes = new Map(skills.map((skill) => [skill, classify(tree, skills, skill)]));
  const problems = [];
  const users = new Map();
  for (const [skill, { usesCursorNames, wrap }] of classes) {
    if (usesCursorNames.size > 0 && !wrap) problems.push(`skills/${skill}/SKILL.md uses Cursor names but has no H1`);
    for (const key of usesCursorNames) users.set(key, [...(users.get(key) ?? []), skill]);
  }
  const adapter = readFileSync(join(PSTACK, tree.adapter), "utf8");
  for (const [key, using] of users) {
    if (!adapter.includes(key)) problems.push(`${tree.harness} adapter has no row for ${key}, used by ${using.join(", ")}`);
  }
  for (const problem of problems) console.log(`FAIL ${problem}`);
  if (problems.length > 0) process.exit(1);

  // Skills read the adapter at runtime. The guide and the README stay on GitHub.
  const copies = [
    ...allSkills.filter((skill) => !tree.exclude.includes(skill)).flatMap((skill) => walk(join(SKILLS, skill))),
    ...walk(join(PSTACK, "agents")),
    join(PSTACK, tree.adapter),
  ];
  const files = new Map(copies.map((path) => [relative(PSTACK, path), file(path)]));
  for (const skill of tree.teamKit) {
    for (const path of walk(join(TEAM_KIT_SKILLS, skill))) {
      files.set(posix.join("skills", relative(TEAM_KIT_SKILLS, path)), file(path));
    }
  }
  const line =
    `In ${tree.harness}, read [the ${tree.harness} adapter](../../${tree.adapter}) once per session before you follow this skill. ` +
    `It maps the Cursor names in pstack skills to ${tree.harness}.`;
  for (const [skill, { wrap }] of classes) {
    const path = `skills/${skill}/SKILL.md`;
    let text = files.get(path).bytes.toString("utf8");
    if (wrap) text = text.replace(/^(# .*)\n+/m, `$1\n\n${line}\n\n`);
    if (tree.codex) {
      // Codex invokes a skill by its frontmatter name, so it has to match the folder.
      if (frontmatter(text, "name") !== skill) text = text.replace(/^name: .*$/m, `name: ${skill}`);
      if (frontmatter(text, "disable-model-invocation") === "true") {
        files.set(`skills/${skill}/agents/openai.yaml`, { bytes: openaiYaml(skill), executable: false });
      }
    }
    files.get(path).bytes = Buffer.from(text);
  }
  files.set("LICENSE", file(join(PSTACK, "LICENSE")));
  for (const manifest of tree.manifests) {
    files.set(manifest, tree.codex ? codexManifest() : file(join(PSTACK, "plugin.json")));
  }
  for (const [path, entry] of files) {
    if (!path.endsWith(".md")) continue;
    const text = entry.bytes.toString("utf8").replace(LINK, (link, href) => {
      const target = resolve(path, href);
      if (!target || target.split("/")[0] === ".." || has(files, target)) return link;
      const kind = statSync(join(PSTACK, target)).isDirectory() ? "tree" : "blob";
      return `](${GITHUB}/${kind}/main/pstack/${target}${href.slice(href.search(/[#?]|$/))})`;
    });
    entry.bytes = Buffer.from(text);
  }
  return { files, wrapped: [...classes.values()].filter(({ wrap }) => wrap).length, count: skills.length };
}

// Each harness installs only its tree, so a relative link that works from pstack/ has to work inside the tree too.
// Links to pstack files that a tree leaves out already point at GitHub, so a failure here is a link that leaves pstack/.
const rendered = new Map([["README.md", { bytes: Buffer.from(README), executable: false }]]);
const dangling = [];
const summaries = [];
for (const tree of TREES) {
  const { files, wrapped, count } = render(tree);
  summaries.push(`${tree.name}: ${count} skills, ${wrapped} SKILL.md files with the adapter line`);
  for (const [path, entry] of files) {
    rendered.set(`${tree.name}/${path}`, entry);
    if (!path.endsWith(".md")) continue;
    for (const [, href] of entry.bytes.toString("utf8").matchAll(LINK)) {
      const target = resolve(path, href);
      if (target && !has(files, target)) dangling.push(`harness/pstack/${tree.name}/${path} links to ${href}, which is not in the tree`);
    }
  }
}
for (const link of dangling) console.log(`FAIL ${link}`);
if (dangling.length > 0) process.exit(1);

if (process.argv.includes("--check")) {
  const onDisk = new Map(existsSync(OUT) ? walk(OUT).map((path) => [relative(OUT, path), file(path)]) : []);
  const drifted = [...new Set([...rendered.keys(), ...onDisk.keys()])].sort().filter((path) => {
    const [want, have] = [rendered.get(path), onDisk.get(path)];
    return !want || !have || !want.bytes.equals(have.bytes) || want.executable !== have.executable;
  });
  for (const path of drifted.slice(0, 20)) console.log(`harness/pstack/${path}`);
  if (drifted.length > 0) {
    console.log(`harness/pstack is out of date. Run \`${COMMAND}\` and commit the result.`);
    process.exit(1);
  }
  console.log("harness/pstack is up to date.");
} else {
  rmSync(OUT, { recursive: true, force: true });
  for (const [path, { bytes, executable }] of rendered) {
    mkdirSync(dirname(join(OUT, path)), { recursive: true });
    writeFileSync(join(OUT, path), bytes);
    chmodSync(join(OUT, path), executable ? 0o755 : 0o644);
  }
  for (const summary of summaries) console.log(summary);
}


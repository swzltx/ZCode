import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { OFFICIAL_PLUGIN_DEFINITIONS } from "../src/app/official-plugin-definitions.js";

const pluginRoot = fileURLToPath(new URL("../../nebula-qa-plugin", import.meta.url));

test("Nebula QA plugin manifest launches a local stdio MCP server with injected data/workspace paths", async () => {
  const packageJson = JSON.parse(await readFile(path.join(pluginRoot, "package.json"), "utf8")) as {
    version: string;
  };
  const manifest = JSON.parse(
    await readFile(path.join(pluginRoot, ".zcode-plugin", "plugin.json"), "utf8"),
  ) as {
    name: string;
    version: string;
    skills?: string;
    userConfig?: Record<string, { sensitive?: boolean; default?: unknown }>;
    mcpServers?: Record<
      string,
      { type?: string; url?: string; headers?: Record<string, string>; command?: string; protocolVersion?: string; args?: string[]; env?: Record<string, string> }
    >;
  };

  expect(packageJson.version).toBe("0.3.0");
  expect(manifest.name).toBe("nebula-qa");
  expect(manifest.version).toBe(packageJson.version);
  expect(manifest.skills).toBe("skills");
  expect(manifest.userConfig).toBeUndefined();

  const server = manifest.mcpServers?.nebula;
  expect(server?.type).toBe("stdio");
  expect(server?.url).toBeUndefined();
  expect(server?.headers).toBeUndefined();
  expect(server?.command).toBe("node");
  expect(server?.protocolVersion).toBe("legacy");
  expect(server?.args).toEqual(["${ZCODE_PLUGIN_ROOT}/dist/mcp/main.js"]);
  expect(server?.env?.NEBULA_DATA_DIR).toBe("${ZCODE_PLUGIN_DATA}");
  expect(server?.env?.NEBULA_WORKSPACE).toBe("${ZCODE_PROJECT_DIR}");
  expect(server?.env?.NEBULA_LLM_API_KEY).toBeUndefined();
});

test("Nebula QA official definition is bundled, disabled by default, and seeds the server + skill", () => {
  const definition = OFFICIAL_PLUGIN_DEFINITIONS.find((item) => item.name === "nebula-qa");
  expect(definition).toBeDefined();
  expect(definition?.defaultEnabled ?? false).toBe(false);
  expect(definition?.version).toBe("0.3.0");
  expect(definition?.requiredSeedPaths).toEqual([
    "dist/mcp/main.js",
    "skills/nebula-qa/SKILL.md",
    "skills/nebula-qa/references/tools.md",
  ]);
  expect(definition?.runtimeTopLevelPaths).toEqual(["node_modules"]);
});

test("Nebula QA skill documents the stdio boundary, ZCode permission gate, and evidence read", async () => {
  const skill = await readFile(path.join(pluginRoot, "skills", "nebula-qa", "SKILL.md"), "utf8");
  const catalog = await readFile(
    path.join(pluginRoot, "skills", "nebula-qa", "references", "tools.md"),
    "utf8",
  );
  expect(skill.startsWith("---\nname: nebula-qa\n")).toBe(true);
  expect(skill).toContain("mcp__plugin_nebula-qa_nebula__");
  expect(skill).toContain("不需要启动 Nebula 桌面端");
  expect(skill).toContain("权限闸门");
  expect(skill).toContain("会话模型");
  expect(skill).toContain("ui.get_run");
  expect(skill).toContain("case.save");
  expect(catalog).toContain("ui.run");
  expect(catalog).toContain("ui.get_run");
  expect(catalog).toContain("case.prepare");
  expect(catalog).toContain("case.save");
  expect(catalog).not.toContain("case.design");
});

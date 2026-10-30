#!/usr/bin/env node
/**
 * Shared utilities for skill-creator scripts (Node.js port).
 *
 * Usage:
 *   const { parseSkillMd } = require("./utils.js");
 */

const fs = require("fs");
const path = require("path");

/**
 * Parse a SKILL.md file, returning { name, description, fullContent }.
 * @param {string} skillPath - Path to the skill directory
 * @returns {{ name: string, description: string, fullContent: string }}
 */
function parseSkillMd(skillPath) {
  const skillMd = path.join(skillPath, "SKILL.md");
  const content = fs.readFileSync(skillMd, "utf-8").replace(/\r\n/g, "\n");
  const lines = content.split("\n");

  if (lines[0].trim() !== "---") {
    throw new Error("SKILL.md missing frontmatter (no opening ---)");
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    throw new Error("SKILL.md missing frontmatter (no closing ---)");
  }

  let name = "";
  let description = "";
  const frontmatterLines = lines.slice(1, endIdx);

  for (let i = 0; i < frontmatterLines.length; i++) {
    const line = frontmatterLines[i];
    if (line.startsWith("name:")) {
      name = line.slice("name:".length).trim().replace(/^["']|["']$/g, "");
    } else if (line.startsWith("description:")) {
      let value = line.slice("description:".length).trim();
      // Handle YAML multiline indicators (>, |, >-, |-)
      if ([">", "|", ">-", "|-"].includes(value)) {
        const continuationLines = [];
        i++;
        while (
          i < frontmatterLines.length &&
          (frontmatterLines[i].startsWith("  ") || frontmatterLines[i].startsWith("\t"))
        ) {
          continuationLines.push(frontmatterLines[i].trim());
          i++;
        }
        description = continuationLines.join(" ");
        i--; // will be incremented by loop
        continue;
      } else {
        description = value.replace(/^["']|["']$/g, "");
      }
    }
  }

  return { name, description, fullContent: content };
}

/**
 * Parse a simplified YAML frontmatter block (key-value pairs only).
 * Re-exported from quick_validate.js for convenience.
 */
function parseSimpleYaml(text) {
  const result = {};
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    i++;

    if (line.trim() === "" || line.trim().startsWith("#")) {
      continue;
    }

    const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.*?)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();

    // Handle YAML block scalar indicators
    if (["|", ">", "|-", ">-"].includes(value)) {
      const blockLines = [];
      while (i < lines.length) {
        const cl = lines[i];
        if (cl === "" || cl.startsWith("  ") || cl.startsWith("\t")) {
          blockLines.push(cl.trim());
          i++;
        } else {
          break;
        }
      }
      if (blockLines.length > 0) {
        value = value.startsWith(">")
          ? blockLines.join(" ")
          : blockLines.join("\n");
      }
      result[key] = value;
      continue;
    }

    // Handle inline list: [a, b, c]
    if (value.startsWith("[") && value.endsWith("]")) {
      const inner = value.slice(1, -1);
      result[key] = inner
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter((s) => s.length > 0);
      continue;
    }

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

module.exports = { parseSkillMd, parseSimpleYaml };

#!/usr/bin/env node
/**
 * Quick validation script for skills - zero-dependency Node.js version.
 *
 * Usage:
 *   node quick_validate.js <skill-directory>
 *
 * Exit code 0 = valid, 1 = invalid.
 */
const fs = require("fs");
const path = require("path");

const ALLOWED_PROPERTIES = new Set([
  "name",
  "description",
  "license",
  "allowed-tools",
  "metadata",
  "compatibility",
  "risk",
  "source",
]);

function validateSkill(skillPath) {
  const skillMd = path.join(skillPath, "SKILL.md");

  // Check SKILL.md exists
  if (!fs.existsSync(skillMd)) {
    return { valid: false, message: "SKILL.md not found" };
  }

  const content = fs.readFileSync(skillMd, "utf-8").replace(/\r\n/g, "\n");

  // Check YAML frontmatter (starts with ---)
  if (!content.startsWith("---")) {
    return { valid: false, message: "No YAML frontmatter found" };
  }

  // Extract frontmatter between --- markers
  const endMatch = content.indexOf("\n---", 3);
  if (endMatch === -1) {
    return { valid: false, message: "Invalid frontmatter format (no closing ---)" };
  }

  const frontmatterText = content.substring(3, endMatch).trim();
  const frontmatter = parseSimpleYaml(frontmatterText);

  if (frontmatter === null || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    return { valid: false, message: "Frontmatter must be a YAML dictionary" };
  }

  // Check for unexpected properties
  const unexpectedKeys = Object.keys(frontmatter).filter(
    (k) => !ALLOWED_PROPERTIES.has(k)
  );
  if (unexpectedKeys.length > 0) {
    return {
      valid: false,
      message: `Unexpected key(s) in SKILL.md frontmatter: ${unexpectedKeys
        .sort()
        .join(", ")}. Allowed properties are: ${[...ALLOWED_PROPERTIES]
        .sort()
        .join(", ")}`,
    };
  }

  // Check required fields
  if (!frontmatter.name) {
    return { valid: false, message: "Missing 'name' in frontmatter" };
  }
  if (!frontmatter.description) {
    return { valid: false, message: "Missing 'description' in frontmatter" };
  }

  // Validate name (kebab-case)
  const name = String(frontmatter.name).trim();
  if (name.length > 0) {
    if (!/^[a-z0-9-]+$/.test(name)) {
      return {
        valid: false,
        message: `Name '${name}' should be kebab-case (lowercase letters, digits, and hyphens only)`,
      };
    }
    if (
      name.startsWith("-") ||
      name.endsWith("-") ||
      name.includes("--")
    ) {
      return {
        valid: false,
        message: `Name '${name}' cannot start/end with hyphen or contain consecutive hyphens`,
      };
    }
    if (name.length > 64) {
      return {
        valid: false,
        message: `Name is too long (${name.length} characters). Maximum is 64 characters.`,
      };
    }
  }

  // Validate description
  const description = String(frontmatter.description).trim();
  if (description.length > 0) {
    if (description.includes("<") || description.includes(">")) {
      return {
        valid: false,
        message: "Description cannot contain angle brackets (< or >)",
      };
    }
    if (description.length > 1024) {
      return {
        valid: false,
        message: `Description is too long (${description.length} characters). Maximum is 1024 characters.`,
      };
    }
  }

  // Validate compatibility if present (optional)
  if (frontmatter.compatibility) {
    const compat = String(frontmatter.compatibility);
    if (compat.length > 500) {
      return {
        valid: false,
        message: `Compatibility is too long (${compat.length} characters). Maximum is 500 characters.`,
      };
    }
  }

  return { valid: true, message: "Skill is valid!" };
}

/**
 * Parse a simplified YAML frontmatter block (key-value pairs only).
 * Handles:
 *   - Simple values: key: value
 *   - Quoted values: key: "value" or key: 'value'
 *   - YAML block scalars: key: |\n  text\n  text
 *   - Multi-line folded: key: >\n  text\n  text
 *   - Inline lists: key: [a, b, c]
 *
 * Does NOT handle nested objects, complex YAML structures, etc.
 */
function parseSimpleYaml(text) {
  const result = {};
  const lines = text.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    i++;

    // Skip empty lines and comments
    if (line.trim() === "" || line.trim().startsWith("#")) {
      continue;
    }

    // Match key: value pattern
    const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.*?)$/);
    if (!match) continue;

    const key = match[1];
    let value = match[2].trim();

    // Handle YAML block scalar indicators (|, >, |-, >-, |-)
    if (value === "|" || value === ">" || value === "|-" || value === ">-") {
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
        value =
          value.startsWith(">")
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

// --- CLI ---
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 1) {
    console.error("Usage: node quick_validate.js <skill_directory>");
    process.exit(1);
  }

  const { valid, message } = validateSkill(args[0]);
  console.log(message);
  process.exit(valid ? 0 : 1);
}

module.exports = { validateSkill, parseSimpleYaml };

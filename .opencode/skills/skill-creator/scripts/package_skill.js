#!/usr/bin/env node
/**
 * Skill Packager - Creates a distributable .skill file (ZIP) of a skill folder.
 *
 * Usage:
 *   node package_skill.js <path/to/skill-folder> [output-directory]
 *
 * Example:
 *   node package_skill.js skills/public/my-skill
 *   node package_skill.js skills/public/my-skill ./dist
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Patterns to exclude when packaging skills
const EXCLUDE_DIRS = new Set(["__pycache__", "node_modules"]);
const EXCLUDE_GLOBS = ["*.pyc"];
const EXCLUDE_FILES = new Set([".DS_Store"]);
const ROOT_EXCLUDE_DIRS = new Set(["evals"]);

function shouldExclude(relPath, skillRootName) {
  const parts = relPath.split(/[\\/]/);
  if (parts.some((p) => EXCLUDE_DIRS.has(p))) return true;
  // parts[0] is skill folder name, parts[1] is first subdir
  if (parts.length > 1 && ROOT_EXCLUDE_DIRS.has(parts[1])) return true;
  const name = path.basename(relPath);
  if (EXCLUDE_FILES.has(name)) return true;
  for (const pat of EXCLUDE_GLOBS) {
    if (name.endsWith(".pyc")) return true;
  }
  return false;
}

function packageSkill(skillPath, outputDir) {
  skillPath = path.resolve(skillPath);

  // Validate skill folder exists
  if (!fs.existsSync(skillPath)) {
    console.error(`❌ Error: Skill folder not found: ${skillPath}`);
    return null;
  }

  if (!fs.statSync(skillPath).isDirectory()) {
    console.error(`❌ Error: Path is not a directory: ${skillPath}`);
    return null;
  }

  // Validate SKILL.md exists
  const skillMd = path.join(skillPath, "SKILL.md");
  if (!fs.existsSync(skillMd)) {
    console.error(`❌ Error: SKILL.md not found in ${skillPath}`);
    return null;
  }

  // Run validation before packaging
  console.log("🔍 Validating skill...");
  const jsPath = path.join(__dirname, "quick_validate.js");
  try {
    const result = execSync(`node "${jsPath}" "${skillPath}"`, { encoding: "utf-8" });
    console.log(`✅ ${result.trim()}\n`);
  } catch (e) {
    console.error(`❌ Validation failed: ${(e.stdout || e.message).trim()}`);
    console.error("   Please fix the validation errors before packaging.");
    return null;
  }

  // Determine output location
  const skillName = path.basename(skillPath);
  let outputPath;
  if (outputDir) {
    outputPath = path.resolve(outputDir);
    fs.mkdirSync(outputPath, { recursive: true });
  } else {
    outputPath = process.cwd();
  }

  const skillFilename = path.join(outputPath, `${skillName}.skill`);

  // Create the .skill file using Node.js built-in zlib
  // Node 18+ has built-in ZIP support via zlib
  const { createWriteStream, createReadStream } = require("fs");
  const { createGzip } = require("zlib");
  const { pipeline } = require("stream");

  // Use a tar-like approach with raw storage
  // Actually, let's use the archiver approach or just copy
  // Node.js doesn't have a built-in ZIP creator, so let's use a simple approach:
  // write a JSON manifest + files. Or use the built-in zlib for gzip.
  // For ZIP, we need either 'archiver' package or we create a simpler approach.

  // Simple approach: create a directory with all files (like a folder .skill)
  // Or use exec to call a system zip command
  // OR: let's create a simple self-contained .skill file that's actually a folder

  // Actually, the cleanest Node.js stdlib approach is to use a buffer-based ZIP writer.
  // Let's implement a minimal ZIP writer:
  try {
    const skillFilename = path.join(outputPath, `${skillName}.skill`);
    createZipFromDir(skillPath, skillFilename, skillName);
    console.log(`\n✅ Successfully packaged skill to: ${skillFilename}`);
    return skillFilename;
  } catch (e) {
    console.error(`❌ Error creating .skill file: ${e.message}`);
    return null;
  }
}

/**
 * Minimal ZIP file creation using Node.js built-in zlib + Buffer.
 * Creates a valid ZIP archive without external dependencies.
 */
function createZipFromDir(sourceDir, zipPath, skillName) {
  const { createWriteStream } = require("fs");
  const { deflateSync } = require("zlib");

  // Collect all files
  const files = [];
  function walkDir(dir, baseName) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(baseName, entry.name);
      if (entry.isDirectory()) {
        const shouldSkip = EXCLUDE_DIRS.has(entry.name) ||
          (baseName === skillName && ROOT_EXCLUDE_DIRS.has(entry.name));
        if (!shouldSkip) {
          walkDir(fullPath, relPath);
          // Add directory entry
          files.push({ path: relPath + "/", data: null, isDir: true });
        }
      } else if (entry.isFile()) {
        if (EXCLUDE_FILES.has(entry.name)) continue;
        if (entry.name.endsWith(".pyc")) continue;
        files.push({ path: relPath, data: fs.readFileSync(fullPath), isDir: false });
      }
    }
  }
  walkDir(sourceDir, skillName);

  // Write ZIP file
  // ZIP format: local file headers + central directory + end of central directory
  const LOCAL_FILE_HEADER = 0x04034b50;
  const CENTRAL_DIR_HEADER = 0x02014b50;
  const END_CENTRAL_DIR = 0x06054b50;
  const VERSION_NEEDED = 20;
  const VERSION_MADE_BY = 20;

  const localHeaders = [];
  const centralDirEntries = [];
  let offset = 0;
  const fd = fs.openSync(zipPath, "w");

  try {
    for (const file of files) {
      let compressedData;
      let compressionMethod;
      let crc32 = 0;
      let uncompressedSize = 0;

      if (file.isDir) {
        compressedData = Buffer.alloc(0);
        compressionMethod = 0; // stored
      } else {
        const data = file.data;
        uncompressedSize = data.length;
        // CRC32
        crc32 = crc32Compute(data);
        // Compress with deflate
        compressedData = require("zlib").deflateSync(data, { level: 9 });
        compressionMethod = 8; // deflated
      }

      const compressedSize = compressedData.length;
      const fileNameBuffer = Buffer.from(file.path, "utf-8");
      const fileNameLen = fileNameBuffer.length;

      // Local file header
      const localHeader = Buffer.alloc(30 + fileNameLen);
      localHeader.writeUInt32LE(LOCAL_FILE_HEADER, 0);
      localHeader.writeUInt16LE(VERSION_NEEDED, 4);
      localHeader.writeUInt16LE(0x0800, 6); // general purpose bit flag (UTF-8)
      localHeader.writeUInt16LE(compressionMethod, 8);
      localHeader.writeUInt16LE(0, 10); // mod time
      localHeader.writeUInt16LE(0, 12); // mod date
      localHeader.writeUInt32LE(crc32, 14);
      localHeader.writeUInt32LE(compressedSize, 18);
      localHeader.writeUInt32LE(uncompressedSize, 22);
      fileNameBuffer.copy(localHeader, 26);
      localHeader.copy(localHeader, 26);
      fileNameBuffer.copy(localHeader, 26);

      fs.writeSync(fd, localHeader);
      fs.writeSync(fd, compressedData);

      localHeaders.push({ offset, crc32, compressedSize, uncompressedSize, fileNameLen, compressionMethod });
      offset += 30 + fileNameLen + compressedSize;
    }

    const centralDirOffset = offset;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const lh = localHeaders[i];
      const fileNameBuffer = Buffer.from(file.path, "utf-8");
      const fileNameLen = fileNameBuffer.length;

      const entry = Buffer.alloc(46 + fileNameLen);
      entry.writeUInt32LE(CENTRAL_DIR_HEADER, 0);
      entry.writeUInt16LE(VERSION_MADE_BY, 4);
      entry.writeUInt16LE(VERSION_NEEDED, 6);
      entry.writeUInt16LE(0x0800, 8); // UTF-8
      entry.writeUInt16LE(lh.compressionMethod, 10);
      entry.writeUInt16LE(0, 12); // mod time
      entry.writeUInt16LE(0, 14); // mod date
      entry.writeUInt32LE(lh.crc32, 16);
      entry.writeUInt32LE(lh.compressedSize, 20);
      entry.writeUInt32LE(lh.uncompressedSize, 24);
      fileNameBuffer.copy(entry, 28);
      entry.writeUInt16LE(fileNameLen, 28);
      entry.writeUInt16LE(fileNameLen, 30);
      entry.writeUInt32LE(0, 32); // extra field length
      entry.writeUInt16LE(0, 32); // file comment length
      entry.writeUInt16LE(0, 34); // disk number start
      entry.writeUInt16LE(0, 36); // internal file attributes
      entry.writeUInt32LE(0, 38); // external file attributes
      entry.writeUInt32LE(lh.offset, 42);

      fs.writeSync(fd, entry);
      offset += 46 + fileNameLen;
    }

    // End of central directory
    const endOfCentral = Buffer.alloc(22);
    endOfCentral.writeUInt32LE(END_CENTRAL_DIR, 0);
    endOfCentral.writeUInt16LE(0, 4); // disk number
    endOfCentral.writeUInt16LE(0, 6); // disk with central dir
    endOfCentral.writeUInt16LE(files.length, 8); // entries on this disk
    endOfCentral.writeUInt16LE(files.length, 10); // total entries
    endOfCentral.writeUInt32LE(offset - centralDirOffset, 12); // central dir size
    endOfCentral.writeUInt32LE(centralDirOffset, 16); // central dir offset
    endOfCentral.writeUInt16LE(0, 20); // comment length

    fs.writeSync(fd, endOfCentral);
  } finally {
    fs.closeSync(fd);
  }
}

function crc32Compute(data) {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: node package_skill.js <path/to/skill-folder> [output-directory]");
    console.error("");
    console.error("Example:");
    console.error("  node package_skill.js skills/public/my-skill");
    console.error("  node package_skill.js skills/public/my-skill ./dist");
    process.exit(1);
  }

  const skillPath = args[0];
  const outputDir = args[1] || null;

  console.log(`📦 Packaging skill: ${skillPath}`);
  if (outputDir) {
    console.log(`   Output directory: ${outputDir}`);
  }
  console.log();

  const result = packageSkill(skillPath, outputDir);
  process.exit(result ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = { packageSkill, createZipFromDir };

#!/usr/bin/env node
/**
 * repository-resolver.js — Resolve disponibilidade local de repositórios.
 *
 * Uso (CLI):
 *   node .opencode/scripts/repository-resolver.js [--project slug] [--repo role]
 *     [--mapping path] [--root path]
 *
 * Estados de repositório: available, missing, invalid_git.
 * Estados de projeto: complete, partial, absent e invalid. `invalid` é usado
 * quando nenhum repositório está available e ao menos um é invalid_git.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const WORKBENCH_ROOT = path.resolve(__dirname, '..', '..');
const DEFAULT_MAPPING_PATH = path.join(WORKBENCH_ROOT, '.opencode', 'config', 'project-mapping.json');

function loadProjectMapping(mappingPath = DEFAULT_MAPPING_PATH) {
  const resolvedPath = path.resolve(mappingPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Project mapping not found: ${resolvedPath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
  } catch (error) {
    throw new Error(`Invalid project mapping JSON at ${resolvedPath}: ${error.message}`);
  }
}

function isDirectory(targetPath) {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

function hasGitMarker(targetPath) {
  try {
    const stat = fs.statSync(path.join(targetPath, '.git'));
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

function isInsideRoot(targetPath, rootPath) {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath === '' || (!relativePath.startsWith(`..${path.sep}`) && relativePath !== '..' && !path.isAbsolute(relativePath));
}

function findExistingAncestor(targetPath) {
  let current = targetPath;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return current;
}

function resolveSafeRepositoryPath(catalogPath, rootPath) {
  if (typeof catalogPath !== 'string' || path.isAbsolute(catalogPath)) {
    throw new Error(`Unsafe repository path: catalog path must be relative (${catalogPath})`);
  }

  const repositoryPath = path.resolve(rootPath, catalogPath);
  if (!isInsideRoot(repositoryPath, rootPath)) {
    throw new Error(`Unsafe repository path escapes workbench root: ${catalogPath}`);
  }

  const existingAncestor = findExistingAncestor(repositoryPath);
  const realRoot = fs.realpathSync(rootPath);
  if (existingAncestor) {
    const realAncestor = fs.realpathSync(existingAncestor);
    if (!isInsideRoot(realAncestor, realRoot)) {
      throw new Error(`Unsafe repository path escapes workbench root through symlink: ${catalogPath}`);
    }
  }
  return repositoryPath;
}

function findOwningCheckout(repositoryPath, catalogPath, rootPath) {
  const firstSegment = catalogPath.split(/[\\/]/).filter(Boolean)[0];
  const boundary = path.resolve(rootPath, firstSegment);
  let current = repositoryPath;

  while (current === boundary || current.startsWith(`${boundary}${path.sep}`)) {
    if (hasGitMarker(current)) return current;
    if (current === boundary) break;
    current = path.dirname(current);
  }
  return null;
}

function getContext(options = {}) {
  const mappingPath = path.resolve(options.mappingPath || DEFAULT_MAPPING_PATH);
  return {
    mapping: options.mapping || loadProjectMapping(mappingPath),
    mappingPath,
    rootPath: path.resolve(options.rootPath || WORKBENCH_ROOT),
  };
}

function resolveRepository(projectSlug, repoRole, options = {}) {
  const context = getContext(options);
  const project = context.mapping.projects && context.mapping.projects[projectSlug];
  if (!project) throw new Error(`Unknown project: ${projectSlug}`);

  let catalogPath = project.repos && project.repos[repoRole];
  if (projectSlug === 'workbench' && Object.keys(project.repos || {}).length === 0 && repoRole === 'root') {
    catalogPath = '.';
  }
  if (!catalogPath) throw new Error(`Unknown repository role "${repoRole}" for project "${projectSlug}"`);

  const repositoryPath = resolveSafeRepositoryPath(catalogPath, context.rootPath);
  let status = 'missing';
  let gitRoot = null;

  if (fs.existsSync(repositoryPath)) {
    if (isDirectory(repositoryPath)) {
      gitRoot = catalogPath === '.'
        ? (hasGitMarker(repositoryPath) ? repositoryPath : null)
        : findOwningCheckout(repositoryPath, catalogPath, context.rootPath);
    }
    status = gitRoot ? 'available' : 'invalid_git';
  }

  return { project: projectSlug, role: repoRole, catalogPath, path: repositoryPath, status, gitRoot };
}

function aggregateStatus(repositories) {
  const statuses = repositories.map(repository => repository.status);
  if (statuses.every(status => status === 'available')) return 'complete';
  if (statuses.some(status => status === 'available')) return 'partial';
  if (statuses.some(status => status === 'invalid_git')) return 'invalid';
  return 'absent';
}

function resolveProjectRepositories(projectSlug, options = {}) {
  const context = getContext(options);
  const project = context.mapping.projects && context.mapping.projects[projectSlug];
  if (!project) throw new Error(`Unknown project: ${projectSlug}`);

  const roles = Object.keys(project.repos || {});
  if (projectSlug === 'workbench' && roles.length === 0) roles.push('root');
  const repositories = roles.map(role => resolveRepository(projectSlug, role, {
    mapping: context.mapping,
    mappingPath: context.mappingPath,
    rootPath: context.rootPath,
  }));

  return { project: projectSlug, status: aggregateStatus(repositories), repositories };
}

function resolveAllProjects(options = {}) {
  const context = getContext(options);
  return Object.keys(context.mapping.projects || {}).map(projectSlug =>
    resolveProjectRepositories(projectSlug, {
      mapping: context.mapping,
      mappingPath: context.mappingPath,
      rootPath: context.rootPath,
    }));
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!['--project', '--repo', '--mapping', '--root'].includes(flag)) {
      throw new Error(`Unknown argument: ${flag}`);
    }
    const value = args[++index];
    if (!value) throw new Error(`Missing value for ${flag}`);
    if (flag === '--project') options.project = value;
    if (flag === '--repo') options.repo = value;
    if (flag === '--mapping') options.mappingPath = value;
    if (flag === '--root') options.rootPath = value;
  }
  if (options.repo && !options.project) throw new Error('--repo requires --project');
  return options;
}

function cli(args = process.argv.slice(2)) {
  try {
    const options = parseArgs(args);
    let result;
    if (options.project && options.repo) result = resolveRepository(options.project, options.repo, options);
    else if (options.project) result = resolveProjectRepositories(options.project, options);
    else result = resolveAllProjects(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  loadProjectMapping,
  resolveRepository,
  resolveProjectRepositories,
  resolveAllProjects,
};

if (require.main === module) cli();

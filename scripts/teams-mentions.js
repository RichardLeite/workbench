#!/usr/bin/env node
/**
 * Shared utility for resolving Teams @mentions from eligible-reviewers.json.
 * Used by teams-pr and prs-pendentes skills.
 *
 * NOTE: The old MCP (teams_teams_sendMessage) was removed.
 * The Graph API chat tools use
 * mentions format: [{ mention: "Nome", userId: "azure-ad-id" }].
 * Chat messages use indexed tags: <at id="0">Name</at>.
 * Resolve userId via teams-graph_search_users_for_mentions at call site.
 *
 * Usage:
 *   const { extractMentionNames, loadReviewers } = require('./teams-mentions');
 *   const names = extractMentionNames(message);
 *   const reviewers = loadReviewers();
 */

const path = require('path');
const fs = require('fs');

/**
 * Extract names from <at>Name</at> and <at id="N">Name</at> tags.
 * @param {string} message
 * @returns {string[]} Array of names (without <at> tags)
 */
function extractMentionNames(message) {
  const regex = /<at(?:\s[^>]*)?>([^<]+)<\/at>/gi;
  const names = [];
  let match;
  while ((match = regex.exec(message)) !== null) {
    names.push(match[1]);
  }
  return names;
}

/**
 * Load eligible reviewers from config file.
 * @returns {Array<{name: string, email: string, github?: string}>}
 */
function loadReviewers() {
  const configPath = path.resolve(__dirname, '..', '.opencode', 'config', 'eligible-reviewers.json');
  if (!fs.existsSync(configPath)) {
    return [];
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  const config = JSON.parse(raw);
  return config.reviewers || [];
}

/**
 * Build the mentions array from indexed or legacy <at> tags in message.
 * NOTE: The new Graph API tools use format [{ mention, userId }].
 * This function still returns name/email for compatibility —
 * resolve userId via teams-graph_search_users_for_mentions at call site.
 *
 * @param {string} message - The message containing <at id="N">Name</at> tags
 * @param {Array<{name: string, email: string}>} [reviewers] - Optional pre-loaded reviewer list
 * @returns {Array<{name: string, email: string}>}
 */
function buildMentionsArray(message, reviewers) {
  const names = extractMentionNames(message);
  const reviewerList = reviewers || loadReviewers();

  return names.map(name => {
    const reviewer = reviewerList.find(r => r.name === name);
    return {
      name,
      email: reviewer ? reviewer.email : ''
    };
  });
}

module.exports = {
  extractMentionNames,
  loadReviewers,
  buildMentionsArray,
};

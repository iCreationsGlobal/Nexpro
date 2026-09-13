const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Ignore duplicate dependency folders created by filesystem copy/sync operations.
// Metro otherwise crawls these unused copies while initializing its file map.
const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList) ? existingBlockList : existingBlockList ? [existingBlockList] : []),
  /[/\\]node_modules[/\\](?:@[^/\\]+[/\\])?[^/\\]* \d+(?:\.[^/\\]+)?(?:[/\\]|$)/,
];

module.exports = config;

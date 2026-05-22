import { tabs } from '../data/lifeosData';

const validTabIds = new Set(tabs.map((tab) => tab.id));

const canonicalPaths = {
  home: '/',
  calendar: '/calendar',
  memos: '/memos',
  projects: '/projects',
  health: '/health',
  workout: '/workout',
  finances: '/finances',
  assistant: '/assistant',
};

const pathAliases = {
  '/': 'home',
  '/home': 'home',
  '/pulse': 'home',
  '/calendar': 'calendar',
  '/memos': 'memos',
  '/projects': 'projects',
  '/ops': 'projects',
  '/health': 'health',
  '/workout': 'workout',
  '/finances': 'finances',
  '/money': 'finances',
  '/assistant': 'assistant',
  '/ai': 'assistant',
};

export function isValidTabId(tabId) {
  return validTabIds.has(tabId);
}

export function normalizePathname(pathname) {
  const rawPath = String(pathname || '/').split('?')[0].split('#')[0] || '/';
  const withoutTrailingSlash = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath;
  return withoutTrailingSlash.toLowerCase() || '/';
}

export function pathToTab(pathname) {
  const tabId = pathAliases[normalizePathname(pathname)] ?? 'home';
  return isValidTabId(tabId) ? tabId : 'home';
}

export function tabToPath(tabId) {
  return canonicalPaths[isValidTabId(tabId) ? tabId : 'home'] ?? '/';
}

export function tabFromCurrentPath() {
  if (typeof window === 'undefined') return 'home';
  return pathToTab(window.location.pathname);
}

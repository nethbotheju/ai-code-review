import { minimatch } from 'minimatch';

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export const DEFAULT_EXCLUDES = [
  '**/package-lock.json',
  '**/yarn.lock',
  '**/pnpm-lock.yaml',
  '**/npm-shrinkwrap.json',
  '**/composer.lock',
  '**/Gemfile.lock',
  '**/Cargo.lock',
  '**/go.sum',
  '**/poetry.lock',
  '**/*.lock',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.map',
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/node_modules/**',
  '**/__pycache__/**',
  '**/.git/**',
];

// Test a path against glob exclude patterns.
// Also tests with a trailing slash so `**/node_modules/**` matches the bare dir.
export function isExcluded(filePath: string, patterns: string[]): boolean {
  return patterns.some(
    (p) => minimatch(filePath, p, { dot: true }) || minimatch(filePath + '/', p, { dot: true }),
  );
}

/** Resolve the full exclude list (defaults + user patterns) for a given inputs config. */
export function resolveExcludes(opts: {
  useDefaultExcludes: boolean;
  excludePatterns: string[];
}): string[] {
  return [...(opts.useDefaultExcludes ? DEFAULT_EXCLUDES : []), ...opts.excludePatterns];
}

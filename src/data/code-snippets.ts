import { SeededRNG } from '@/engine/rng';
import type { CodeLanguage } from '@/engine/types';

export const CODE_LANGUAGES: ReadonlyArray<{ id: CodeLanguage; label: string }> = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'sql', label: 'SQL' },
];

type SnippetTemplate = (value: number) => string[];

// Six hand-written exercises per language, each with 48 useful input variants.
// Lines stay short enough to practice on narrow screens without horizontal scrolling.
const TEMPLATES: Record<CodeLanguage, readonly SnippetTemplate[]> = {
  javascript: [
    (n) => [
      `const scores = [8, ${n}, 21];`,
      'const total = scores.reduce(',
      '  (sum, score) => sum + score,',
      '  0',
      ');',
      'console.log(total);',
    ],
    (n) => [
      'function clamp(value) {',
      `  const max = ${n};`,
      '  return Math.min(value, max);',
      '}',
      'console.log(clamp(12));',
    ],
    (n) => [
      `const limit = ${n};`,
      'const values = [1, 4, 9, 16];',
      'const small = values.filter(',
      '  (value) => value < limit',
      ');',
      'console.log(small);',
    ],
    (n) => [
      `const tax = ${n} / 100;`,
      'const prices = [20, 40, 60];',
      'const totals = prices.map(',
      '  (price) => price * (1 + tax)',
      ');',
      'console.log(totals);',
    ],
    (n) => [
      `const target = ${n};`,
      'const seen = new Set([2, 4, 6]);',
      'if (!seen.has(target)) {',
      '  seen.add(target);',
      '}',
      'console.log(seen.size);',
    ],
    (n) => [
      'async function loadCount() {',
      `  const value = ${n};`,
      '  return Promise.resolve(value);',
      '}',
      'loadCount().then(console.log);',
    ],
  ],
  typescript: [
    (n) => [
      'interface Item {',
      '  name: string;',
      '  count: number;',
      '}',
      `const item: Item = { name: "pen", count: ${n} };`,
      'console.log(item.count);',
    ],
    (n) => [
      'type Result = number | null;',
      'function double(value: Result) {',
      '  if (value === null) return 0;',
      '  return value * 2;',
      '}',
      `console.log(double(${n}));`,
    ],
    (n) => [
      'function first<T>(items: T[]): T {',
      '  return items[0];',
      '}',
      `const value = first([${n}, 4, 8]);`,
      'console.log(value);',
    ],
    (n) => [
      `const limit: number = ${n};`,
      'const values: number[] = [1, 5, 9];',
      'const kept = values.filter(',
      '  (value) => value >= limit',
      ');',
      'console.log(kept);',
    ],
    (n) => [
      'type Point = [number, number];',
      `const point: Point = [${n}, 7];`,
      'const [x, y] = point;',
      'console.log(x + y);',
    ],
    (n) => [
      'class Counter {',
      '  constructor(public value: number) {}',
      '  increment(): void {',
      '    this.value += 1;',
      '  }',
      '}',
      `const counter = new Counter(${n});`,
      'counter.increment();',
    ],
  ],
  python: [
    (n) => [
      'def clamp(value):',
      `  limit = ${n}`,
      '  return min(value, limit)',
      'print(clamp(12))',
    ],
    (n) => [
      `limit = ${n}`,
      'for value in range(limit):',
      '  if value % 2 == 0:',
      '    print(value)',
    ],
    (n) => [
      `size = ${n}`,
      'squares = [x * x for x in range(size)]',
      'print(squares[:3])',
    ],
    (n) => [
      `stock = {"pens": ${n}}`,
      'stock["pens"] += 1',
      'print(stock.get("pens", 0))',
    ],
    (n) => [
      `names = ["Ada", "Lin", "Sam"] * ${n}`,
      'for index, name in enumerate(names):',
      '  if index < 3:',
      '    print(index, name)',
    ],
    (n) => [
      `raw = "${n}"`,
      'try:',
      '  value = int(raw)',
      'except ValueError:',
      '  value = 0',
      'print(value)',
    ],
  ],
  html: [
    (n) => [
      `<article data-id="${n}">`,
      '  <h2>Today\'s notes</h2>',
      '  <p>Practice a little each day.</p>',
      '</article>',
    ],
    (n) => [
      '<form action="/search">',
      '  <label for="query">Search</label>',
      `  <input id="query" maxlength="${n}">`,
      '  <button>Go</button>',
      '</form>',
    ],
    (n) => [
      '<nav aria-label="Sections">',
      '  <ul>',
      `    <li><a href="/page/${n}">Docs</a></li>`,
      '  </ul>',
      '</nav>',
    ],
    (n) => [
      '<figure>',
      `  <img src="/photo-${n}.png" alt="Tree">`,
      '  <figcaption>Morning light</figcaption>',
      '</figure>',
    ],
    (n) => [
      '<table>',
      '  <tr><th>Item</th><th>Qty</th></tr>',
      `  <tr><td>Pen</td><td>${n}</td></tr>`,
      '</table>',
    ],
    (n) => [
      '<details>',
      '  <summary>Show steps</summary>',
      `  <p>Complete ${n} repetitions.</p>`,
      '</details>',
    ],
  ],
  css: [
    (n) => [
      `.card-${n} {`,
      '  display: flex;',
      '  align-items: center;',
      '  gap: 1rem;',
      '}',
    ],
    (n) => [
      `.button-${n}:hover {`,
      '  background: #173a2e;',
      '  color: white;',
      '  transform: translateY(-2px);',
      '}',
    ],
    (n) => [
      `.gallery-${n} {`,
      '  display: grid;',
      '  grid-template-columns: repeat(3, 1fr);',
      '  gap: 12px;',
      '}',
    ],
    (n) => [
      `@media (max-width: ${n * 20}px) {`,
      '  .sidebar {',
      '    display: none;',
      '  }',
      '}',
    ],
    (n) => [
      `.panel-${n} {`,
      '  --space: 8px;',
      '  padding: var(--space);',
      '  border: 1px solid currentColor;',
      '}',
    ],
    (n) => [
      `@keyframes pulse-${n} {`,
      '  from { opacity: .5; }',
      '  to { opacity: 1; }',
      '}',
    ],
  ],
  sql: [
    (n) => [
      'SELECT name, score',
      'FROM players',
      `WHERE score >= ${n}`,
      'ORDER BY score DESC;',
    ],
    (n) => [
      'SELECT category, COUNT(*) AS total',
      'FROM products',
      `WHERE price > ${n}`,
      'GROUP BY category;',
    ],
    (n) => [
      'SELECT o.id, c.name',
      'FROM orders AS o',
      'JOIN customers AS c',
      '  ON c.id = o.customer_id',
      `WHERE o.total > ${n};`,
    ],
    (n) => [
      'INSERT INTO inventory (name, qty)',
      `VALUES ('notebook', ${n});`,
    ],
    (n) => [
      'UPDATE inventory',
      `SET qty = qty + ${n}`,
      "WHERE name = 'notebook';",
    ],
    (n) => [
      'WITH recent AS (',
      '  SELECT id, created_at',
      '  FROM orders',
      `  WHERE id > ${n}`,
      ')',
      'SELECT * FROM recent;',
    ],
  ],
};

export const CODE_TESTS_PER_LANGUAGE = 288;
export const CODE_TEST_COUNT = CODE_LANGUAGES.length * CODE_TESTS_PER_LANGUAGE;

export function generateCodeLines(seed?: number | string, language: CodeLanguage = 'javascript'): string[] {
  const templates = TEMPLATES[language];
  const index = typeof seed === 'number'
    ? Math.abs(Math.trunc(seed)) % CODE_TESTS_PER_LANGUAGE
    : new SeededRNG(seed).nextInt(0, CODE_TESTS_PER_LANGUAGE - 1);
  const templateIndex = index % templates.length;
  const value = 2 + Math.floor(index / templates.length);
  return templates[templateIndex](value);
}

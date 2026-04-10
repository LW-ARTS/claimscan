import type { Reporter, TestModule, TestSuite, TestCase, TestRunEndReason } from 'vitest/node';
import { experimental_getRunnerTask } from 'vitest/node';
import type { SerializedError } from 'vitest/node';
import type { Benchmark } from 'vitest';
import type { TaskResult } from 'tinybench';

function percentile(sorted: number[], p: number): number {
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

export default class BenchReporter implements Reporter {
  onTestRunEnd(testModules: ReadonlyArray<TestModule>, _unhandledErrors: ReadonlyArray<SerializedError>, _reason: TestRunEndReason) {
    const rows: Array<{
      adapter: string;
      method: string;
      samples: number;
      p50ms: number;
      p95ms: number;
      warn: boolean;
    }> = [];

    for (const testModule of testModules) {
      for (const suite of testModule.children.suites()) {
        const suiteName = (suite as TestSuite).name;
        for (const testCase of (suite as TestSuite).children.tests()) {
          const runnerTask = experimental_getRunnerTask(testCase as TestCase) as Benchmark;
          if (!runnerTask.meta?.benchmark) continue;
          const result = runnerTask.meta.result as TaskResult | undefined;
          if (!result?.samples?.length) continue;

          const sorted = [...result.samples].sort((a, b) => a - b);
          const p50 = percentile(sorted, 0.5);
          const p95 = percentile(sorted, 0.95);
          rows.push({
            adapter: suiteName,
            method: (testCase as TestCase).name,
            samples: sorted.length,
            p50ms: Math.round(p50),
            p95ms: Math.round(p95),
            warn: p95 > 10_000,
          });
        }
      }
    }

    if (rows.length === 0) return;

    const COL = { adapter: 12, method: 24, samples: 9, p50: 10, p95: 10 };
    const header =
      'Adapter'.padEnd(COL.adapter) +
      'Method'.padEnd(COL.method) +
      'Samples'.padStart(COL.samples) +
      'p50 (ms)'.padStart(COL.p50) +
      'p95 (ms)'.padStart(COL.p95);
    const sep = '-'.repeat(header.length);

    console.log('\n--- Adapter Latency Benchmark Report ---');
    console.log(header);
    console.log(sep);
    for (const r of rows) {
      const warn = r.warn ? '  WARN: p95 > 10s' : '';
      console.log(
        r.adapter.padEnd(COL.adapter) +
        r.method.padEnd(COL.method) +
        String(r.samples).padStart(COL.samples) +
        String(r.p50ms).padStart(COL.p50) +
        String(r.p95ms).padStart(COL.p95) +
        warn,
      );
    }
    console.log(sep);
  }
}

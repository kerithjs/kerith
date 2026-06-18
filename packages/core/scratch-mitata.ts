import { run, bench } from 'mitata';

bench('noop', () => {
  return 1 + 1;
});

async function main() {
  let jsonOutput = '';
  await run({
    colors: false,
    format: 'json',
    print: (data) => {
      jsonOutput += data;
    }
  });
  const parsed = JSON.parse(jsonOutput);
  console.log(Object.keys(parsed.benchmarks[0].runs[0].stats));
  console.log(parsed.benchmarks[0].runs[0].stats);
}

main().catch(console.error);

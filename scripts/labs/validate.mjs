const url = process.env.API_URL || 'http://localhost:3001';
const response = await fetch(`${url}/api/workshop/validate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
  signal: AbortSignal.timeout(120000),
});
const result = await response.json();
if (!response.ok) throw new Error(result.error);
for (const exercise of result.exercises)
  console.log(`${exercise.id}: ${exercise.status} — ${exercise.message}`);
if (result.exercises.some((e) => e.status !== 'passed')) process.exitCode = 1;

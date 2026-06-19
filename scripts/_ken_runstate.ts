// @ts-expect-error runtime .ts
const { db } = await import('../lib/db.ts');
const runs = await db.run.findMany({ orderBy: { createdAt: 'desc' }, take: 5 });
for (const r of runs) {
  const arts = await db.factoryArtifact.count({ where: { runId: r.id } });
  const gls = await db.gateLog.count({ where: { runId: r.id } });
  console.log(`RUN ${r.id} status=${r.status} stage=${r.stage} artifacts=${arts} gatelogs=${gls} created=${r.createdAt.toISOString()}`);
  console.log(`   seed: ${String(r.seed).slice(0,80)}`);
}
await db.$disconnect();

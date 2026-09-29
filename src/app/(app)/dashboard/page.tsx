import { requireSession } from "@/lib/auth/guards";
import { db } from "@/lib/db";
import { processingLogs, sources } from "@/lib/db/schema";
import { desc, sql } from "drizzle-orm";

export default async function DashboardPage() {
  await requireSession();

  const [statusRows, recentLogs] = await Promise.all([
    db
      .select({
        status: sources.status,
        count: sql<number>`count(*)`,
      })
      .from(sources)
      .groupBy(sources.status),
    db
      .select()
      .from(processingLogs)
      .orderBy(desc(processingLogs.createdAt))
      .limit(12),
  ]);

  return (
    <div className="p-8 max-w-5xl">
      <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
        Đo lường pipeline
      </p>
      <h2 className="text-3xl font-semibold mt-1 mb-8">Tổng quan xử lý</h2>
      <div className="grid sm:grid-cols-3 gap-4 mb-10">
        {statusRows.map((row) => (
          <div
            key={row.status}
            className="bg-white border border-[var(--line)] rounded-2xl p-5"
          >
            <p className="text-sm text-[var(--muted)]">{row.status}</p>
            <p className="text-3xl font-semibold mt-2">{row.count}</p>
          </div>
        ))}
      </div>
      <h3 className="font-medium mb-3">Log thời gian gần nhất</h3>
      <div className="bg-white border border-[var(--line)] rounded-2xl overflow-hidden">
        {recentLogs.map((log) => (
          <div
            key={log.id}
            className="flex justify-between px-4 py-2 border-b border-[var(--line)] text-sm"
          >
            <span>
              {log.step} · {log.sourceId.slice(0, 8)}
            </span>
            <span className="font-mono">{log.durationMs}ms</span>
          </div>
        ))}
      </div>
    </div>
  );
}

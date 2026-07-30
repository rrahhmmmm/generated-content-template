import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertUser } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const gate = await assertUser();
  if (gate) return gate;
  const { taskId } = await params;
  const task = await prisma.thumbnailTask.findUnique({ where: { id: taskId } });
  if (!task) {
    return NextResponse.json({ error: "Task tidak ditemukan" }, { status: 404 });
  }
  return NextResponse.json({
    id: task.id,
    status: task.status,
    progress: safeJson(task.progress, { done: 0, total: 0 }),
    items: safeJson(task.items, []),
    warnings: safeJson(task.warnings, []),
    error: task.error,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  });
}

function safeJson<T>(s: string, fallback: T): T {
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

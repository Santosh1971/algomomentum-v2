// GET: engine catalogue + this strategy's current (merged) config.
// PUT: attach/detach an engine and save its parameters.
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { NEXT_AUTH } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ENGINES, resolveEngineConfig } from "@/lib/strategyEngine/registry";

async function requireAdmin() {
  const session = await getServerSession(NEXT_AUTH);
  return session?.user?.role === "admin";
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const s: any = await prisma.strategy.findUnique({ where: { id } });
  if (!s) return NextResponse.json({ error: "Strategy not found" }, { status: 404 });

  const engines = Object.entries(ENGINES).map(([key, e]) => ({
    key, label: e.label, candleResolution: e.candleResolution, fields: e.fields, defaults: e.defaults,
  }));
  const config = s.engineType && ENGINES[s.engineType] ? resolveEngineConfig(s.engineType, s.engineConfig) : null;
  return NextResponse.json({ engineType: s.engineType ?? null, config, engines });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const engineType: string | null = body.engineType || null;

  if (engineType && !ENGINES[engineType]) return NextResponse.json({ error: "Unknown engine" }, { status: 400 });
  const config = engineType ? resolveEngineConfig(engineType, body.config) : null;

  await prisma.strategy.update({
    where: { id },
    data: { engineType, engineConfig: config ?? undefined } as any,
  });
  return NextResponse.json({ engineType, config });
}

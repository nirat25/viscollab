import { NextResponse } from "next/server";
import { PersistenceCommandService, persistenceRepository } from "@/server/persistence";
import { requireAccountSession } from "@/server/auth/session";

function text(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum ? value.trim() : null;
}

export async function GET(request: Request) {
  const session = await requireAccountSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const workspaceId = new URL(request.url).searchParams.get("workspaceId") ?? undefined;
    const documents = await (await persistenceRepository()).listDocuments(session.accountId, workspaceId);
    // Workspace navigation never implies document visibility: repository query
    // joins direct room membership only.
    return NextResponse.json({ success: true, documents });
  } catch {
    return NextResponse.json({ error: "Failed to fetch documents" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAccountSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json();
    const title = text(body.name ?? body.title, 300);
    const html = text(body.html, 5_000_000);
    const workspaceId = text(body.workspaceId, 200);
    if (!title || !html || !workspaceId) return NextResponse.json({ error: "name, html and workspaceId are required" }, { status: 400 });
    // Command service validates state shape/semantic artifact and confirms the
    // workspace owner's authority before creating its direct owner membership.
    const document = await new PersistenceCommandService(await persistenceRepository()).createDocument({
      accountId: session.accountId, workspaceId, title, html,
      ...(body.semanticArtifact ? { semanticArtifact: body.semanticArtifact } : {}),
      ...(body.visualPlan ? { visualPlan: body.visualPlan } : {}),
    });
    return NextResponse.json({ success: true, document: { id: document.documentId, name: document.title, workspaceId: document.workspaceId, kind: document.kind, revision: document.revision } }, { status: 201 });
  } catch (error: any) {
    const status = error?.status === 403 ? 403 : error?.name === "CommandValidationError" ? 400 : 500;
    return NextResponse.json({ error: status === 500 ? "Failed to create document" : error.message }, { status });
  }
}

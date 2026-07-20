import { authorize, type AccountId } from "htmlcollab-app/persistence";
import type { WorkspaceRecord } from "./repository";

export function workspaceCatalogProjection(accountId: AccountId, workspace: WorkspaceRecord) {
  const owner = workspace.ownerAccountId === accountId;
  return {
    ...workspace,
    capabilities: owner && authorize({ accountId }, { workspaceId: workspace.id, workspaceRole: "owner" }, "workspace.create_document", { workspaceOwnerAccountId: workspace.ownerAccountId })
      ? ["workspace.create_document", "workspace.member_manage"] as const
      : [] as const,
  };
}

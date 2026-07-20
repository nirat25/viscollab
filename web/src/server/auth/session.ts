import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";

export async function requireAccountSession(): Promise<{ accountId: string; username: string } | null> {
  const session = await getServerSession(authOptions);
  const accountId = session?.user?.accountId;
  const username = session?.user?.name;
  return typeof accountId === "string" && accountId.length > 0 && typeof username === "string" && username.length > 0
    ? { accountId, username }
    : null;
}

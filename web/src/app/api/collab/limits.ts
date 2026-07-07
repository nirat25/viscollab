import { getUsers, saveUsers } from "./db";

// Usage limit configurations. Bypassed or set high in test environments.
const isTest = process.env.PLAYWRIGHT_TEST === "true";
const MAX_DAILY_CONVERSIONS = isTest ? 1000 : parseInt(process.env.MAX_DAILY_CONVERSIONS || "5", 10);
const MAX_DAILY_EDITS = isTest ? 1000 : parseInt(process.env.MAX_DAILY_EDITS || "10", 10);

export interface LimitCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

/**
 * Checks if the user is allowed to make another request of a given type today.
 * If allowed, increments the counter and saves user data.
 * 
 * @param username The name of the user whose limits are being checked.
 * @param type The type of operation, either "conversion" or "edit".
 */
export async function checkAndIncrementLimit(
  username: string,
  type: "conversion" | "edit"
): Promise<LimitCheckResult> {
  const users = await getUsers();
  const user = users.find(
    (u: any) => u.username?.toLowerCase() === username.toLowerCase()
  );

  if (!user) {
    // If user doesn't exist, return not allowed.
    return { allowed: false, remaining: 0, limit: 0 };
  }

  const today = new Date().toISOString().split("T")[0]; // format: YYYY-MM-DD
  const limit = type === "conversion" ? MAX_DAILY_CONVERSIONS : MAX_DAILY_EDITS;

  // Initialize usage stats if they don't exist or if a new day has started
  if (!user.usageStats || user.usageStats.date !== today) {
    user.usageStats = {
      date: today,
      conversionCount: 0,
      editCount: 0
    };
  }

  const currentCount = type === "conversion" ? user.usageStats.conversionCount : user.usageStats.editCount;

  if (currentCount >= limit) {
    return {
      allowed: false,
      remaining: 0,
      limit
    };
  }

  // Increment usage count
  if (type === "conversion") {
    user.usageStats.conversionCount++;
  } else {
    user.usageStats.editCount++;
  }

  // Save the updated list of users to the database
  await saveUsers(users);

  return {
    allowed: true,
    remaining: limit - (currentCount + 1),
    limit
  };
}

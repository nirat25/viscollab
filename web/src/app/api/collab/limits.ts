import { getUsers, saveUsers } from "./db";

// Usage limit configurations. Bypassed or set high in test environments.
const isTest = process.env.PLAYWRIGHT_TEST === "true";
const MAX_DAILY_CONVERSIONS = isTest ? 1000 : parseInt(process.env.MAX_DAILY_CONVERSIONS || "5", 10);
const MAX_DAILY_EDITS = isTest ? 1000 : parseInt(process.env.MAX_DAILY_EDITS || "10", 10);
const MAX_DAILY_ASKS = isTest ? 1000 : parseInt(process.env.MAX_DAILY_ASKS || "20", 10);

export interface LimitCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
}

interface UsageStats {
  date?: string;
  conversionCount?: number;
  editCount?: number;
  askCount?: number;
}

interface UsageUser {
  username?: unknown;
  usageStats?: UsageStats;
}

function isUsageUser(value: unknown): value is UsageUser {
  return typeof value === "object" && value !== null;
}

/**
 * Checks if the user is allowed to make another request of a given type today.
 * If allowed, increments the counter and saves user data.
 * 
 * @param username The name of the user whose limits are being checked.
 * @param type The type of operation.
 */
export async function checkAndIncrementLimit(
  username: string,
  type: "conversion" | "edit" | "ask"
): Promise<LimitCheckResult> {
  const users = await getUsers();
  const user = users.find(
    (candidate: unknown): candidate is UsageUser =>
      isUsageUser(candidate) && typeof candidate.username === "string" &&
      candidate.username.toLowerCase() === username.toLowerCase()
  );

  if (!user) {
    // If user doesn't exist, return not allowed.
    return { allowed: false, remaining: 0, limit: 0 };
  }

  const today = new Date().toISOString().split("T")[0]; // format: YYYY-MM-DD
  // Initialize usage stats if they don't exist or if a new day has started
  let usage = user.usageStats;
  if (!usage || usage.date !== today) {
    usage = {
      date: today,
      conversionCount: 0,
      editCount: 0,
      askCount: 0,
    };
    user.usageStats = usage;
  }

  // Existing user records predate Ask. Normalize the newly introduced counter
  // without resetting the other same-day counters.
  if (typeof usage.conversionCount !== "number") usage.conversionCount = 0;
  if (typeof usage.editCount !== "number") usage.editCount = 0;
  if (typeof usage.askCount !== "number") usage.askCount = 0;

  const limit = type === "conversion"
    ? MAX_DAILY_CONVERSIONS
    : type === "edit"
      ? MAX_DAILY_EDITS
      : MAX_DAILY_ASKS;
  const currentCount = type === "conversion"
    ? usage.conversionCount
    : type === "edit"
      ? usage.editCount
      : usage.askCount;

  if (currentCount >= limit) {
    return {
      allowed: false,
      remaining: 0,
      limit
    };
  }

  // Increment usage count
  if (type === "conversion") {
    usage.conversionCount++;
  } else if (type === "edit") {
    usage.editCount++;
  } else {
    usage.askCount++;
  }

  // Save the updated list of users to the database
  await saveUsers(users);

  return {
    allowed: true,
    remaining: limit - (currentCount + 1),
    limit
  };
}

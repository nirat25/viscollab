"use client";

/**
 * ReviewRail (ROOM-002) — thin wrapper hosting the existing `CommentSidebar`
 * AS-IS (brief §7.2: Phase 7 redesigns the review rail; this run just moves
 * it under the new layout). `CommentSidebar` already carries the
 * `tour-right-collab` id and its own `pane-right-sidebar` chrome, so this
 * wrapper adds no markup of its own — it exists purely so DecisionRoomLayout's
 * component tree matches the brief's named tree without DecisionRoomApp
 * importing CommentSidebar directly.
 */

import CommentSidebar from "@/components/CommentSidebar";
import type { ComponentProps } from "react";

export type ReviewRailProps = ComponentProps<typeof CommentSidebar>;

export default function ReviewRail(props: ReviewRailProps) {
  return <CommentSidebar {...props} />;
}

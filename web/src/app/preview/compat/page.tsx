/**
 * TIP-001 compat smoke route (dev-only). Server component that mounts the
 * client smoke. Reachable at /preview/compat. Delete once TipTap is proven in
 * the real canvas — kept as the documented compat gate for reviewers.
 */

import CompatSmoke from "@/components/tiptap/CompatSmoke";

export default function CompatPreviewPage() {
  return <CompatSmoke />;
}

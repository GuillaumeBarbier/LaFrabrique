import type { BookStatus } from "@/lib/book";
import { STATUS_HINTS, STATUS_LABELS } from "@/lib/book";
import { Badge, type BadgeTone } from "@/components/ui/controls";

export const STATUS_TONES: Record<BookStatus, BadgeTone> = {
  idea: "neutral",
  writing: "signal",
  illustrating: "gold",
  review: "warning",
  done: "success",
};

export function StatusBadge({ status }: { status: BookStatus }) {
  return (
    <Badge tone={STATUS_TONES[status]} title={STATUS_HINTS[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

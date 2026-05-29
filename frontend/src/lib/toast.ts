// Tiny wrapper around `sonner` so action sites stay one-liners and we have a
// single place to tune defaults (Phase 5 §5). The <Toaster> is mounted once in
// main.tsx. Keep inline error messages where they already exist — these toasts
// are additive, not a replacement.
import { toast as sonner } from "sonner";

export const toast = {
  success(message: string): void {
    sonner.success(message);
  },
  error(message: string): void {
    sonner.error(message);
  },
  info(message: string): void {
    sonner.message(message);
  },
};

/** Best-effort message extraction from an unknown thrown value. */
export function toastError(e: unknown, fallback: string): void {
  toast.error(e instanceof Error ? e.message : fallback);
}

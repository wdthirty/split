import { nameColor } from "@/lib/nameColor";

// A person's name, colored from a hash of the name so the same person looks
// consistent everywhere.
//   "pill"      — filled colored chip (good as a standalone identity badge).
//   "underline" — normal text with a colored underline (cleaner inline, in lists).
export function NameTag({
  name,
  variant = "pill",
}: {
  name: string;
  variant?: "pill" | "underline";
}) {
  const { text, bg } = nameColor(name);

  if (variant === "underline") {
    return (
      <span
        className="font-medium text-ink-100 underline decoration-2 underline-offset-2"
        style={{ textDecorationColor: text }}
      >
        {name}
      </span>
    );
  }

  return (
    <span
      className="inline-block rounded p-1 font-medium leading-none"
      style={{ color: text, backgroundColor: bg }}
    >
      {name}
    </span>
  );
}

import { nameColor } from "@/lib/nameColor";

// A person's name, colored from a hash of the name so the same person looks
// consistent everywhere.
//   "pill"      — filled colored chip (good as a standalone identity badge).
//   "underline" — normal text with a colored underline (cleaner inline, in lists).
// isMe: the logged-in user is shown as plain "You" (no color/underline) so the
// reader isn't tagging themselves — except in the header, which still greets by name.
export function NameTag({
  name,
  variant = "pill",
  isMe = false,
}: {
  name: string;
  variant?: "pill" | "underline";
  isMe?: boolean;
}) {
  if (isMe) {
    return <span className="font-medium text-white">You</span>;
  }

  const { text, bg } = nameColor(name);

  if (variant === "underline") {
    return (
      <span
        className="font-medium text-white underline decoration-2 underline-offset-2"
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

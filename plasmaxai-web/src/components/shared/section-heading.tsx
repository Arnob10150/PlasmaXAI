import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description?: string;
  invert?: boolean;
  className?: string;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  invert = false,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn("max-w-3xl space-y-3", className)}>
      <p className={cn("text-sm font-semibold uppercase tracking-[0.24em]", invert ? "text-blue-200" : "text-blue-700")}>
        {eyebrow}
      </p>
      <h2 className={cn("text-3xl font-semibold tracking-tight sm:text-4xl", invert ? "text-white" : "text-slate-950")}>
        {title}
      </h2>
      {description ? (
        <p className={cn("max-w-2xl text-base leading-7", invert ? "text-slate-300" : "text-slate-600")}>
          {description}
        </p>
      ) : null}
    </div>
  );
}


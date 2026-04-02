import Image from "next/image";
import { cn } from "@/lib/utils";

export function LogoLockup({
  invert = false,
}: {
  invert?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center overflow-hidden rounded-[18px] border shadow-lg",
          invert
            ? "border-white/10 bg-white/10"
            : "border-slate-200/80 bg-white",
        )}
      >
        <Image
          alt="PlasmaXAI icon"
          className="h-10 w-10 object-contain"
          height={40}
          priority
          src="/icon.png"
          width={40}
        />
      </div>
      <div>
        <p className={cn("text-sm font-medium", invert ? "text-white/80" : "text-slate-500")}>Clinical AI workspace</p>
        <p className={cn("text-lg font-semibold", invert ? "text-white" : "text-slate-950")}>PlasmaXAI</p>
      </div>
    </div>
  );
}

import * as React from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-[linear-gradient(135deg,#2563eb,#0f766e)] px-5 py-3 text-white shadow-[0_14px_28px_rgba(37,99,235,0.26)] hover:translate-y-[-1px] hover:shadow-[0_18px_36px_rgba(37,99,235,0.32)]",
        secondary:
          "border border-slate-200 bg-white px-5 py-3 text-slate-900 shadow-sm hover:translate-y-[-1px] hover:border-slate-300 hover:bg-slate-50 hover:shadow-md",
        ghost:
          "px-4 py-2 text-slate-700 hover:translate-y-[-1px] hover:bg-slate-100 hover:text-slate-950",
        "ghost-light":
          "border border-white/15 bg-white/8 px-5 py-3 text-white hover:translate-y-[-1px] hover:bg-white/14 hover:shadow-md",
      },
      size: {
        default: "h-11",
        lg: "h-12 px-6 text-sm",
        sm: "h-9 px-4 text-xs",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  href?: string;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  href,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size, className }));

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<{ className?: string }>, {
      className: cn(classes, (children.props as { className?: string }).className),
    });
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}


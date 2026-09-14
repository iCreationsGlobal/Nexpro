import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "onBrand" | "onBrandOutline";
};

export function Button({ className, variant = "primary", ...props }: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition",
        variant === "primary" &&
          "bg-[var(--sabito-green)] text-white hover:bg-[var(--sabito-green-dark)]",
        variant === "outline" &&
          "border border-brand-300 bg-white text-brand-800 hover:bg-brand-50",
        variant === "ghost" && "text-brand-700 hover:bg-brand-100",
        variant === "onBrand" &&
          "bg-white text-[var(--sabito-green)] hover:bg-[var(--sabito-mint)]",
        variant === "onBrandOutline" &&
          "border border-white bg-transparent text-white hover:bg-white/15",
        className
      )}
      {...props}
    />
  );
}

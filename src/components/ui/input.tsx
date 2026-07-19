import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-border bg-surface px-3 text-body text-text placeholder:text-text-subtle disabled:cursor-not-allowed disabled:opacity-50",
          "focus:outline-none focus:border-accent",
          "file:mr-3 file:border-0 file:bg-transparent file:text-label file:font-medium file:text-text",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

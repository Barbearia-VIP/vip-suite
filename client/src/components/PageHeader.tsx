import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  badge?: ReactNode;
}

export default function PageHeader({ title, description, actions, className, badge }: PageHeaderProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 mb-6", className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-foreground leading-tight font-display tracking-tight">{title}</h1>
          {badge}
        </div>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">{actions}</div>
      )}
    </div>
  );
}

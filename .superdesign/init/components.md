# Shared UI Components

Framework: React 19 + Next.js 16 App Router。Component library: custom shadcn/Radix primitives。CSS: Tailwind CSS v4 + CSS variables。

## alert-dialog

Path: `src/components/ui/alert-dialog.tsx`

带确认与取消动作的危险操作确认弹窗。

```tsx
"use client";

import { AlertDialog as AlertDialogPrimitive } from "radix-ui";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  modalContentClassName,
  overlayClassName,
} from "@/components/ui/overlay-styles";
import { cn } from "@/lib/utils";

function AlertDialog(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Root>,
) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>,
) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

function AlertDialogPortal(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Portal>,
) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  );
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      className={cn(
        overlayClassName,
        className,
      )}
      data-slot="alert-dialog-overlay"
      {...props}
    />
  );
}

function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        className={cn(
          modalContentClassName,
          className,
        )}
        data-slot="alert-dialog-content"
        {...props}
      />
    </AlertDialogPortal>
  );
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1", className)}
      data-slot="alert-dialog-header"
      {...props}
    />
  );
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      data-slot="alert-dialog-footer"
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      className={cn("text-lg font-[650] text-forest-950", className)}
      data-slot="alert-dialog-title"
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      className={cn("text-[13px] leading-5 text-muted-foreground", className)}
      data-slot="alert-dialog-description"
      {...props}
    />
  );
}

function AlertDialogAction({
  className,
  variant = "destructive-confirm",
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <Button asChild size={size} variant={variant}>
      <AlertDialogPrimitive.Action
        className={className}
        data-slot="alert-dialog-action"
        {...props}
      />
    </Button>
  );
}

function AlertDialogCancel({
  className,
  variant = "secondary",
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">) {
  return (
    <Button asChild size={size} variant={variant}>
      <AlertDialogPrimitive.Cancel
        className={className}
        data-slot="alert-dialog-cancel"
        {...props}
      />
    </Button>
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
};
```

## alert

Path: `src/components/ui/alert.tsx`

用于说明、警告与错误反馈的语义提示容器。

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "grid w-full gap-1 rounded-lg border p-3 text-left text-[13px] has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2 [&>svg]:row-span-2 [&>svg]:mt-0.5 [&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        neutral: "border-line bg-card text-foreground",
        success: "border-success/20 bg-success-light text-success",
        danger: "border-danger/20 bg-danger-light text-danger",
        info: "border-info/20 bg-info-light text-info",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

function Alert({
  className,
  variant = "neutral",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      className={cn(alertVariants({ variant }), className)}
      data-slot="alert"
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("font-semibold", className)}
      data-slot="alert-title"
      {...props}
    />
  );
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("leading-5", className)}
      data-slot="alert-description"
      {...props}
    />
  );
}

export { Alert, AlertDescription, AlertTitle, alertVariants };
```

## badge

Path: `src/components/ui/badge.tsx`

紧凑状态与元数据标签。

```tsx
import { Slot } from "radix-ui";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "mono inline-flex min-h-5 w-fit shrink-0 items-center justify-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] leading-4 font-semibold whitespace-nowrap [&_svg:not([class*='size-'])]:size-3",
  {
    variants: {
      variant: {
        neutral:
          "border-line bg-card text-ink-600 [--badge-accent:var(--ink-600)]",
        success:
          "border-success/20 bg-success-light text-ink-900 [--badge-accent:var(--success)]",
        processing:
          "border-processing/20 bg-processing-light text-ink-900 [--badge-accent:var(--processing)]",
        warning:
          "border-warning/20 bg-warning-light text-ink-900 [--badge-accent:var(--warning)]",
        danger:
          "border-danger/20 bg-danger-light text-ink-900 [--badge-accent:var(--danger)]",
        info: "border-info/20 bg-info-light text-ink-900 [--badge-accent:var(--info)]",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

function Badge({
  className,
  variant = "neutral",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot.Root : "span";

  return (
    <Component
      className={cn(badgeVariants({ variant }), className)}
      data-slot="badge"
      data-variant={variant}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
```

## button

Path: `src/components/ui/button.tsx`

主按钮、次按钮、危险按钮与图标按钮。

```tsx
import { Slot } from "radix-ui";
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-lg border text-sm font-medium transition-colors disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          "border-transparent bg-primary text-primary-foreground hover:brightness-[0.94]",
        secondary:
          "border-input bg-card text-foreground hover:bg-muted hover:text-foreground",
        ghost:
          "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
        destructive:
          "border-danger bg-card text-danger hover:bg-danger-light",
        "destructive-confirm":
          "border-transparent bg-danger text-white hover:brightness-95",
      },
      size: {
        compact:
          "h-[34px] gap-1.5 px-3 has-data-[icon=inline-start]:pl-2.5 has-data-[icon=inline-end]:pr-2.5",
        default:
          "h-10 gap-2 px-4 has-data-[icon=inline-start]:pl-3.5 has-data-[icon=inline-end]:pr-3.5",
        large:
          "h-11 gap-2 px-5 has-data-[icon=inline-start]:pl-4 has-data-[icon=inline-end]:pr-4",
        icon: "size-10",
        "icon-large": "size-11",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "primary",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Component = asChild ? Slot.Root : "button";

  return (
    <Component
      className={cn(buttonVariants({ variant, size }), className)}
      data-size={size}
      data-slot="button"
      data-variant={variant}
      {...props}
    />
  );
}

export { Button, buttonVariants };
```

## dialog

Path: `src/components/ui/dialog.tsx`

居中模态对话框。

```tsx
"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  modalContentClassName,
  overlayClassName,
} from "@/components/ui/overlay-styles";
import { cn } from "@/lib/utils";

function Dialog(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger(
  props: React.ComponentProps<typeof DialogPrimitive.Trigger>,
) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogClose(
  props: React.ComponentProps<typeof DialogPrimitive.Close>,
) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogPortal(
  props: React.ComponentProps<typeof DialogPrimitive.Portal>,
) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        overlayClassName,
        className,
      )}
      data-slot="dialog-overlay"
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          modalContentClassName,
          className,
        )}
        data-slot="dialog-content"
        {...props}
      >
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close asChild>
            <Button
              aria-label="关闭"
              className="absolute top-3 right-3"
              size="icon"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-1 pr-10", className)}
      data-slot="dialog-header"
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      data-slot="dialog-footer"
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-lg font-[650] text-forest-950", className)}
      data-slot="dialog-title"
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-[13px] leading-5 text-muted-foreground", className)}
      data-slot="dialog-description"
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
```

## empty

Path: `src/components/ui/empty.tsx`

空状态的结构化标题、说明与图标容器。

```tsx
import * as React from "react";

import { cn } from "@/lib/utils";

function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex w-full min-w-0 flex-1 flex-col items-center justify-center p-8 text-center",
        className,
      )}
      data-slot="empty"
      {...props}
    />
  );
}

function EmptyMedia({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid size-12 shrink-0 place-items-center rounded-full border border-line bg-muted text-primary [&_svg:not([class*='size-'])]:size-5",
        className,
      )}
      data-slot="empty-media"
      {...props}
    />
  );
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn("mt-4 text-lg font-[650]", className)}
      data-slot="empty-title"
      {...props}
    />
  );
}

function EmptyDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "mt-1 max-w-100 text-[13px] leading-5 text-muted-foreground",
        className,
      )}
      data-slot="empty-description"
      {...props}
    />
  );
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-4 flex items-center gap-2", className)}
      data-slot="empty-content"
      {...props}
    />
  );
}

export {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyMedia,
  EmptyTitle,
};
```

## field

Path: `src/components/ui/field.tsx`

表单字段、标签、说明和错误消息组合。

```tsx
"use client";

import { Label as LabelPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

type FieldContextValue = {
  controlId: string;
  descriptionId?: string;
  disabled: boolean;
  errorId?: string;
  invalid: boolean;
};

const FieldContext = React.createContext<FieldContextValue | null>(null);

function hasFieldChild(
  children: React.ReactNode,
  component: React.ElementType,
) {
  return React.Children.toArray(children).some(
    (child) => React.isValidElement(child) && child.type === component,
  );
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex w-full flex-col gap-5", className)}
      data-slot="field-group"
      {...props}
    />
  );
}

function Field({
  className,
  children,
  controlId: controlIdProp,
  disabled,
  invalid,
  ...props
}: React.ComponentProps<"div"> & {
  controlId?: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const generatedId = React.useId();
  const controlId = controlIdProp ?? `field-${generatedId}`;
  const descriptionId = hasFieldChild(children, FieldDescription)
    ? `${controlId}-description`
    : undefined;
  const errorId = hasFieldChild(children, FieldError)
    ? `${controlId}-error`
    : undefined;
  const context = React.useMemo<FieldContextValue>(
    () => ({
      controlId,
      descriptionId,
      disabled: Boolean(disabled),
      errorId,
      invalid: Boolean(invalid),
    }),
    [controlId, descriptionId, disabled, errorId, invalid],
  );

  return (
    <FieldContext.Provider value={context}>
      <div
        aria-disabled={disabled || undefined}
        className={cn("group/field flex w-full flex-col gap-2", className)}
        data-disabled={disabled || undefined}
        data-invalid={invalid || undefined}
        data-slot="field"
        {...props}
      >
        {children}
      </div>
    </FieldContext.Provider>
  );
}

function FieldLabel({
  className,
  htmlFor,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  const field = React.useContext(FieldContext);

  return (
    <LabelPrimitive.Root
      className={cn(
        "w-fit text-[13px] leading-5 font-semibold group-data-[disabled=true]/field:opacity-55",
        className,
      )}
      data-slot="field-label"
      htmlFor={htmlFor ?? field?.controlId}
      {...props}
    />
  );
}

function FieldDescription({
  className,
  id,
  ...props
}: React.ComponentProps<"p">) {
  const field = React.useContext(FieldContext);

  return (
    <p
      className={cn(
        "text-[11px] leading-4 text-ink-600 group-data-[disabled=true]/field:opacity-55",
        className,
      )}
      data-slot="field-description"
      id={id ?? field?.descriptionId}
      {...props}
    />
  );
}

function FieldError({
  className,
  id,
  ...props
}: React.ComponentProps<"p">) {
  const field = React.useContext(FieldContext);

  return (
    <p
      className={cn("text-[12px] leading-4 text-danger", className)}
      data-slot="field-error"
      id={id ?? field?.errorId}
      role="alert"
      {...props}
    />
  );
}

type FieldControlProps = Pick<
  React.ComponentProps<"input">,
  "aria-describedby" | "aria-invalid" | "disabled" | "id"
>;

function useFieldControlProps({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  disabled,
  id,
}: FieldControlProps) {
  const field = React.useContext(FieldContext);
  const describedBy = [
    ariaDescribedBy,
    field?.descriptionId,
    field?.errorId,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    "aria-describedby": describedBy || undefined,
    "aria-invalid": (ariaInvalid ?? field?.invalid) || undefined,
    disabled: disabled || field?.disabled || undefined,
    id: id ?? field?.controlId,
  };
}

export {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  useFieldControlProps,
};
```

## input

Path: `src/components/ui/input.tsx`

单行文本输入框。

```tsx
"use client";

import * as React from "react";

import { useFieldControlProps } from "@/components/ui/field";
import { cn } from "@/lib/utils";

function Input({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  className,
  disabled,
  id,
  type,
  ...props
}: React.ComponentProps<"input">) {
  const fieldControlProps = useFieldControlProps({
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    disabled,
    id,
  });

  return (
    <input
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-input bg-muted px-3 text-sm text-foreground outline-none transition-colors placeholder:text-ink-600 focus-visible:border-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-ink-600 disabled:opacity-70 aria-invalid:border-danger aria-invalid:bg-danger-light/30",
        className,
      )}
      data-slot="input"
      type={type}
      {...fieldControlProps}
      {...props}
    />
  );
}

export { Input };
```

## separator

Path: `src/components/ui/separator.tsx`

水平或垂直分隔线。

```tsx
"use client";

import { Separator as SeparatorPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
```

## sheet

Path: `src/components/ui/sheet.tsx`

从屏幕边缘进入的抽屉面板。

```tsx
"use client";

import { X } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { overlayClassName } from "@/components/ui/overlay-styles";
import { cn } from "@/lib/utils";

function Sheet(props: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger(
  props: React.ComponentProps<typeof SheetPrimitive.Trigger>,
) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose(props: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal(
  props: React.ComponentProps<typeof SheetPrimitive.Portal>,
) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      className={cn(
        overlayClassName,
        className,
      )}
      data-slot="sheet-overlay"
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left";
  showCloseButton?: boolean;
}) {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden border-line bg-popover text-popover-foreground shadow-[0_8px_24px_rgba(16,41,30,0.08)] duration-200 ease-out outline-none data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:duration-0 motion-reduce:animate-none",
          "data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-full data-[side=right]:max-w-125 data-[side=right]:border-l data-[side=right]:data-[state=open]:slide-in-from-right data-[side=right]:data-[state=closed]:slide-out-to-right",
          "data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-[min(100%,232px)] data-[side=left]:border-r data-[side=left]:data-[state=open]:slide-in-from-left data-[side=left]:data-[state=closed]:slide-out-to-left",
          "data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:border-b data-[side=top]:data-[state=open]:slide-in-from-top data-[side=top]:data-[state=closed]:slide-out-to-top",
          "data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:border-t data-[side=bottom]:data-[state=open]:slide-in-from-bottom data-[side=bottom]:data-[state=closed]:slide-out-to-bottom",
          className,
        )}
        data-side={side}
        data-slot="sheet-content"
        {...props}
      >
        {children}
        {showCloseButton ? (
          <SheetPrimitive.Close asChild>
            <Button
              aria-label="关闭"
              className="absolute top-4 right-4"
              size="icon"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          </SheetPrimitive.Close>
        ) : null}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-1 border-b border-line p-6 pr-18",
        className,
      )}
      data-slot="sheet-header"
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mt-auto flex shrink-0 justify-end gap-3 border-t border-line bg-muted p-6",
        className,
      )}
      data-slot="sheet-footer"
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      className={cn("text-xl font-bold text-forest-950", className)}
      data-slot="sheet-title"
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      className={cn("text-[13px] leading-5 text-muted-foreground", className)}
      data-slot="sheet-description"
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
```

## spinner

Path: `src/components/ui/spinner.tsx`

加载与流式回答状态指示器。

```tsx
import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

function Spinner({
  className,
  label = "正在加载",
  ...props
}: React.ComponentProps<typeof LoaderCircle> & { label?: string }) {
  return (
    <LoaderCircle
      aria-label={props["aria-hidden"] ? undefined : label}
      className={cn(
        "size-4 animate-spin motion-reduce:animate-none",
        className,
      )}
      data-slot="spinner"
      role={props["aria-hidden"] ? undefined : "status"}
      {...props}
    />
  );
}

export { Spinner };
```

## tabs

Path: `src/components/ui/tabs.tsx`

标签页导航与内容容器。

```tsx
"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";

import { cn } from "@/lib/utils";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      className={cn("flex min-h-0 flex-1 flex-col", className)}
      data-slot="tabs"
      orientation={orientation}
      {...props}
    />
  );
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "flex h-11 shrink-0 items-stretch border-b border-line px-6",
        className,
      )}
      data-slot="tabs-list"
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative inline-flex min-w-24 items-center justify-center border-b-2 border-transparent px-4 text-sm text-ink-600 transition-colors hover:text-foreground data-[state=active]:border-primary data-[state=active]:font-semibold data-[state=active]:text-primary disabled:pointer-events-none disabled:opacity-55",
        className,
      )}
      data-slot="tabs-trigger"
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("min-h-0 flex-1 outline-none", className)}
      data-slot="tabs-content"
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
```

## textarea

Path: `src/components/ui/textarea.tsx`

多行文本输入框。

```tsx
"use client";

import * as React from "react";

import { useFieldControlProps } from "@/components/ui/field";
import { cn } from "@/lib/utils";

function Textarea({
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  className,
  disabled,
  id,
  ...props
}: React.ComponentProps<"textarea">) {
  const fieldControlProps = useFieldControlProps({
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    disabled,
    id,
  });

  return (
    <textarea
      className={cn(
        "min-h-28 w-full resize-y rounded-lg border border-input bg-muted px-3 py-2.5 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-ink-600 focus-visible:border-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-ink-600 disabled:opacity-70 aria-invalid:border-danger aria-invalid:bg-danger-light/30",
        className,
      )}
      data-slot="textarea"
      {...fieldControlProps}
      {...props}
    />
  );
}

export { Textarea };
```

## status-badge

Path: `src/components/admin/status-badge.tsx`

业务状态徽标，覆盖发布、处理、失败与解决状态。

```tsx
import { Badge, type badgeVariants } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

type Status =
  | "draft"
  | "published"
  | "offline"
  | "processing"
  | "available"
  | "failed"
  | "disabled"
  | "pending"
  | "resolved";

const statusPresentation: Record<
  Status,
  {
    label: string;
    variant: NonNullable<Parameters<typeof badgeVariants>[0]>["variant"];
    processing?: boolean;
  }
> = {
  draft: { label: "草稿", variant: "neutral" },
  published: { label: "已发布", variant: "success" },
  offline: { label: "已下线", variant: "neutral" },
  processing: { label: "处理中", variant: "processing", processing: true },
  available: { label: "可用", variant: "success" },
  failed: { label: "失败", variant: "danger" },
  disabled: { label: "已停用", variant: "neutral" },
  pending: { label: "待处理", variant: "warning" },
  resolved: { label: "已解决", variant: "success" },
};

export function StatusBadge({ status }: { status: Status }) {
  const presentation = statusPresentation[status];

  return (
    <Badge variant={presentation.variant}>
      {presentation.processing ? (
        <Spinner aria-hidden="true" className="text-(--badge-accent)" />
      ) : (
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-(--badge-accent)"
        />
      )}
      {presentation.label}
    </Badge>
  );
}

export function getStatusLabel(status: Status) {
  return statusPresentation[status].label;
}

export type { Status };
```

## citation-list

Path: `src/components/assistant/citation-list.tsx`

公开对话中最多三个可核查来源卡片。

```tsx
import { ExternalLink, FileText } from "lucide-react";

import type { GroundedCitation } from "@/lib/assistant/grounded-answer";

export function CitationList({
  citations,
}: {
  citations: GroundedCitation[];
}) {
  return (
    <div className="mt-4 border-t border-line pt-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold text-ink-600">回答依据</p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-light px-2 py-0.5 text-[10px] font-semibold text-success">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
          有依据
        </span>
      </div>
      <div className="space-y-2">
        {citations.map((citation) =>
          citation.url ? (
            <a
              className="flex min-h-12 items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-forest-800 transition-colors hover:border-line-strong hover:bg-forest-100/40"
              href={citation.url}
              key={citation.knowledgeSourceId}
              rel="noreferrer"
              target="_blank"
            >
              <FileText
                aria-hidden="true"
                className="size-3.5 shrink-0 text-ink-400"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium">
                  {citation.title}
                </span>
                <span className="mono mt-0.5 block truncate text-[10px] text-ink-600">
                  {citation.url}
                </span>
              </span>
              <ExternalLink
                aria-hidden="true"
                className="size-3.5 shrink-0 text-ink-400"
              />
            </a>
          ) : (
            <div
              className="flex min-h-10 items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-[12px] text-ink-600"
              key={citation.knowledgeSourceId}
            >
              <FileText
                aria-hidden="true"
                className="size-3.5 shrink-0 text-ink-400"
              />
              <span className="min-w-0 flex-1 truncate">{citation.title}</span>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
```

## controlled-markdown

Path: `src/components/assistant/controlled-markdown.tsx`

公开对话回答的受控 Markdown 渲染器。

```tsx
import Markdown from "react-markdown";

const allowedElements = [
  "p",
  "h1",
  "h2",
  "h3",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "blockquote",
  "code",
  "pre",
  "br",
];

export function ControlledMarkdown({ children }: { children: string }) {
  return (
    <Markdown
      allowedElements={allowedElements}
      components={{
        h1: ({ children: heading }) => (
          <h3 className="mt-4 text-base font-semibold first:mt-0">{heading}</h3>
        ),
        h2: ({ children: heading }) => (
          <h3 className="mt-4 text-base font-semibold first:mt-0">{heading}</h3>
        ),
        h3: ({ children: heading }) => (
          <h3 className="mt-4 text-sm font-semibold first:mt-0">{heading}</h3>
        ),
        p: ({ children: paragraph }) => (
          <p className="mt-2 text-sm leading-6 first:mt-0">{paragraph}</p>
        ),
        strong: ({ children: content }) => (
          <strong className="font-semibold">{content}</strong>
        ),
        em: ({ children: content }) => <em>{content}</em>,
        ul: ({ children: items }) => (
          <ul className="mt-2 list-disc space-y-1 pl-5">{items}</ul>
        ),
        ol: ({ children: items }) => (
          <ol className="mt-2 list-decimal space-y-1 pl-5">{items}</ol>
        ),
        li: ({ children: item }) => <li className="text-sm leading-6">{item}</li>,
        blockquote: ({ children: quote }) => (
          <blockquote className="mt-2 border-l-2 border-line-strong pl-3 text-ink-600">
            {quote}
          </blockquote>
        ),
        code: ({ children: code }) => (
          <code className="mono rounded bg-paper px-1 py-0.5 text-[0.9em]">
            {code}
          </code>
        ),
        pre: ({ children: code }) => (
          <pre className="mono mt-2 overflow-x-auto rounded-lg border border-line bg-paper p-3 text-xs leading-5">
            {code}
          </pre>
        ),
      }}
      skipHtml
    >
      {children}
    </Markdown>
  );
}
```

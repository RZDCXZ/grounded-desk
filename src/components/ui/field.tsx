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

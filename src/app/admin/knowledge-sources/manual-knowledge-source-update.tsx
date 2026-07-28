"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import {
  updateManualKnowledgeSource,
  type UpdateManualSourceState,
} from "./actions";

const initialState: UpdateManualSourceState = { status: "idle" };

export type ManualKnowledgeSourceRevision = {
  title: string;
  body: string;
  originalUrl: string | null;
};

export function ManualKnowledgeSourceUpdate({
  revision,
  sourceId,
}: {
  revision: ManualKnowledgeSourceRevision;
  sourceId: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (previousState: UpdateManualSourceState, formData: FormData) => {
      const nextState = await updateManualKnowledgeSource(
        previousState,
        formData,
      );

      if (nextState.status === "updated") {
        setOpen(false);
        router.refresh();
      }

      return nextState;
    },
    initialState,
  );

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost">
          更新
        </Button>
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>更新手工知识来源</SheetTitle>
          <SheetDescription>
            新知识版本完整处理成功后才会替换当前版本；处理期间当前版本继续参与回答。
          </SheetDescription>
        </SheetHeader>

        <form action={formAction} className="flex h-full min-h-0 flex-col">
          <input name="sourceId" type="hidden" value={sourceId} />
          <div className="flex-1 overflow-y-auto p-6 sm:p-8">
            <FieldGroup>
              <Field controlId={`update-source-title-${sourceId}`}>
                <FieldLabel>更新标题</FieldLabel>
                <Input
                  defaultValue={revision.title}
                  maxLength={160}
                  name="title"
                  required
                />
              </Field>

              <Field controlId={`update-source-body-${sourceId}`}>
                <FieldLabel>更新正文</FieldLabel>
                <Textarea
                  className="min-h-64"
                  defaultValue={revision.body}
                  name="body"
                  required
                />
                <FieldDescription>
                  支持 80 至 50000
                  个字符；系统按标题与段落形成新的内容单元。
                </FieldDescription>
              </Field>

              <Field controlId={`update-source-url-${sourceId}`}>
                <FieldLabel>更新原始 URL（可选）</FieldLabel>
                <Input
                  defaultValue={revision.originalUrl ?? ""}
                  maxLength={2048}
                  name="originalUrl"
                  type="url"
                />
              </Field>

              {state.status === "error" ? (
                <Alert role="alert" variant="danger">
                  <AlertDescription>{state.message}</AlertDescription>
                </Alert>
              ) : null}
            </FieldGroup>
          </div>

          <SheetFooter>
            <SheetClose asChild>
              <Button disabled={pending} type="button" variant="secondary">
                取消
              </Button>
            </SheetClose>
            <Button disabled={pending} type="submit">
              {pending ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : null}
              {pending ? "正在提交…" : "创建新知识版本"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

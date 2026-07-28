"use client";

import { Plus } from "lucide-react";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

import {
  createManualKnowledgeSource,
  type CreateManualSourceState,
} from "./actions";

const initialCreateState: CreateManualSourceState = { status: "idle" };

export function AddKnowledgeSource() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    async (previousState: CreateManualSourceState, formData: FormData) => {
      const nextState = await createManualKnowledgeSource(
        previousState,
        formData,
      );

      if (nextState.status === "created") {
        setOpen(false);
        router.refresh();
      }

      return nextState;
    },
    initialCreateState,
  );

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <Button>
          <Plus aria-hidden="true" data-icon="inline-start" />
          添加知识来源
        </Button>
      </SheetTrigger>

      <SheetContent>
        <SheetHeader>
          <SheetTitle>添加知识来源</SheetTitle>
          <SheetDescription>
            粘贴手工维护的业务知识，处理完成后即可参与回答。
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="manual">
          <TabsList aria-label="知识来源类型">
            <TabsTrigger
              disabled
              title="公开网页导入将在下一张工单开放"
              value="url"
            >
              网页 URL
            </TabsTrigger>
            <TabsTrigger value="manual">手工内容</TabsTrigger>
          </TabsList>

          <TabsContent value="manual">
            <form action={formAction} className="flex h-full min-h-0 flex-col">
              <div className="flex-1 overflow-y-auto p-6 sm:p-8">
                <FieldGroup>
                  <Field controlId="source-title">
                    <FieldLabel>标题</FieldLabel>
                    <Input
                      maxLength={160}
                      name="title"
                      placeholder="例如：售后服务说明"
                      required
                    />
                  </Field>

                  <Field controlId="source-body">
                    <FieldLabel>正文</FieldLabel>
                    <Textarea
                      className="min-h-64"
                      name="body"
                      placeholder="使用清楚的标题与段落组织业务知识。"
                      required
                    />
                    <FieldDescription>
                      支持 80 至 50000
                      个字符；系统按标题与段落形成内容单元。
                    </FieldDescription>
                  </Field>

                  <Field controlId="source-original-url">
                    <FieldLabel>原始 URL（可选）</FieldLabel>
                    <Input
                      maxLength={2048}
                      name="originalUrl"
                      placeholder="https://example.com/services"
                      type="url"
                    />
                    <FieldDescription>
                      仅用于管理员识别和后续引用，不会自动抓取该地址。
                    </FieldDescription>
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
                  <Button type="button" variant="secondary">
                    取消
                  </Button>
                </SheetClose>
                <Button disabled={pending} type="submit">
                  {pending ? (
                    <Spinner aria-hidden="true" data-icon="inline-start" />
                  ) : null}
                  {pending ? "正在添加…" : "确认添加"}
                </Button>
              </SheetFooter>
            </form>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

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
  createWebKnowledgeSource,
  type CreateManualSourceState,
  type CreateWebSourceState,
} from "./actions";

const initialCreateState: CreateManualSourceState = { status: "idle" };
const initialWebCreateState: CreateWebSourceState = { status: "idle" };

export function AddKnowledgeSource() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [manualState, manualFormAction, manualPending] = useActionState(
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
  const [webState, webFormAction, webPending] = useActionState(
    async (previousState: CreateWebSourceState, formData: FormData) => {
      const nextState = await createWebKnowledgeSource(
        previousState,
        formData,
      );

      if (nextState.status === "created") {
        setOpen(false);
        router.refresh();
      }

      return nextState;
    },
    initialWebCreateState,
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
            导入公开网页或粘贴手工内容，处理完成后即可参与回答。
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="url">
          <TabsList aria-label="知识来源类型">
            <TabsTrigger value="url">网页 URL</TabsTrigger>
            <TabsTrigger value="manual">手工内容</TabsTrigger>
          </TabsList>

          <TabsContent value="url">
            <form
              action={webFormAction}
              className="flex h-full min-h-0 flex-col"
            >
              <div className="flex-1 overflow-y-auto p-6 sm:p-8">
                <FieldGroup>
                  <Field controlId="source-web-url">
                    <FieldLabel>公开 HTTP/HTTPS 地址</FieldLabel>
                    <Input
                      maxLength={2048}
                      name="url"
                      placeholder="https://example.com/help-center"
                      required
                      type="url"
                    />
                    <FieldDescription>
                      系统只提取公开 HTML
                      中的页面标题和主要正文，不执行页面脚本，也不绕过登录、验证码、付费墙或反爬限制。
                    </FieldDescription>
                  </Field>

                  {webState.status === "error" ? (
                    <Alert role="alert" variant="danger">
                      <AlertDescription>{webState.message}</AlertDescription>
                    </Alert>
                  ) : null}
                </FieldGroup>
              </div>

              <SourceFormFooter pending={webPending} />
            </form>
          </TabsContent>

          <TabsContent value="manual">
            <form
              action={manualFormAction}
              className="flex h-full min-h-0 flex-col"
            >
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
                      正文不能为空，最多支持 50000
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

                  {manualState.status === "error" ? (
                    <Alert role="alert" variant="danger">
                      <AlertDescription>{manualState.message}</AlertDescription>
                    </Alert>
                  ) : null}
                </FieldGroup>
              </div>

              <SourceFormFooter pending={manualPending} />
            </form>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function SourceFormFooter({ pending }: { pending: boolean }) {
  return (
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
  );
}

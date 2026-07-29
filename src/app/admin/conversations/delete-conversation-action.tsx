"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { deleteConversation } from "./actions";

export function DeleteConversationAction({
  conversationId,
}: {
  conversationId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function removeConversation() {
    setPending(true);
    setError(null);
    const result = await deleteConversation(conversationId);

    if (result.status === "error") {
      setError(result.message);
      setPending(false);
      return;
    }

    setOpen(false);
    router.push("/admin/conversations");
    router.refresh();
  }

  return (
    <AlertDialog onOpenChange={setOpen} open={open}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive">
          <Trash2 aria-hidden="true" />
          删除会话
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>永久删除会话</AlertDialogTitle>
          <AlertDialogDescription>
            此会话的消息、引用、质量反馈和关联待解决问题将被永久删除，且不可恢复。其他会话、知识来源和助手配置不会受到影响。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <Alert role="alert" variant="danger">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>取消</AlertDialogCancel>
          <Button
            disabled={pending}
            onClick={removeConversation}
            type="button"
            variant="destructive-confirm"
          >
            {pending ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : null}
            {pending ? "正在删除…" : "确认永久删除"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

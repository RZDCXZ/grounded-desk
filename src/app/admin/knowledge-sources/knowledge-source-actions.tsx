"use client";

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

import {
  deleteKnowledgeSource,
  retryKnowledgeSource,
  setKnowledgeSourceEnabled,
} from "./actions";

type KnowledgeSourceActionsProps = {
  processing: boolean;
  retryable: boolean;
  sourceId: string;
  sourceTitle: string;
  status: "processing" | "available" | "failed" | "disabled";
};

export function KnowledgeSourceActions({
  processing,
  retryable,
  sourceId,
  sourceTitle,
  status,
}: KnowledgeSourceActionsProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shouldEnable = status === "disabled";
  const toggleLabel = shouldEnable ? "重新启用" : "停用";

  async function toggleEnabled() {
    setPending(true);
    setError(null);
    const result = await setKnowledgeSourceEnabled(sourceId, shouldEnable);

    if (result.status === "error") {
      setError(result.message);
      setPending(false);
      return;
    }

    setPending(false);
    router.refresh();
  }

  async function retry() {
    setPending(true);
    setError(null);
    const result = await retryKnowledgeSource(sourceId);

    if (result.status === "error") {
      setError(result.message);
      setPending(false);
      return;
    }

    setPending(false);
    router.refresh();
  }

  async function remove() {
    setPending(true);
    setError(null);
    const result = await deleteKnowledgeSource(sourceId);

    if (result.status === "error") {
      setError(result.message);
      setPending(false);
      return;
    }

    setDeleteOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-1">
        {retryable && !processing && status !== "disabled" ? (
          <Button
            disabled={pending}
            onClick={retry}
            type="button"
            variant={status === "failed" ? "destructive" : "ghost"}
          >
            {pending ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : null}
            {pending ? "正在重试…" : "重试"}
          </Button>
        ) : null}
        {!processing ? (
          <Button
            disabled={pending}
            onClick={toggleEnabled}
            type="button"
            variant="ghost"
          >
            {pending ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : null}
            {pending ? "正在更新…" : toggleLabel}
          </Button>
        ) : null}
        <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
          <AlertDialogTrigger asChild>
            <Button disabled={pending} type="button" variant="destructive">
              删除
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>永久删除知识来源</AlertDialogTitle>
              <AlertDialogDescription>
                “{sourceTitle}
                ”的正文、知识版本、内容单元和向量将被永久删除，且不可恢复。
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
                onClick={remove}
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
      </div>
      {error ? (
        <p
          className="max-w-48 text-right text-[11px] text-(--danger)"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

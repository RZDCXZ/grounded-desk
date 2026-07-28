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
  refreshWebKnowledgeSource,
  retryKnowledgeSource,
  setKnowledgeSourceEnabled,
} from "./actions";
import {
  ManualKnowledgeSourceUpdate,
  type ManualKnowledgeSourceRevision,
} from "./manual-knowledge-source-update";

type KnowledgeSourceActionsProps = {
  processing: boolean;
  retryable: boolean;
  manualRevision: ManualKnowledgeSourceRevision | null;
  sourceId: string;
  sourceTitle: string;
  sourceType: "manual" | "url";
  status: "processing" | "available" | "failed" | "disabled";
};

export function KnowledgeSourceActions({
  processing,
  retryable,
  manualRevision,
  sourceId,
  sourceTitle,
  sourceType,
  status,
}: KnowledgeSourceActionsProps) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shouldEnable = status === "disabled";
  const toggleLabel = shouldEnable ? "重新启用" : "停用";

  async function runAction(
    action: () => Promise<KnowledgeSourceActionResult>,
    onSuccess?: () => void,
  ) {
    setPending(true);
    setError(null);
    const result = await action();

    if (result.status === "error") {
      setError(result.message);
      setPending(false);
      return;
    }

    onSuccess?.();
    setPending(false);
    router.refresh();
  }

  async function toggleEnabled() {
    await runAction(() =>
      setKnowledgeSourceEnabled(sourceId, shouldEnable),
    );
  }

  async function retry() {
    await runAction(() => retryKnowledgeSource(sourceId));
  }

  async function refreshWeb() {
    await runAction(() => refreshWebKnowledgeSource(sourceId));
  }

  async function remove() {
    await runAction(
      () => deleteKnowledgeSource(sourceId),
      () => setDeleteOpen(false),
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-1">
        {!processing && status !== "disabled" && sourceType === "manual"
        && manualRevision ? (
          <ManualKnowledgeSourceUpdate
            revision={manualRevision}
            sourceId={sourceId}
          />
        ) : null}
        {!processing && status !== "disabled" && sourceType === "url"
        && !retryable ? (
          <Button
            disabled={pending}
            onClick={refreshWeb}
            type="button"
            variant="ghost"
          >
            {pending ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : null}
            {pending ? "正在提交…" : "重新处理"}
          </Button>
        ) : null}
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

type KnowledgeSourceActionResult =
  | { status: "success" }
  | { status: "error"; message: string };

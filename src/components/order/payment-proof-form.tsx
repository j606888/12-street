"use client";

import { useRef, useState, useTransition } from "react";
import { getTransferProofUploadUrl, submitPaymentProof } from "@/actions/order";
import { CheckIcon, ImageIcon } from "@/components/icons";
import { MAX_PROOF_BYTES } from "@/lib/validators/order";
import { putFile } from "./upload-utils";

type Proof =
  | { status: "idle" }
  | { status: "uploading"; progress: number; previewUrl: string }
  | { status: "done"; key: string; previewUrl: string }
  | { status: "failed"; error: string };

/**
 * 帳號末五碼 or a transfer screenshot for a placed bank-transfer order. Once
 * sent it shows what the shop received, and can be filled in again until the
 * shop confirms the payment.
 */
export function PaymentProofForm({
  orderId,
  sent,
}: {
  orderId: string;
  /** What the customer already sent, while the shop hasn't confirmed it */
  sent: { bankLast5: string | null; hasProof: boolean } | null;
}) {
  const [editing, setEditing] = useState(!sent);
  const [bankLast5, setBankLast5] = useState("");
  const [proof, setProof] = useState<Proof>({ status: "idle" });
  // Bumped on every pick/remove so a stale upload can't overwrite a newer one
  const proofAttempt = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function uploadProof(file: File) {
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setProof({ status: "failed", error: "截圖請用 JPG 或 PNG 檔" });
      return;
    }
    if (file.size > MAX_PROOF_BYTES) {
      setProof({ status: "failed", error: "截圖檔案太大（上限 15 MB）" });
      return;
    }
    const attempt = ++proofAttempt.current;
    const current = () => attempt === proofAttempt.current;
    const previewUrl = URL.createObjectURL(file);
    setProof({ status: "uploading", progress: 0, previewUrl });
    try {
      const res = await getTransferProofUploadUrl({
        orderId,
        contentType: file.type,
        size: file.size,
      });
      if (!res.ok) throw new Error(res.error);
      await putFile(res.uploadUrl, file, file.type, (progress) => {
        if (current()) setProof({ status: "uploading", progress, previewUrl });
      }).promise;
      if (current()) setProof({ status: "done", key: res.key, previewUrl });
    } catch (err) {
      if (current())
        setProof({
          status: "failed",
          error: err instanceof Error ? err.message : "上傳失敗，請再試一次",
        });
    }
  }

  function submit() {
    setError(null);
    if (proof.status === "uploading")
      return setError("轉帳截圖還在上傳中，請稍等");
    const hasLast5 = /^\d{5}$/.test(bankLast5);
    if (!hasLast5 && proof.status !== "done")
      return setError("請填寫帳號末五碼，或上傳轉帳截圖");
    startTransition(async () => {
      const res = await submitPaymentProof({
        orderId,
        bankLast5: hasLast5 ? bankLast5 : undefined,
        transferProofKey: proof.status === "done" ? proof.key : undefined,
      });
      if (!res.ok) return setError(res.error);
      setEditing(false);
      setBankLast5("");
      setProof({ status: "idle" });
    });
  }

  if (sent && !editing) {
    return (
      <div className="grid gap-2">
        <p className="text-amber-800">
          付款待確認：已收到
          {sent.bankLast5 && (
            <>
              帳號末五碼 <span className="font-mono">{sent.bankLast5}</span>
            </>
          )}
          {sent.bankLast5 && sent.hasProof && "及"}
          {sent.hasProof && "轉帳截圖"}
          ，店家確認入帳後會開始製作。
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-brand-dark min-h-11 w-fit font-bold underline underline-offset-4"
        >
          填錯了，重新填寫
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <p className="font-bold">轉帳後，下面選一種做就好</p>
      <label className="grid gap-2 text-[17px] font-bold">
        <span>填您帳號的末五碼</span>
        <input
          value={bankLast5}
          onChange={(e) => {
            setBankLast5(e.target.value.replace(/\D/g, "").slice(0, 5));
            setError(null);
          }}
          inputMode="numeric"
          placeholder="12345"
          className="border-field bg-card placeholder:text-muted/70 focus:outline-brand h-13.5 w-full rounded-[14px] border-2 px-4 text-[22px] font-bold tracking-[0.2em] focus:outline-2 focus:outline-offset-1"
        />
      </label>
      <p className="text-muted flex items-center gap-3 text-base font-bold">
        <span className="bg-line h-px flex-1" />
        或是
        <span className="bg-line h-px flex-1" />
      </p>
      <ProofPicker
        proof={proof}
        onPick={(f) => {
          setError(null);
          void uploadProof(f);
        }}
        onRemove={() => {
          proofAttempt.current++;
          setProof({ status: "idle" });
        }}
      />
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 px-3.5 py-2.5 text-base text-red-800"
        >
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="bg-brand hover:bg-brand-dark flex h-13.5 flex-1 items-center justify-center rounded-[14px] px-6 text-lg font-bold text-white disabled:opacity-50"
        >
          {pending ? "送出中…" : "送出轉帳資料"}
        </button>
        {sent && (
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setError(null);
            }}
            disabled={pending}
            className="min-h-11 text-base underline underline-offset-4"
          >
            取消
          </button>
        )}
      </div>
    </div>
  );
}

function ProofPicker({
  proof,
  onPick,
  onRemove,
}: {
  proof: Proof;
  onPick: (file: File) => void;
  onRemove: () => void;
}) {
  const hasFile = proof.status === "uploading" || proof.status === "done";
  const picker = (
    <input
      type="file"
      accept="image/jpeg,image/png"
      className="sr-only"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onPick(f);
        e.target.value = "";
      }}
    />
  );
  if (!hasFile)
    return (
      <div className="grid gap-2">
        <label className="border-brand bg-card text-brand-dark flex min-h-13.5 cursor-pointer items-center justify-center gap-2.5 rounded-[14px] border-2 text-lg font-bold">
          <ImageIcon className="size-6.5" />
          {proof.status === "failed" ? "重新選截圖" : "傳轉帳截圖"}
          {picker}
        </label>
        {proof.status === "failed" && (
          <span className="text-base text-red-700">{proof.error}</span>
        )}
      </div>
    );
  return (
    <div className="border-line bg-card flex items-center gap-3.5 rounded-[14px] border-2 p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={proof.previewUrl}
        alt="轉帳截圖預覽"
        className="border-line size-20 shrink-0 rounded-xl border object-cover"
      />
      <div className="grid min-w-0 flex-1 gap-1.5">
        {proof.status === "uploading" ? (
          <>
            <span className="text-base font-bold">
              上傳中 {Math.round(proof.progress * 100)}%
            </span>
            <span className="bg-line h-2 overflow-hidden rounded-full">
              <span
                className="bg-brand block h-full rounded-full transition-[width]"
                style={{ width: `${proof.progress * 100}%` }}
              />
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-base font-bold text-green-800">
            <CheckIcon className="size-5.5" />
            截圖傳好了
          </span>
        )}
        <span className="flex gap-5 text-base">
          <label className="flex min-h-11 cursor-pointer items-center underline underline-offset-4">
            換一張
            {picker}
          </label>
          <button
            type="button"
            onClick={onRemove}
            className="min-h-11 underline underline-offset-4"
          >
            拿掉
          </button>
        </span>
      </div>
    </div>
  );
}

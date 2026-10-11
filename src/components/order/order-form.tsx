"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { getTransferProofUploadUrl, submitOrder } from "@/actions/order";
import {
  ArrowRightIcon,
  BookIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  IdCardIcon,
  PlusIcon,
} from "@/components/icons";
import {
  PAYMENT_LABEL,
  PaymentDetails,
  type PaymentMethod,
} from "@/components/payment-details";
import type { Catalog, DraftView } from "@/lib/draft";
import { groupCharges, itemSubtotal, MIN_GROUP_CHARGE } from "@/lib/pricing";
import { MAX_PROOF_BYTES, phoneSchema } from "@/lib/validators/order";
import { PhotoBucket, Stepper } from "./photo-bucket";
import { putFile } from "./upload-utils";
import {
  CUSTOM_BUCKET,
  type Entry,
  ID_PHOTO_BUCKET,
  usePhotoUploader,
} from "./use-photo-uploader";

type Member = { name: string; phone: string | null } | null;

type Proof =
  | { status: "idle" }
  | { status: "uploading"; progress: number; previewUrl: string }
  | { status: "done"; key: string; previewUrl: string }
  | { status: "failed"; error: string };

/** Which screen of the order flow is showing; the draft itself lives on the server. */
type View =
  | { kind: "pick" }
  | { kind: "group"; key: string }
  | { kind: "id_photo" }
  | { kind: "custom" }
  | { kind: "checkout" };

/** Checkout fields that can block submitting, in on-screen order. */
type FieldKey = "content" | "name" | "phone" | "payment";
const FIELD_ORDER: FieldKey[] = ["content", "name", "phone", "payment"];
type FieldErrors = Partial<Record<FieldKey, string>>;
const fieldId = (key: FieldKey) => `checkout-${key}`;

const fmt = (n: number) => `NT$ ${n.toLocaleString("zh-TW")}`;

const SIZE_TAG: Record<string, string> = { "4x6": "最常見" };

const PAYMENT_HINT: Record<PaymentMethod, string> = {
  cash_on_pickup: "到店取件時再付",
  line_money: "加店家 LINE 好友付款",
  bank_transfer: "轉帳後填末五碼或上傳截圖",
};

// From the shop owner's 證件照 sheet (docs/owner-pricing.md)
const ID_PHOTO_SIZES = [
  ["5cm × 5cm", "美國簽證、印度簽證"],
  ["一般兩吋", "學生證、兵役體檢、履歷表、落地簽證、健保卡、國際駕照"],
  ["大頭兩吋", "身分證、護照、英／泰／馬／菲簽證、外僑居留證"],
  ["一吋", "駕照、殘障手冊"],
] as const;

export function OrderForm({
  catalog,
  draft,
  member,
}: {
  catalog: Catalog;
  draft: DraftView | null;
  member: Member;
}) {
  const uploader = usePhotoUploader(
    draft,
    catalog.sizes[0]?.id ?? 0,
    catalog.idPhotoSets[0]?.id,
  );
  const { groups, entries, notices } = uploader;

  const [view, setView] = useState<View>(() =>
    uploader.entries.length ? { kind: "checkout" } : { kind: "pick" },
  );
  const [itemQty, setItemQty] = useState<Record<number, number>>({});
  const [customNote, setCustomNote] = useState("");
  const [contactName, setContactName] = useState(member?.name ?? "");
  const [contactPhone, setContactPhone] = useState(member?.phone ?? "");
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("cash_on_pickup");
  const [bankLast5, setBankLast5] = useState("");
  const [proof, setProof] = useState<Proof>({ status: "idle" });
  // Bumped on every pick/remove so a stale upload can't overwrite a newer one
  const proofAttempt = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, startSubmit] = useTransition();
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false);

  function go(next: View) {
    setView(next);
    setConfirmDeleteGroup(false);
    window.scrollTo({ top: 0 });
  }

  const sizeById = new Map(catalog.sizes.map((s) => [s.id, s]));
  const groupLines = groups.map((g, i) => {
    const size = sizeById.get(g.printSizeId);
    const photos = entries.filter((e) => e.bucket === g.key);
    const unitPrice = size?.price ?? 0;
    const laminationUnitPrice = g.laminate
      ? (size?.laminationPrice ?? 0)
      : null;
    const charges = groupCharges({
      unitPrice,
      laminationUnitPrice,
      quantities: photos.map((e) => e.quantity),
    });
    return {
      key: g.key,
      no: i + 1,
      sizeLabel: size?.label ?? "",
      photos,
      unitPrice,
      laminationUnitPrice,
      ...charges,
    };
  });
  const idPhotoEntries = entries.filter((e) => e.bucket === ID_PHOTO_BUCKET);
  const idPhotoLines = catalog.idPhotoSets
    .map((set) => {
      const sets = idPhotoEntries
        .filter((e) => e.productId === set.id)
        .reduce((n, e) => n + e.quantity, 0);
      return {
        ...set,
        sets,
        subtotal: itemSubtotal({ unitPrice: set.price, quantity: sets }),
      };
    })
    .filter((l) => l.sets > 0);
  const itemLines = catalog.addons
    .filter((p) => (itemQty[p.id] ?? 0) > 0)
    .map((p) => ({
      ...p,
      quantity: itemQty[p.id],
      subtotal: itemSubtotal({ unitPrice: p.price, quantity: itemQty[p.id] }),
    }));
  const total =
    groupLines.reduce((s, g) => s + g.total, 0) +
    idPhotoLines.reduce((s, l) => s + l.subtotal, 0) +
    itemLines.reduce((s, i) => s + i.subtotal, 0);

  const customEntries = entries.filter((e) => e.bucket === CUSTOM_BUCKET);
  const uploaded = entries.filter((e) => e.status === "uploaded").length;
  const notReady = entries.length - uploaded;
  const busy = entries.some(
    (e) => !["uploaded", "failed", "missing"].includes(e.status),
  );
  const hasContent = entries.length > 0 || itemLines.length > 0 || !!customNote;

  function contentProblem() {
    if (!hasContent) return "還沒有加入任何照片";
    if (notReady)
      return `還有 ${notReady} 張照片沒有上傳完成，請點進去重傳失敗的照片或移除`;
  }

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    found.content = contentProblem();
    if (!contactName.trim()) found.name = "請填寫姓名";
    const phone = phoneSchema.safeParse(contactPhone);
    if (!phone.success)
      found.phone = contactPhone.trim()
        ? phone.error.issues[0].message
        : "請填寫手機號碼";
    if (paymentMethod === "bank_transfer") {
      if (proof.status === "uploading")
        found.payment = "轉帳截圖還在上傳中，請稍等";
      else if (!/^\d{5}$/.test(bankLast5) && proof.status !== "done")
        found.payment = "銀行轉帳請填寫帳號末五碼，或上傳轉帳截圖";
    }
    return found;
  }

  function clearFieldError(key: FieldKey) {
    setFieldErrors((m) => (m[key] ? { ...m, [key]: undefined } : m));
  }

  /** Bring the first field that needs fixing into view and focus it. */
  function revealFirstError(found: FieldErrors) {
    const first = FIELD_ORDER.find((k) => found[k]);
    const el = first && document.getElementById(fieldId(first));
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }

  /** Reuse an empty group for the picked size, otherwise open a new one. */
  function startGroup(printSizeId: number) {
    const empty = groups.find(
      (g) => !entries.some((e) => e.bucket === g.key),
    );
    if (empty) {
      if (empty.printSizeId !== printSizeId)
        void uploader.updateGroupOptions(empty.key, { printSizeId });
      go({ kind: "group", key: empty.key });
    } else {
      go({ kind: "group", key: uploader.addGroup(printSizeId) });
    }
  }

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
    const found = validate();
    setFieldErrors(found);
    if (FIELD_ORDER.some((k) => found[k])) return revealFirstError(found);
    startSubmit(async () => {
      const res = await submitOrder({
        contactName,
        contactPhone,
        note: note || undefined,
        customNote: customNote || undefined,
        photoOptions: entries
          .filter((e) => e.photoId && e.bucket !== CUSTOM_BUCKET)
          .map((e) => ({
            photoId: e.photoId,
            quantity: e.quantity,
            productId: e.productId,
          })),
        items: catalog.addons.map((p) => ({
          productId: p.id,
          quantity: itemQty[p.id] ?? 0,
        })),
        paymentMethod,
        bankLast5:
          paymentMethod === "bank_transfer" && bankLast5
            ? bankLast5
            : undefined,
        transferProofKey:
          paymentMethod === "bank_transfer" && proof.status === "done"
            ? proof.key
            : undefined,
      });
      // On success the action redirects to the complete page
      if (res && !res.ok) setError(res.error);
    });
  }

  const backFromItems: View = hasContent ? { kind: "checkout" } : { kind: "pick" };
  const currentGroup =
    view.kind === "group"
      ? groupLines.find((g) => g.key === view.key)
      : undefined;
  // A group that no longer exists falls back to the overview
  const screen: View["kind"] =
    view.kind === "group" && !currentGroup ? backFromItems.kind : view.kind;

  // ---- 選尺寸 ----
  if (screen === "pick") {
    return (
      <div className="grid gap-5">
        <div>
          <h1 className="text-[26px] font-extrabold tracking-tight">
            要洗什麼照片？
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            先選尺寸，再把這批照片一次丟進來。要洗不同尺寸，之後再加一組就好。
          </p>
        </div>

        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[15px] font-bold">沖印照片</h2>
            <span className="text-xs text-muted">單價／張</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {catalog.sizes.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => startGroup(s.id)}
                className="flex min-h-24 flex-col items-start gap-1 rounded-xl border border-line bg-background p-3.5 text-left transition-colors hover:border-brand hover:bg-brand-tint"
              >
                <span className="flex w-full items-center justify-between gap-1">
                  <span className="text-xl font-extrabold">{s.label}</span>
                  {SIZE_TAG[s.code] && (
                    <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-brand-dark">
                      {SIZE_TAG[s.code]}
                    </span>
                  )}
                </span>
                <span className="text-[15px] font-bold">${s.price}</span>
                <span className="text-xs text-muted">
                  護貝 +${s.laminationPrice}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            <strong className="font-semibold text-foreground">
              低消 ${MIN_GROUP_CHARGE}：
            </strong>
            同一組的沖洗費未滿 ${MIN_GROUP_CHARGE} 以 ${MIN_GROUP_CHARGE}{" "}
            計（例：${catalog.sizes[0].price} 的尺寸只洗 1 張，收 $
            {Math.max(MIN_GROUP_CHARGE, catalog.sizes[0].price)}
            ）；有護貝的話，護貝費也一樣。護貝在下一步勾選。
          </p>
        </Card>

        <section className="grid gap-2.5">
          <h2 className="text-[15px] font-bold">其他服務</h2>
          {catalog.idPhotoSets.length > 0 && (
            <ServiceLink
              icon={<IdCardIcon className="size-[22px]" />}
              title="證件照"
              desc={`身分證、護照、駕照、簽證 · $${catalog.idPhotoSets[0].price}／組`}
              onClick={() => go({ kind: "id_photo" })}
            />
          )}
          <ServiceLink
            icon={<BookIcon className="size-[22px]" />}
            title="客製化商品"
            desc="相冊、馬克杯等 · LINE 一對一報價"
            onClick={() => go({ kind: "custom" })}
          />
        </section>

        {hasContent ? (
          <button
            type="button"
            onClick={() => go({ kind: "checkout" })}
            className="text-sm font-semibold text-brand underline-offset-4 hover:underline"
          >
            回到我的訂單（{fmt(total)}）
          </button>
        ) : (
          <ul className="grid grid-cols-3 gap-2 text-center">
            <Fact title="只收 JPG" desc="手機照片直接傳" />
            <Fact title="到店取件" desc="現金或轉帳都可以" />
            <Fact title="保留 1 個月" desc="之後自動刪除" />
          </ul>
        )}
      </div>
    );
  }

  // ---- 一組照片 ----
  if (screen === "group" && currentGroup) {
    const g = groups.find((x) => x.key === currentGroup.key)!;
    return (
      <div className="grid gap-4">
        <ScreenTitle
          title={`第 ${currentGroup.no} 組照片`}
          step={1}
          onBack={() => go(backFromItems)}
        />
        <Card className="grid gap-3">
          <div className="flex items-end gap-3">
            <label className="grid flex-1 gap-1">
              <span className="text-xs text-muted">尺寸</span>
              <select
                value={g.printSizeId}
                onChange={(e) =>
                  void uploader.updateGroupOptions(g.key, {
                    printSizeId: Number(e.target.value),
                  })
                }
                className="h-11 rounded-[10px] border border-line bg-card px-3 text-base font-bold"
              >
                {catalog.sizes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}　${s.price}／張
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="h-px bg-[#eeebe6]" />
          <button
            type="button"
            role="switch"
            aria-checked={g.laminate}
            onClick={() =>
              void uploader.updateGroupOptions(g.key, { laminate: !g.laminate })
            }
            className="flex min-h-11 w-full items-center gap-3 text-left"
          >
            <span className="flex-1">
              <span className="block text-[15px] font-bold">護貝</span>
              <span className="mt-0.5 block text-xs text-muted">
                這組每張都護貝 · +$
                {sizeById.get(g.printSizeId)?.laminationPrice ?? 0}／張
              </span>
            </span>
            <span
              className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors ${
                g.laminate ? "bg-brand" : "bg-[#d6d1cb]"
              }`}
            >
              <span
                className={`absolute top-[3px] size-6 rounded-full bg-white shadow transition-[left] ${
                  g.laminate ? "left-[23px]" : "left-[3px]"
                }`}
              />
            </span>
          </button>
        </Card>

        <PhotoBucket
          bucket={g.key}
          entries={currentGroup.photos}
          notices={notices.filter((n) => n.bucket === g.key)}
          uploader={uploader}
          quantityUnit="張"
        />

        {currentGroup.total >
          (currentGroup.unitPrice + (currentGroup.laminationUnitPrice ?? 0)) *
            currentGroup.prints && (
          <p className="rounded-xl bg-brand-tint px-3.5 py-3 text-[13px] leading-relaxed text-brand-dark">
            這組還沒到低消，以 {fmt(currentGroup.total)} 計
            {freeExtraPrints(currentGroup) > 0 &&
              `，再多洗 ${freeExtraPrints(currentGroup)} 張也不用多付`}
            。
          </p>
        )}

        <div className="grid gap-2">
          <button
            type="button"
            onClick={() => go({ kind: "pick" })}
            className="flex h-13 items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-[#c9c2bb] text-[15px] font-semibold"
          >
            <PlusIcon className="size-[18px]" />
            再加一組（不同尺寸）
          </button>
          {confirmDeleteGroup ? (
            <p className="flex flex-wrap items-center justify-center gap-3 text-sm">
              確定刪除這組和裡面的照片？
              <button
                type="button"
                onClick={() => {
                  void uploader.removeGroup(g.key);
                  go(backFromItems);
                }}
                className="py-2 font-semibold text-red-700 underline"
              >
                刪除
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteGroup(false)}
                className="py-2 underline"
              >
                取消
              </button>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDeleteGroup(true)}
              className="py-2 text-sm text-muted underline"
            >
              刪除這組
            </button>
          )}
        </div>

        <BottomBar
          caption={`${currentGroup.sizeLabel} · ${currentGroup.prints} 張${
            g.laminate ? " · 含護貝" : ""
          }`}
          hint={
            currentGroup.photos.length === 0
              ? "先選照片才能下一步"
              : undefined
          }
          amount={currentGroup.total}
        >
          <PrimaryButton
            onClick={() => go({ kind: "checkout" })}
            disabled={currentGroup.photos.length === 0}
          >
            下一步
            <ArrowRightIcon className="size-[18px]" />
          </PrimaryButton>
        </BottomBar>
      </div>
    );
  }

  // ---- 證件照 ----
  if (screen === "id_photo") {
    return (
      <div className="grid gap-4">
        <ScreenTitle title="證件照" step={1} onBack={() => go(backFromItems)} />
        <Card className="grid gap-2 text-sm">
          <p className="text-muted">
            每組 {fmt(catalog.idPhotoSets[0]?.price ?? 0)}
            。每張照片選一種組合；同一張照片要多印幾組，就調整組數。
          </p>
          <details>
            <summary className="cursor-pointer py-1 font-semibold">
              證件照尺寸與常見用途
            </summary>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3">
              {ID_PHOTO_SIZES.map(([size, uses]) => (
                <div key={size} className="contents">
                  <dt className="border-t border-line py-1.5 font-medium whitespace-nowrap">
                    {size}
                  </dt>
                  <dd className="border-t border-line py-1.5 text-muted">
                    {uses}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        </Card>
        <PhotoBucket
          bucket={ID_PHOTO_BUCKET}
          entries={idPhotoEntries}
          notices={notices.filter((n) => n.bucket === ID_PHOTO_BUCKET)}
          uploader={uploader}
          quantityUnit="組"
          idPhotoSets={catalog.idPhotoSets}
        />
        <BottomBar
          caption={`證件照 · ${idPhotoLines.reduce((n, l) => n + l.sets, 0)} 組`}
          hint={idPhotoEntries.length === 0 ? "先選照片才能下一步" : undefined}
          amount={idPhotoLines.reduce((s, l) => s + l.subtotal, 0)}
        >
          <PrimaryButton
            onClick={() => go({ kind: "checkout" })}
            disabled={idPhotoEntries.length === 0}
          >
            下一步
            <ArrowRightIcon className="size-[18px]" />
          </PrimaryButton>
        </BottomBar>
      </div>
    );
  }

  // ---- 客製化 ----
  if (screen === "custom") {
    return (
      <div className="grid gap-4">
        <ScreenTitle title="客製化商品" step={1} onBack={() => go(backFromItems)} />
        <p className="text-sm leading-relaxed text-muted">
          相冊、馬克杯等客製化商品，請上傳要用的照片並說明需求，店家會再透過
          LINE 與你一對一確認張數、細節和報價（不含在訂單總金額）。
        </p>
        <PhotoBucket
          bucket={CUSTOM_BUCKET}
          entries={customEntries}
          notices={notices.filter((n) => n.bucket === CUSTOM_BUCKET)}
          uploader={uploader}
        />
        <label className="grid gap-1.5 text-[13px] font-semibold">
          需求說明
          <textarea
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="例如：想做一本 20 頁的相本，封面用第一張照片"
            className={inputClass}
          />
        </label>
        <BottomBar
          caption="客製化"
          hint={
            customEntries.length === 0 && !customNote.trim()
              ? "先選照片或填寫需求說明"
              : undefined
          }
          amountText="另行報價"
        >
          <PrimaryButton
            onClick={() => go({ kind: "checkout" })}
            disabled={customEntries.length === 0 && !customNote.trim()}
          >
            下一步
            <ArrowRightIcon className="size-[18px]" />
          </PrimaryButton>
        </BottomBar>
      </div>
    );
  }

  // ---- 確認訂單 ----
  // The content problem is re-derived so it clears itself once uploads finish
  const errors: FieldErrors = {
    ...fieldErrors,
    content: fieldErrors.content ? contentProblem() : undefined,
  };
  const errorCount = FIELD_ORDER.filter((k) => errors[k]).length;
  const firstError = FIELD_ORDER.map((k) => errors[k]).find(Boolean);
  return (
    <div className="grid gap-4">
      <ScreenTitle title="確認訂單" step={2} onBack={() => go({ kind: "pick" })} />

      <Card
        id={fieldId("content")}
        tabIndex={-1}
        invalid={!!errors.content}
        className="overflow-hidden p-0 outline-none"
      >
        <h2 className="px-4 pt-3.5 pb-1.5 text-[15px] font-bold">訂單內容</h2>
        {!hasContent && (
          <p className="px-4 py-3 text-sm text-muted">
            還沒有加入任何照片，從下面選一項開始。
          </p>
        )}
        {errors.content && hasContent && (
          <p className="mx-4 mb-1 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-800">
            {errors.content}
          </p>
        )}
        <ul className="divide-y divide-[#eeebe6] px-4">
          {groupLines
            .filter((g) => g.photos.length > 0)
            .map((g) => (
              <SummaryRow
                key={g.key}
                photos={g.photos}
                title={`${g.sizeLabel} · ${g.prints} 張`}
                desc={`${g.photos.length} 張照片${
                  g.laminationUnitPrice !== null ? " · 含護貝" : ""
                }${
                  g.total > (g.unitPrice + (g.laminationUnitPrice ?? 0)) * g.prints
                    ? ` · 未滿低消以 $${g.total} 計`
                    : ""
                }`}
                amount={`$${g.total}`}
                issue={uploadIssue(g.photos)}
                onClick={() => go({ kind: "group", key: g.key })}
              />
            ))}
          {idPhotoLines.map((l) => (
            <SummaryRow
              key={l.id}
              photos={idPhotoEntries.filter((e) => e.productId === l.id)}
              title={l.name}
              desc={`${l.sets} 組 × $${l.price}`}
              amount={`$${l.subtotal}`}
              issue={uploadIssue(
                idPhotoEntries.filter((e) => e.productId === l.id),
              )}
              onClick={() => go({ kind: "id_photo" })}
            />
          ))}
          {(customEntries.length > 0 || customNote) && (
            <SummaryRow
              photos={customEntries}
              title="客製化商品"
              desc={`${customEntries.length} 張照片`}
              amount="另行報價"
              issue={uploadIssue(customEntries)}
              onClick={() => go({ kind: "custom" })}
            />
          )}
        </ul>
        {catalog.addons.length > 0 && (
          <ul className="grid gap-2 border-t border-[#eeebe6] px-4 py-3">
            {catalog.addons.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">
                    {p.name} <span className="text-muted">${p.price}</span>
                  </p>
                  {p.description && (
                    <p className="text-xs text-muted">{p.description}</p>
                  )}
                </div>
                <div className="w-28 shrink-0">
                  <Stepper
                    value={itemQty[p.id] ?? 0}
                    min={0}
                    onChange={(q) => setItemQty((m) => ({ ...m, [p.id]: q }))}
                    label={`${p.name} 數量`}
                    unit="個"
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2 px-4 pt-3 pb-4">
          <Chip onClick={() => go({ kind: "pick" })}>＋ 沖印照片</Chip>
          {catalog.idPhotoSets.length > 0 && (
            <Chip onClick={() => go({ kind: "id_photo" })}>＋ 證件照</Chip>
          )}
          <Chip onClick={() => go({ kind: "custom" })}>＋ 客製化</Chip>
        </div>
      </Card>

      <Card className="grid gap-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold">聯絡資料</h2>
          <span className="text-xs text-muted">取件時核對用</span>
        </div>
        {!member && (
          <Link
            href="/login?next=/order"
            className="flex min-h-11 items-center gap-2.5 rounded-xl bg-[#eaf8ef] px-3 py-2.5 text-[13px] leading-snug text-[#14532d]"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#06c755] text-[10px] font-extrabold text-white">
              LINE
            </span>
            <span>
              <strong>用 LINE 登入</strong> 之後可以查歷史訂單（目前以訪客身分下單）
            </span>
          </Link>
        )}
        <Field label="姓名" error={errors.name}>
          <input
            id={fieldId("name")}
            value={contactName}
            onChange={(e) => {
              setContactName(e.target.value);
              clearFieldError("name");
            }}
            maxLength={50}
            autoComplete="name"
            aria-invalid={!!errors.name}
            className={inputClass}
          />
        </Field>
        <Field label="手機" error={errors.phone}>
          <input
            id={fieldId("phone")}
            value={contactPhone}
            onChange={(e) => {
              setContactPhone(e.target.value);
              clearFieldError("phone");
            }}
            onBlur={() => {
              const r = phoneSchema.safeParse(contactPhone);
              if (contactPhone.trim() && !r.success)
                setFieldErrors((m) => ({
                  ...m,
                  phone: r.error.issues[0].message,
                }));
            }}
            aria-invalid={!!errors.phone}
            type="tel"
            inputMode="tel"
            placeholder="0912345678"
            autoComplete="tel"
            className={inputClass}
          />
        </Field>
        <Field label="備註" optional>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="例如：希望星期五下午取件"
            className={inputClass}
          />
        </Field>
      </Card>

      <Card className="grid gap-2.5">
        <h2 className="mb-0.5 text-[15px] font-bold">付款方式</h2>
        {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
          <label
            key={m}
            className={`flex min-h-15 cursor-pointer items-center gap-3 rounded-xl border p-3.5 ${
              paymentMethod === m
                ? "border-brand bg-brand-tint ring-1 ring-brand"
                : "border-line bg-background"
            }`}
          >
            <input
              type="radio"
              name="paymentMethod"
              value={m}
              checked={paymentMethod === m}
              onChange={() => {
                setPaymentMethod(m);
                clearFieldError("payment");
              }}
              className="size-5 accent-brand"
            />
            <span>
              <span className="block text-[15px] font-bold">
                {PAYMENT_LABEL[m]}
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                {PAYMENT_HINT[m]}
              </span>
            </span>
          </label>
        ))}
        {paymentMethod !== "cash_on_pickup" && (
          <div className="grid gap-3 rounded-xl bg-subtle p-4 text-sm">
            <PaymentDetails method={paymentMethod} />
            {paymentMethod === "bank_transfer" && (
              <>
                <p className="text-muted">
                  轉帳後請填寫帳號末五碼，或上傳轉帳截圖（擇一即可）。
                </p>
                {errors.payment && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-800">
                    {errors.payment}
                  </p>
                )}
                <Field label="轉出帳號末五碼">
                  <input
                    id={fieldId("payment")}
                    value={bankLast5}
                    onChange={(e) => {
                      setBankLast5(e.target.value.replace(/\D/g, "").slice(0, 5));
                      clearFieldError("payment");
                    }}
                    aria-invalid={!!errors.payment}
                    inputMode="numeric"
                    placeholder="12345"
                    className={`${inputClass} w-36 font-mono`}
                  />
                </Field>
                <ProofPicker
                  proof={proof}
                  onPick={(f) => {
                    clearFieldError("payment");
                    void uploadProof(f);
                  }}
                  onRemove={() => {
                    proofAttempt.current++;
                    setProof({ status: "idle" });
                  }}
                />
              </>
            )}
          </div>
        )}
      </Card>

      <p className="text-center text-xs leading-relaxed text-muted">
        照片保留 1 個月後自動刪除 · 客製化商品報價另計
      </p>

      <BottomBar
        caption={`總計 · ${PAYMENT_LABEL[paymentMethod]}`}
        hint={!hasContent ? "先加入照片才能送出" : undefined}
        amount={total}
        alert={
          error ??
          (errorCount > 1
            ? `有 ${errorCount} 個地方需要修正，已用紅字標示`
            : firstError)
        }
        onAlertClick={error ? undefined : () => revealFirstError(errors)}
      >
        <PrimaryButton
          onClick={submit}
          disabled={submitting || busy || !hasContent}
        >
          {submitting
            ? "送出中…"
            : busy
              ? `照片上傳中 ${uploaded}/${entries.length}`
              : "送出訂單"}
        </PrimaryButton>
      </BottomBar>
    </div>
  );
}

const inputClass =
  "rounded-xl border border-[#d6d1cb] bg-card px-3.5 py-3 text-base focus:outline-2 focus:outline-offset-1 focus:outline-brand aria-invalid:border-red-600 aria-invalid:focus:outline-red-600";

/** How many more prints this group can add before its total goes up (低消). */
function freeExtraPrints(g: {
  unitPrice: number;
  laminationUnitPrice: number | null;
  prints: number;
  total: number;
}) {
  const totalFor = (prints: number) =>
    groupCharges({
      unitPrice: g.unitPrice,
      laminationUnitPrice: g.laminationUnitPrice,
      quantities: [prints],
    }).total;
  let extra = 0;
  while (extra < MAX_FREE_EXTRA && totalFor(g.prints + extra + 1) === g.total)
    extra++;
  return extra;
}
const MAX_FREE_EXTRA = 20;

/** Transfer screenshot: pick, upload progress, preview, replace/remove. */
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
  return (
    <div className="grid gap-2">
      <span className="text-[13px] font-semibold">轉帳截圖</span>
      {hasFile ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-card p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={proof.previewUrl}
            alt="轉帳截圖預覽"
            className="size-16 shrink-0 rounded-lg border border-line object-cover"
          />
          <div className="grid min-w-0 flex-1 gap-1.5">
            {proof.status === "uploading" ? (
              <>
                <span className="text-[13px] font-semibold">
                  上傳中 {Math.round(proof.progress * 100)}%
                </span>
                <span className="h-1.5 overflow-hidden rounded-full bg-line">
                  <span
                    className="block h-full rounded-full bg-brand transition-[width]"
                    style={{ width: `${proof.progress * 100}%` }}
                  />
                </span>
              </>
            ) : (
              <span className="text-[13px] font-semibold text-green-800">
                ✓ 截圖已上傳
              </span>
            )}
            <span className="flex gap-3 text-xs">
              <label className="cursor-pointer py-1 underline">
                換一張
                {picker}
              </label>
              <button type="button" onClick={onRemove} className="py-1 underline">
                移除
              </button>
            </span>
          </div>
        </div>
      ) : (
        <>
          <label className="flex h-11 w-fit cursor-pointer items-center gap-2 rounded-xl border border-line bg-card px-4 font-semibold hover:border-brand">
            <PlusIcon className="size-[18px]" />
            {proof.status === "failed" ? "重新選擇截圖" : "選擇截圖"}
            {picker}
          </label>
          {proof.status === "failed" && (
            <span className="text-[13px] text-red-700">{proof.error}</span>
          )}
        </>
      )}
    </div>
  );
}

/** Shown on a checkout row whose photos still need a retry or removal. */
function uploadIssue(photos: Entry[]) {
  const bad = photos.filter(
    (p) => p.status === "failed" || p.status === "missing",
  ).length;
  return bad ? `${bad} 張上傳失敗，點進去重傳或移除` : undefined;
}

function Card({
  className = "",
  invalid,
  children,
  ...rest
}: React.ComponentProps<"section"> & { invalid?: boolean }) {
  return (
    <section
      {...rest}
      className={`rounded-2xl border bg-card p-4 ${
        invalid ? "border-red-600 ring-1 ring-red-600" : "border-line"
      } ${className}`}
    >
      {children}
    </section>
  );
}

function ScreenTitle({
  title,
  step,
  onBack,
}: {
  title: string;
  step: 1 | 2;
  onBack: () => void;
}) {
  return (
    <div className="-mx-2 flex items-center gap-1">
      <button
        type="button"
        onClick={onBack}
        aria-label="返回"
        className="grid size-11 place-items-center"
      >
        <ChevronLeftIcon className="size-[22px]" />
      </button>
      <h1 className="flex-1 text-lg font-bold">{title}</h1>
      <span
        className="flex items-center gap-1 pr-2"
        aria-label={`步驟 ${step}／3`}
      >
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`h-1.5 rounded-full ${n === step ? "w-[22px]" : "w-1.5"} ${
              n <= step ? "bg-brand" : "bg-line"
            }`}
          />
        ))}
      </span>
    </div>
  );
}

function ServiceLink({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3.5 rounded-2xl border border-line bg-card p-4 text-left hover:border-brand"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-dark">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold">{title}</span>
        <span className="mt-0.5 block text-[13px] text-muted">{desc}</span>
      </span>
      <ChevronRightIcon className="size-[18px] text-muted" />
    </button>
  );
}

function Fact({ title, desc }: { title: string; desc: string }) {
  return (
    <li className="rounded-xl bg-subtle px-1.5 py-3">
      <p className="text-[13px] font-bold">{title}</p>
      <p className="mt-0.5 text-[11px] text-muted">{desc}</p>
    </li>
  );
}

function SummaryRow({
  photos,
  title,
  desc,
  amount,
  issue,
  onClick,
}: {
  photos: Entry[];
  title: string;
  desc: string;
  amount: string;
  issue?: string;
  onClick: () => void;
}) {
  const thumbs = photos.filter((p) => p.previewUrl).slice(0, 4);
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 py-3 text-left"
      >
        <span className="grid size-12 shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-lg bg-subtle">
          {thumbs.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.localId}
              src={p.previewUrl}
              alt=""
              className={`h-full w-full object-cover ${
                thumbs.length === 1 ? "col-span-2 row-span-2" : ""
              }`}
            />
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold">{title}</span>
          <span className="mt-0.5 block text-xs text-muted">{desc}</span>
          {issue && (
            <span className="mt-0.5 block text-xs font-semibold text-red-700">
              {issue}
            </span>
          )}
        </span>
        <span className="text-[15px] font-bold">{amount}</span>
        <ChevronRightIcon className="size-4 text-muted" />
      </button>
    </li>
  );
}

function Chip({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-10 rounded-full border border-line bg-background px-3.5 text-[13px] font-semibold hover:border-brand"
    >
      {children}
    </button>
  );
}

/** Sticky footer with the running amount and the step's main action. */
function BottomBar({
  caption,
  hint,
  amount,
  amountText,
  alert,
  onAlertClick,
  children,
}: {
  caption: string;
  /** Why the main action is unavailable; replaces the caption. */
  hint?: string;
  amount?: number;
  amountText?: string;
  /** Problem with the last attempt, kept in view above the bar. */
  alert?: string;
  onAlertClick?: () => void;
  children: React.ReactNode;
}) {
  const typing = useTouchTyping();
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-10 border-t border-line bg-card/95 backdrop-blur ${
        typing ? "hidden" : ""
      }`}
    >
      {alert && (
        <div role="alert" className="border-b border-red-200 bg-red-50">
          <button
            type="button"
            onClick={onAlertClick}
            disabled={!onAlertClick}
            className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-red-800"
          >
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-red-700 text-xs font-bold text-white">
              !
            </span>
            <span className="flex-1">{alert}</span>
            {onAlertClick && (
              <span className="shrink-0 text-xs underline">前往</span>
            )}
          </button>
        </div>
      )}
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="min-w-0 flex-1">
          {hint ? (
            <p className="truncate text-xs font-semibold text-brand-dark">
              {hint}
            </p>
          ) : (
            <p className="truncate text-xs text-muted">{caption}</p>
          )}
          <p className="text-[22px] font-extrabold" aria-live="polite">
            {amountText ?? fmt(amount ?? 0)}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * True while a text field is focused on a touch device. The on-screen keyboard
 * would otherwise squeeze the fixed bottom bar into the middle of the form.
 */
function useTouchTyping() {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    const isTextField = (t: EventTarget | null) =>
      t instanceof HTMLTextAreaElement ||
      (t instanceof HTMLInputElement &&
        !["radio", "checkbox", "file", "button", "submit"].includes(t.type));
    const onIn = (e: FocusEvent) => setTyping(isTextField(e.target));
    const onOut = (e: FocusEvent) => {
      if (!isTextField(e.relatedTarget)) setTyping(false);
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);
  return typing;
}

function PrimaryButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-13 items-center justify-center gap-1.5 rounded-2xl bg-brand px-5 text-base font-bold text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-[#c9c2bb] disabled:hover:bg-[#c9c2bb]"
    >
      {children}
    </button>
  );
}

function Field({
  label,
  optional,
  error,
  children,
}: {
  label: string;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-[13px] font-semibold">
      <span>
        {label}
        {optional && <span className="font-normal text-muted">（選填）</span>}
      </span>
      {children}
      {error && <span className="font-normal text-red-700">{error}</span>}
    </label>
  );
}

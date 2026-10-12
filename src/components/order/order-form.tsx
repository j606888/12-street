"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { getTransferProofUploadUrl, submitOrder } from "@/actions/order";
import {
  ArrowRightIcon,
  BookIcon,
  CheckIcon,
  ChevronLeftIcon,
  IdCardIcon,
  ImageIcon,
  PlusIcon,
} from "@/components/icons";
import {
  PAYMENT_LABEL,
  PaymentDetails,
  type PaymentMethod,
} from "@/components/payment-details";
import type { Catalog, DraftView } from "@/lib/draft";
import { groupCharges, itemSubtotal, MIN_GROUP_CHARGE } from "@/lib/pricing";
import {
  emailSchema,
  MAX_PROOF_BYTES,
  phoneSchema,
} from "@/lib/validators/order";
import { PhotoBucket, Stepper } from "./photo-bucket";
import { putFile } from "./upload-utils";
import {
  CUSTOM_BUCKET,
  type Entry,
  ID_PHOTO_BUCKET,
  usePhotoUploader,
} from "./use-photo-uploader";

type Member = {
  name: string;
  phone: string | null;
  email: string | null;
} | null;

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
type FieldKey = "content" | "name" | "phone" | "email" | "payment";
const FIELD_ORDER: FieldKey[] = [
  "content",
  "name",
  "phone",
  "email",
  "payment",
];
type FieldErrors = Partial<Record<FieldKey, string>>;
const fieldId = (key: FieldKey) => `checkout-${key}`;

const fmt = (n: number) => `$${n.toLocaleString("zh-TW")}`;

const SIZE_TAG: Record<string, string> = { "4x6": "最多人洗" };

export function OrderForm({
  catalog,
  draft,
  member,
}: {
  catalog: Catalog;
  draft: DraftView | null;
  member: Member;
}) {
  // One ID-photo set for the whole order; new uploads pick it up as their default
  const [idSetId, setIdSetId] = useState(
    () => draft?.idPhotos[0]?.productId ?? catalog.idPhotoSets[0]?.id,
  );
  const uploader = usePhotoUploader(draft, catalog.sizes[0]?.id ?? 0, idSetId);
  const { groups, entries, notices } = uploader;

  const [view, setView] = useState<View>(() =>
    uploader.entries.length ? { kind: "checkout" } : { kind: "pick" },
  );
  const [itemQty, setItemQty] = useState<Record<number, number>>({});
  const [customNote, setCustomNote] = useState("");
  const [contactName, setContactName] = useState(member?.name ?? "");
  const [contactPhone, setContactPhone] = useState(member?.phone ?? "");
  const [contactEmail, setContactEmail] = useState(member?.email ?? "");
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
    // Guests must leave an email; members may skip it
    const email = emailSchema.safeParse(contactEmail);
    if (contactEmail.trim()) {
      if (!email.success) found.email = email.error.issues[0].message;
    } else if (!member) found.email = "請填寫 Email";
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

  function pickIdSet(productId: number) {
    setIdSetId(productId);
    uploader.setIdPhotoSet(
      idPhotoEntries.map((e) => e.localId),
      productId,
    );
  }

  /** Reuse an empty group for the picked size, otherwise open a new one. */
  function startGroup(printSizeId: number) {
    const empty = groups.find((g) => !entries.some((e) => e.bucket === g.key));
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
        contactEmail: contactEmail.trim() || undefined,
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

  const backFromItems: View = hasContent
    ? { kind: "checkout" }
    : { kind: "pick" };
  const currentGroup =
    view.kind === "group"
      ? groupLines.find((g) => g.key === view.key)
      : undefined;
  // A group that no longer exists falls back to the overview
  const screen: View["kind"] =
    view.kind === "group" && !currentGroup ? backFromItems.kind : view.kind;

  // ---- 選尺寸 ----
  if (screen === "pick") {
    const minimumSizes = catalog.sizes
      .filter((s) => s.price < MIN_GROUP_CHARGE)
      .map((s) => s.label);
    return (
      <div className="grid gap-4">
        <StepHeader
          step={1}
          onBack={hasContent ? () => go({ kind: "checkout" }) : undefined}
        />
        <h1 className={h1Class}>要洗哪個尺寸？</h1>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {catalog.sizes.map((s) => {
            const tag = SIZE_TAG[s.code];
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => startGroup(s.id)}
                className={`hover:border-brand hover:bg-brand-tint relative flex min-h-27 flex-col justify-center gap-1 rounded-[18px] border-2 px-4 py-3.5 text-left transition-colors ${
                  tag ? "border-brand bg-brand-tint" : "border-line bg-card"
                }`}
              >
                {tag && (
                  <span className="bg-brand absolute -top-3 right-3 rounded-full px-3 py-0.5 text-[15px] font-bold text-white">
                    {tag}
                  </span>
                )}
                <span className="text-3xl leading-tight font-extrabold">
                  {s.label}
                </span>
                <span className="text-brand-dark text-xl font-bold">
                  一張 ${s.price}
                </span>
              </button>
            );
          })}
        </div>
        {minimumSizes.length > 0 && (
          <p className="text-muted text-[17px]">
            {minimumSizes.join("、")} 只洗一張時收 ${MIN_GROUP_CHARGE}。
          </p>
        )}

        <h2 className="mt-3 text-2xl font-black">其他</h2>
        {catalog.idPhotoSets.length > 0 && (
          <ServiceLink
            icon={<IdCardIcon className="size-7" />}
            title="證件照"
            price={`一組 $${catalog.idPhotoSets[0].price}`}
            onClick={() => go({ kind: "id_photo" })}
          />
        )}
        <ServiceLink
          icon={<BookIcon className="size-7" />}
          title="相冊、馬克杯"
          price="專人報價"
          onClick={() => go({ kind: "custom" })}
        />

        {hasContent && (
          <button
            type="button"
            onClick={() => go({ kind: "checkout" })}
            className="text-brand-dark min-h-12 text-xl font-bold underline underline-offset-4"
          >
            回到我的訂單（{fmt(total)}）
          </button>
        )}
      </div>
    );
  }

  // ---- 一組照片 ----
  if (screen === "group" && currentGroup) {
    const g = groups.find((x) => x.key === currentGroup.key)!;
    const extra = freeExtraPrints(currentGroup);
    return (
      <div className="grid gap-4">
        <StepHeader step={2} onBack={() => go(backFromItems)} />
        <div className="flex items-center justify-between gap-3">
          <h1 className={h1Class}>{currentGroup.sizeLabel} 照片</h1>
          {/* The native picker sits invisibly on top of the text link */}
          <label className="text-brand-dark relative flex min-h-12 items-center px-1 text-lg font-bold underline underline-offset-4">
            換尺寸
            <select
              value={g.printSizeId}
              onChange={(e) =>
                void uploader.updateGroupOptions(g.key, {
                  printSizeId: Number(e.target.value),
                })
              }
              className="absolute inset-0 cursor-pointer text-base opacity-0"
            >
              {catalog.sizes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}　${s.price}／張
                </option>
              ))}
            </select>
          </label>
        </div>

        <PhotoBucket
          bucket={g.key}
          entries={currentGroup.photos}
          notices={notices.filter((n) => n.bucket === g.key)}
          uploader={uploader}
          quantityUnit="張"
        />

        <button
          type="button"
          role="switch"
          aria-checked={g.laminate}
          onClick={() =>
            void uploader.updateGroupOptions(g.key, { laminate: !g.laminate })
          }
          className={`bg-card flex min-h-19 w-full items-center gap-3.5 rounded-[18px] border-2 px-4 text-left ${
            g.laminate ? "border-brand" : "border-[#c9c2bb]"
          }`}
        >
          <span
            className={`grid size-9 shrink-0 place-items-center rounded-[10px] border-2 text-white ${
              g.laminate ? "border-brand bg-brand" : "bg-card border-[#c9c2bb]"
            }`}
          >
            {g.laminate && <CheckIcon className="size-6" />}
          </span>
          <span className="flex-1 text-2xl font-bold">要護貝</span>
          <span className="text-brand-dark text-xl font-bold">
            每張 +${sizeById.get(g.printSizeId)?.laminationPrice ?? 0}
          </span>
        </button>

        {currentGroup.total >
          (currentGroup.unitPrice + (currentGroup.laminationUnitPrice ?? 0)) *
            currentGroup.prints && (
          <p className="bg-brand-tint text-brand-dark rounded-[14px] px-4 py-3 text-[17px] font-bold">
            最少收 {fmt(currentGroup.total)}
            {extra > 0 && `，再多洗 ${extra} 張不加錢`}。
          </p>
        )}

        <div className="grid gap-1">
          <button
            type="button"
            onClick={() => go({ kind: "pick" })}
            className="bg-card flex min-h-15 items-center justify-center gap-2 rounded-[18px] border-2 border-[#c9c2bb] text-xl font-bold"
          >
            <PlusIcon className="size-6" />
            再洗別的尺寸
          </button>
          {confirmDeleteGroup ? (
            <p className="flex flex-wrap items-center justify-center gap-x-4 text-lg">
              確定不洗這個尺寸？
              <button
                type="button"
                onClick={() => {
                  void uploader.removeGroup(g.key);
                  go(backFromItems);
                }}
                className="min-h-12 font-bold text-red-700 underline underline-offset-4"
              >
                確定
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteGroup(false)}
                className="min-h-12 underline underline-offset-4"
              >
                取消
              </button>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDeleteGroup(true)}
              className="text-muted min-h-12 text-lg underline underline-offset-4"
            >
              不洗這個尺寸了
            </button>
          )}
        </div>

        <BottomBar
          caption={`共 ${currentGroup.prints} 張${g.laminate ? "，含護貝" : ""}`}
          hint={currentGroup.photos.length === 0 ? "先加照片" : undefined}
          amount={currentGroup.total}
        >
          <PrimaryButton
            onClick={() => go({ kind: "checkout" })}
            disabled={currentGroup.photos.length === 0}
          >
            下一步
            <ArrowRightIcon className="size-6.5" />
          </PrimaryButton>
        </BottomBar>
      </div>
    );
  }

  // ---- 證件照 ----
  if (screen === "id_photo") {
    const sets = idPhotoLines.reduce((n, l) => n + l.sets, 0);
    return (
      <div className="grid gap-4">
        <StepHeader step={2} onBack={() => go(backFromItems)} />
        <div className="flex items-baseline justify-between gap-3">
          <h1 className={h1Class}>證件照</h1>
          <p className="text-brand-dark text-xl font-bold">
            一組 ${catalog.idPhotoSets[0]?.price ?? 0}
          </p>
        </div>

        <h2 className={h2Class}>要哪一種？</h2>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {catalog.idPhotoSets.map((set) => (
            <ChoiceCard
              key={set.id}
              name="idPhotoSet"
              checked={set.id === idSetId}
              onSelect={() => pickIdSet(set.id)}
              title={set.name.replace(/^證件照：/, "")}
              desc={set.description?.split("、").slice(0, 2).join("、")}
            />
          ))}
        </div>

        <h2 className={`${h2Class} mt-2`}>照片和組數</h2>
        <PhotoBucket
          bucket={ID_PHOTO_BUCKET}
          entries={idPhotoEntries}
          notices={notices.filter((n) => n.bucket === ID_PHOTO_BUCKET)}
          uploader={uploader}
          quantityUnit="組"
        />
        <BottomBar
          caption={`共 ${sets} 組`}
          hint={idPhotoEntries.length === 0 ? "先加照片" : undefined}
          amount={idPhotoLines.reduce((s, l) => s + l.subtotal, 0)}
        >
          <PrimaryButton
            onClick={() => go({ kind: "checkout" })}
            disabled={idPhotoEntries.length === 0}
          >
            下一步
            <ArrowRightIcon className="size-6.5" />
          </PrimaryButton>
        </BottomBar>
      </div>
    );
  }

  // ---- 客製化 ----
  if (screen === "custom") {
    const empty = customEntries.length === 0 && !customNote.trim();
    return (
      <div className="grid gap-4">
        <StepHeader step={2} onBack={() => go(backFromItems)} />
        <h1 className={h1Class}>相冊、馬克杯</h1>
        <p className="text-xl text-[#4a423c]">送出後，店家會跟您聯絡報價。</p>
        <PhotoBucket
          bucket={CUSTOM_BUCKET}
          entries={customEntries}
          notices={notices.filter((n) => n.bucket === CUSTOM_BUCKET)}
          uploader={uploader}
        />
        <label className="mt-1 grid gap-2 text-[22px] font-bold">
          想做什麼？
          <textarea
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="例如：想做一本 20 頁的相本"
            className={textareaClass}
          />
        </label>
        <BottomBar
          caption="價錢"
          hint={empty ? "先加照片或寫想做什麼" : undefined}
          amountText="另外報價"
        >
          <PrimaryButton
            onClick={() => go({ kind: "checkout" })}
            disabled={empty}
          >
            下一步
            <ArrowRightIcon className="size-6.5" />
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
    <div className="grid gap-5">
      <StepHeader step={3} onBack={() => go({ kind: "pick" })} />
      <h1 className={h1Class}>填資料，送出</h1>

      <section
        id={fieldId("content")}
        tabIndex={-1}
        className={`bg-card overflow-hidden rounded-[18px] border-2 outline-none ${
          errors.content ? "border-red-600" : "border-line"
        }`}
      >
        {!hasContent && (
          <p className="text-muted px-4 pt-4 text-lg">還沒有加照片。</p>
        )}
        {errors.content && hasContent && (
          <p className="mx-4 mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-lg text-red-800">
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
                title={`${g.sizeLabel} 照片 ${g.prints} 張`}
                desc={[
                  g.laminationUnitPrice !== null && "含護貝",
                  g.total >
                    (g.unitPrice + (g.laminationUnitPrice ?? 0)) * g.prints &&
                    `最少收 $${g.total}`,
                ]
                  .filter(Boolean)
                  .join("，")}
                amount={`$${g.total}`}
                issue={uploadIssue(g.photos)}
                onClick={() => go({ kind: "group", key: g.key })}
              />
            ))}
          {idPhotoLines.map((l) => (
            <SummaryRow
              key={l.id}
              photos={idPhotoEntries.filter((e) => e.productId === l.id)}
              title={`證件照 ${l.sets} 組`}
              desc={l.name.replace(/^證件照：/, "")}
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
              title="相冊、馬克杯"
              desc={
                customEntries.length
                  ? `${customEntries.length} 張照片`
                  : undefined
              }
              amount="另外報價"
              issue={uploadIssue(customEntries)}
              onClick={() => go({ kind: "custom" })}
            />
          )}
        </ul>
        {catalog.addons.length > 0 && (
          <ul className="grid gap-3 border-t border-[#eeebe6] px-4 py-4">
            {catalog.addons.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-xl font-bold">
                    {p.name} <span className="text-brand-dark">${p.price}</span>
                  </p>
                  {p.description && (
                    <p className="text-muted text-base">{p.description}</p>
                  )}
                </div>
                <Stepper
                  value={itemQty[p.id] ?? 0}
                  min={0}
                  onChange={(q) => setItemQty((m) => ({ ...m, [p.id]: q }))}
                  label={`${p.name} 數量`}
                  unit="個"
                />
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2 px-4 pt-3 pb-4">
          <Chip onClick={() => go({ kind: "pick" })}>＋ 再洗別的尺寸</Chip>
          {catalog.idPhotoSets.length > 0 && (
            <Chip onClick={() => go({ kind: "id_photo" })}>＋ 證件照</Chip>
          )}
          <Chip onClick={() => go({ kind: "custom" })}>＋ 相冊、馬克杯</Chip>
        </div>
      </section>

      <section className="grid gap-4">
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
            placeholder="例如：王小明"
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
        <Field
          label="Email"
          optional={!!member}
          error={errors.email}
          help="訂單通知會寄到這裡"
        >
          <input
            id={fieldId("email")}
            value={contactEmail}
            onChange={(e) => {
              setContactEmail(e.target.value);
              clearFieldError("email");
            }}
            onBlur={() => {
              const r = emailSchema.safeParse(contactEmail);
              if (contactEmail.trim() && !r.success)
                setFieldErrors((m) => ({
                  ...m,
                  email: r.error.issues[0].message,
                }));
            }}
            aria-invalid={!!errors.email}
            type="email"
            inputMode="email"
            maxLength={254}
            placeholder="name@example.com"
            autoComplete="email"
            className={inputClass}
          />
        </Field>
        <Field label="備註" optional>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="例如：星期五下午來拿"
            className={textareaClass}
          />
        </Field>
        {!member && (
          <Link
            href="/login?next=/order"
            className="flex min-h-14 items-center gap-3 rounded-[14px] bg-[#eaf8ef] px-4 py-2.5 text-[17px] leading-snug text-[#14532d]"
          >
            <span className="bg-line-green grid size-9 shrink-0 place-items-center rounded-lg text-[11px] font-extrabold text-white">
              LINE
            </span>
            <span>
              <strong>用 LINE 登入</strong>，以後可以查以前的訂單
            </span>
          </Link>
        )}
      </section>

      <section className="grid gap-2.5">
        <h2 className={h2Class}>怎麼付錢？</h2>
        {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
          <ChoiceCard
            key={m}
            name="paymentMethod"
            checked={paymentMethod === m}
            onSelect={() => {
              setPaymentMethod(m);
              clearFieldError("payment");
            }}
            title={PAYMENT_LABEL[m]}
          />
        ))}
        {paymentMethod !== "cash_on_pickup" && (
          <div className="bg-subtle grid gap-4 rounded-[14px] p-4 text-xl">
            <PaymentDetails method={paymentMethod} />
            {paymentMethod === "bank_transfer" && (
              <>
                <div className="h-px bg-[#d9d4cd]" />
                <p className="font-bold">轉帳後，下面選一種做就好</p>
                {errors.payment && (
                  <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-lg text-red-800">
                    {errors.payment}
                  </p>
                )}
                <Field label="填您帳號的末五碼" small>
                  <input
                    id={fieldId("payment")}
                    value={bankLast5}
                    onChange={(e) => {
                      setBankLast5(
                        e.target.value.replace(/\D/g, "").slice(0, 5),
                      );
                      clearFieldError("payment");
                    }}
                    aria-invalid={!!errors.payment}
                    inputMode="numeric"
                    placeholder="12345"
                    className={`${inputClass} text-[26px] font-bold tracking-[0.2em]`}
                  />
                </Field>
                <p className="text-muted flex items-center gap-3 text-lg font-bold">
                  <span className="h-px flex-1 bg-[#d9d4cd]" />
                  或是
                  <span className="h-px flex-1 bg-[#d9d4cd]" />
                </p>
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
      </section>

      <p className="text-muted text-center text-base">
        照片保留 1 個月後自動刪除
      </p>

      <BottomBar
        caption="總計"
        hint={!hasContent ? "先加照片" : undefined}
        amount={total}
        alert={
          error ??
          (errorCount > 1
            ? `有 ${errorCount} 個地方要修改，已用紅字標出`
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
              ? `上傳中 ${uploaded}/${entries.length}`
              : "送出訂單"}
        </PrimaryButton>
      </BottomBar>
    </div>
  );
}

const h1Class = "text-[32px] leading-tight font-black";
const h2Class = "text-[22px] font-bold";
const inputBase =
  "w-full rounded-[14px] border-2 border-[#a59c94] bg-card px-4 font-medium placeholder:text-[#8a827c] focus:outline-2 focus:outline-offset-1 focus:outline-brand aria-invalid:border-red-600 aria-invalid:focus:outline-red-600";
const inputClass = `${inputBase} h-16 text-2xl`;
const textareaClass = `${inputBase} py-3.5 text-[22px] leading-normal`;

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
  if (!hasFile)
    return (
      <div className="grid gap-2">
        <label className="border-brand bg-card text-brand-dark flex min-h-17 cursor-pointer items-center justify-center gap-2.5 rounded-[14px] border-2 text-[22px] font-bold">
          <ImageIcon className="size-6.5" />
          {proof.status === "failed" ? "重新選截圖" : "傳轉帳截圖"}
          {picker}
        </label>
        {proof.status === "failed" && (
          <span className="text-lg text-red-700">{proof.error}</span>
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
            <span className="text-lg font-bold">
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
          <span className="flex items-center gap-1.5 text-lg font-bold text-green-800">
            <CheckIcon className="size-5.5" />
            截圖傳好了
          </span>
        )}
        <span className="flex gap-5 text-lg">
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

/** Shown on a checkout row whose photos still need a retry or removal. */
function uploadIssue(photos: Entry[]) {
  const bad = photos.filter(
    (p) => p.status === "failed" || p.status === "missing",
  ).length;
  return bad ? `${bad} 張沒傳成功，點這裡處理` : undefined;
}

/** Back button, "step N of 3" and a progress bar on top of each order screen. */
function StepHeader({
  step,
  onBack,
}: {
  step: 1 | 2 | 3;
  /** Omit to link back to the home page. */
  onBack?: () => void;
}) {
  const backClass = "-ml-3 grid size-12 place-items-center";
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label="返回"
            className={backClass}
          >
            <ChevronLeftIcon className="size-7" />
          </button>
        ) : (
          <Link href="/" aria-label="回首頁" className={backClass}>
            <ChevronLeftIcon className="size-7" />
          </Link>
        )}
        <p className="text-brand-dark text-lg font-bold">
          第 {step} 步／共 3 步
        </p>
      </div>
      <div aria-hidden="true" className="flex gap-1.5">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`h-2 flex-1 rounded-full ${n <= step ? "bg-brand" : "bg-line"}`}
          />
        ))}
      </div>
    </div>
  );
}

function ServiceLink({
  icon,
  title,
  price,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  price: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-line bg-card hover:border-brand flex min-h-21 items-center gap-3.5 rounded-[18px] border-2 px-4 text-left"
    >
      <span className="bg-brand-soft text-brand-dark grid size-13 shrink-0 place-items-center rounded-[14px]">
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-2xl font-bold">{title}</span>
      <span className="text-brand-dark text-xl font-bold whitespace-nowrap">
        {price}
      </span>
    </button>
  );
}

/** One big option of a single-choice list (payment method, ID-photo set). */
function ChoiceCard({
  name,
  checked,
  onSelect,
  title,
  desc,
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  desc?: string;
}) {
  return (
    <label
      className={`flex min-h-19 cursor-pointer items-center gap-3.5 rounded-[18px] border-2 px-4 py-2 ${
        checked ? "border-brand bg-brand-tint" : "border-line bg-card"
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="accent-brand size-7 shrink-0"
      />
      <span className="min-w-0">
        <span className="block text-2xl leading-snug font-bold">{title}</span>
        {desc && <span className="text-muted block text-lg">{desc}</span>}
      </span>
    </label>
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
  desc?: string;
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
        className="flex w-full items-center gap-3 py-3.5 text-left"
      >
        <span className="bg-subtle grid size-14 shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-xl">
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
          <span className="block text-xl leading-snug font-bold">{title}</span>
          {desc && <span className="text-muted block text-base">{desc}</span>}
          {issue && (
            <span className="block text-base font-bold text-red-700">
              {issue}
            </span>
          )}
          <span className="text-brand-dark text-lg font-bold underline underline-offset-4">
            修改
          </span>
        </span>
        <span className="text-[26px] font-extrabold whitespace-nowrap">
          {amount}
        </span>
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
      className="border-line bg-background hover:border-brand min-h-12 rounded-full border-2 px-4 text-lg font-bold"
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
      className={`border-line bg-card fixed inset-x-0 bottom-0 z-10 border-t ${
        typing ? "hidden" : ""
      }`}
    >
      {alert && (
        <div role="alert" className="border-b border-red-200 bg-red-50">
          <button
            type="button"
            onClick={onAlertClick}
            disabled={!onAlertClick}
            className="mx-auto flex min-h-12 w-full max-w-3xl items-center gap-2.5 px-4 py-2 text-left text-lg font-bold text-red-800"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-red-700 text-sm font-bold text-white">
              !
            </span>
            <span className="flex-1">{alert}</span>
            {onAlertClick && (
              <span className="shrink-0 text-base underline">去修改</span>
            )}
          </button>
        </div>
      )}
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="min-w-0 flex-1">
          {hint ? (
            <p className="text-brand-dark truncate text-lg font-bold">{hint}</p>
          ) : (
            <p className="text-muted truncate text-lg font-bold">{caption}</p>
          )}
          <p
            className="text-[32px] leading-tight font-extrabold whitespace-nowrap"
            aria-live="polite"
          >
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
      className="bg-brand hover:bg-brand-dark flex min-h-17 min-w-40 shrink-0 items-center justify-center gap-2 rounded-[18px] px-5 text-2xl font-bold whitespace-nowrap text-white disabled:cursor-not-allowed disabled:bg-[#8a827c] disabled:hover:bg-[#8a827c]"
    >
      {children}
    </button>
  );
}

function Field({
  label,
  optional,
  small,
  help,
  error,
  children,
}: {
  label: string;
  optional?: boolean;
  /** Slightly smaller label, for a field nested inside another block. */
  small?: boolean;
  help?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`grid gap-2 font-bold ${small ? "text-xl" : "text-[22px]"}`}
    >
      <span>
        {label}
        {optional && (
          <span className="text-muted text-lg font-medium">（可以不填）</span>
        )}
      </span>
      {children}
      {help && !error && (
        <span className="text-muted text-base font-normal">{help}</span>
      )}
      {error && (
        <span className="text-lg font-normal text-red-700">{error}</span>
      )}
    </label>
  );
}

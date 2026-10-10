"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { getTransferProofUploadUrl, submitOrder } from "@/actions/order";
import {
  PAYMENT_LABEL,
  PaymentDetails,
  type PaymentMethod,
} from "@/components/payment-details";
import type { Catalog, DraftView } from "@/lib/draft";
import { groupCharges, itemSubtotal, MIN_GROUP_CHARGE } from "@/lib/pricing";
import { MAX_PROOF_BYTES, phoneSchema } from "@/lib/validators/order";
import { PhotoBucket, QuantityInput } from "./photo-bucket";
import { putFile } from "./upload-utils";
import {
  CUSTOM_BUCKET,
  ID_PHOTO_BUCKET,
  usePhotoUploader,
} from "./use-photo-uploader";

type Member = { name: string; phone: string | null } | null;

type Proof =
  | { status: "idle" }
  | { status: "uploading"; progress: number; previewUrl: string }
  | { status: "done"; key: string; previewUrl: string }
  | { status: "failed"; error: string };

const fmt = (n: number) => `NT$ ${n.toLocaleString("zh-TW")}`;

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

  const [itemQty, setItemQty] = useState<Record<number, number>>({});
  const [customNote, setCustomNote] = useState("");
  const [contactName, setContactName] = useState(member?.name ?? "");
  const [contactPhone, setContactPhone] = useState(member?.phone ?? "");
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("cash_on_pickup");
  const [bankLast5, setBankLast5] = useState("");
  const [proof, setProof] = useState<Proof>({ status: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<string | null>(
    null,
  );

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
      title: `第 ${i + 1} 組 ${size?.label ?? ""}`,
      photos: photos.length,
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
  let sectionNo = 0;
  const nextSection = () => ++sectionNo;

  const customEntries = entries.filter((e) => e.bucket === CUSTOM_BUCKET);
  const notReady = entries.filter((e) => e.status !== "uploaded").length;
  const busy = entries.some(
    (e) => !["uploaded", "failed", "missing"].includes(e.status),
  );

  async function uploadProof(file: File) {
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      setProof({ status: "failed", error: "截圖請用 JPG 或 PNG 檔" });
      return;
    }
    if (file.size > MAX_PROOF_BYTES) {
      setProof({ status: "failed", error: "截圖檔案太大（上限 15 MB）" });
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    setProof({ status: "uploading", progress: 0, previewUrl });
    try {
      const res = await getTransferProofUploadUrl({
        contentType: file.type,
        size: file.size,
      });
      if (!res.ok) throw new Error(res.error);
      await putFile(res.uploadUrl, file, file.type, (progress) =>
        setProof({ status: "uploading", progress, previewUrl }),
      ).promise;
      setProof({ status: "done", key: res.key, previewUrl });
    } catch (err) {
      setProof({
        status: "failed",
        error: err instanceof Error ? err.message : "上傳失敗",
      });
    }
  }

  function submit() {
    setError(null);
    if (notReady) {
      setError(
        `還有 ${notReady} 張照片沒有上傳完成，請等上傳結束、重傳失敗的照片或移除。`,
      );
      return;
    }
    if (!contactName.trim()) return setError("請填寫姓名");
    const phone = phoneSchema.safeParse(contactPhone);
    if (!phone.success) return setError(phone.error.issues[0].message);
    if (paymentMethod === "bank_transfer") {
      if (proof.status === "uploading") return setError("轉帳截圖還在上傳中");
      if (!/^\d{5}$/.test(bankLast5) && proof.status !== "done") {
        return setError("銀行轉帳請填寫帳號末五碼，或上傳轉帳截圖");
      }
    }
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

  return (
    <div className="grid gap-8">
      <p className="text-sm text-neutral-600">
        {member ? (
          <>以 LINE 會員「{member.name}」下單</>
        ) : (
          <>
            目前以訪客身分下單。
            <Link href="/login?next=/order" className="text-sky-700 underline">
              LINE 登入
            </Link>
            後可以查看歷史訂單。
          </>
        )}
      </p>

      <Section n={nextSection()} title="上傳沖印照片">
        <p className="text-sm text-neutral-600">
          同一組照片印同一種尺寸、同樣是否護貝；要印不同尺寸請再新增一組。每組沖洗（及護貝）費用未滿{" "}
          {fmt(MIN_GROUP_CHARGE)} 以 {fmt(MIN_GROUP_CHARGE)} 計。
        </p>
        {groups.map((g, i) => (
          <div
            key={g.key}
            className="grid gap-3 rounded-xl border bg-neutral-50 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 font-medium">
                第 {i + 1} 組 尺寸
                <select
                  value={g.printSizeId}
                  onChange={(e) =>
                    void uploader.updateGroupOptions(g.key, {
                      printSizeId: Number(e.target.value),
                    })
                  }
                  className="rounded border bg-white px-2 py-1"
                >
                  {catalog.sizes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label} 每張 {fmt(s.price)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={g.laminate}
                  onChange={(e) =>
                    void uploader.updateGroupOptions(g.key, {
                      laminate: e.target.checked,
                    })
                  }
                />
                護貝（每張 +
                {fmt(sizeById.get(g.printSizeId)?.laminationPrice ?? 0)}）
              </label>
              {confirmDeleteGroup === g.key ? (
                <span className="flex gap-2 text-sm">
                  確定刪除這組和裡面的照片？
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmDeleteGroup(null);
                      void uploader.removeGroup(g.key);
                    }}
                    className="text-red-600 underline"
                  >
                    刪除
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteGroup(null)}
                    className="underline"
                  >
                    取消
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteGroup(g.key)}
                  className="text-sm text-neutral-500 underline"
                >
                  刪除這組
                </button>
              )}
            </div>
            <PhotoBucket
              bucket={g.key}
              entries={entries.filter((e) => e.bucket === g.key)}
              notices={notices.filter((n) => n.bucket === g.key)}
              uploader={uploader}
              quantityUnit="張"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => uploader.addGroup(catalog.sizes[0].id)}
          className="w-fit rounded-md border border-neutral-900 px-4 py-2 text-sm font-medium"
        >
          ＋ 新增一組（不同尺寸）
        </button>
      </Section>

      {catalog.idPhotoSets.length > 0 && (
        <Section n={nextSection()} title="證件照（選填）">
          <p className="text-sm text-neutral-600">
            每組 {fmt(catalog.idPhotoSets[0].price)}
            。每張照片選一種組合；同一張照片要多印幾組，就調整組數。
          </p>
          <details className="rounded-lg border p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              證件照尺寸與常見用途
            </summary>
            <table className="mt-2 w-full">
              <tbody>
                {ID_PHOTO_SIZES.map(([size, uses]) => (
                  <tr key={size} className="border-t">
                    <td className="py-1.5 pr-3 whitespace-nowrap">{size}</td>
                    <td className="py-1.5 text-neutral-600">{uses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <PhotoBucket
            bucket={ID_PHOTO_BUCKET}
            entries={idPhotoEntries}
            notices={notices.filter((n) => n.bucket === ID_PHOTO_BUCKET)}
            uploader={uploader}
            quantityUnit="組"
            idPhotoSets={catalog.idPhotoSets}
          />
        </Section>
      )}

      {catalog.addons.length > 0 && (
        <Section n={nextSection()} title="加購周邊商品（選填）">
          <ul className="grid gap-2">
            {catalog.addons.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium">
                    {p.name}{" "}
                    <span className="text-neutral-600">{fmt(p.price)}</span>
                  </p>
                  {p.description && (
                    <p className="text-sm text-neutral-500">{p.description}</p>
                  )}
                </div>
                <span className="flex items-center gap-1 text-sm">
                  <QuantityInput
                    value={itemQty[p.id] ?? 0}
                    min={0}
                    onChange={(q) => setItemQty((m) => ({ ...m, [p.id]: q }))}
                    label={`${p.name} 數量`}
                  />
                  個
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section n={nextSection()} title="客製化製作（選填）">
        <p className="text-sm text-neutral-600">
          相冊、馬克杯等客製化商品，請上傳要用的照片並說明需求，店家會再透過
          LINE 與你一對一確認張數、細節和報價（不含在下方總金額）。
        </p>
        <PhotoBucket
          bucket={CUSTOM_BUCKET}
          entries={customEntries}
          notices={notices.filter((n) => n.bucket === CUSTOM_BUCKET)}
          uploader={uploader}
        />
        <textarea
          value={customNote}
          onChange={(e) => setCustomNote(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="例如：想做一本 20 頁的相本，封面用第一張照片"
          aria-label="客製化需求說明"
          className="rounded-lg border p-3"
        />
      </Section>

      <Section n={nextSection()} title="聯絡資料">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="姓名" required>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              maxLength={50}
              autoComplete="name"
              className="rounded-lg border px-3 py-2"
            />
          </Field>
          <Field label="手機" required>
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              type="tel"
              inputMode="tel"
              placeholder="0912345678"
              autoComplete="tel"
              className="rounded-lg border px-3 py-2"
            />
          </Field>
        </div>
        <Field label="備註">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={2}
            className="rounded-lg border p-3"
          />
        </Field>
      </Section>

      <Section n={nextSection()} title="付款方式">
        <div className="grid gap-2 sm:grid-cols-3">
          {(Object.keys(PAYMENT_LABEL) as PaymentMethod[]).map((m) => (
            <label
              key={m}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 ${
                paymentMethod === m
                  ? "border-neutral-900 ring-1 ring-neutral-900"
                  : ""
              }`}
            >
              <input
                type="radio"
                name="paymentMethod"
                value={m}
                checked={paymentMethod === m}
                onChange={() => setPaymentMethod(m)}
              />
              {PAYMENT_LABEL[m]}
            </label>
          ))}
        </div>
        <div className="rounded-lg bg-neutral-50 p-4 text-sm">
          <PaymentDetails method={paymentMethod} />
          {paymentMethod === "bank_transfer" && (
            <div className="mt-4 grid gap-3">
              <p className="text-neutral-600">
                轉帳後請填寫帳號末五碼，或上傳轉帳截圖（擇一即可）。
              </p>
              <Field label="轉出帳號末五碼">
                <input
                  value={bankLast5}
                  onChange={(e) =>
                    setBankLast5(e.target.value.replace(/\D/g, "").slice(0, 5))
                  }
                  inputMode="numeric"
                  placeholder="12345"
                  className="w-32 rounded-lg border bg-white px-3 py-2 font-mono"
                />
              </Field>
              <div className="grid gap-2">
                <span className="font-medium">轉帳截圖</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  aria-label="轉帳截圖"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadProof(f);
                    e.target.value = "";
                  }}
                />
                {proof.status === "uploading" && (
                  <span>上傳中 {Math.round(proof.progress * 100)}%</span>
                )}
                {proof.status === "done" && (
                  <span className="text-green-700">截圖已上傳</span>
                )}
                {proof.status === "failed" && (
                  <span className="text-red-600">{proof.error}</span>
                )}
                {(proof.status === "uploading" || proof.status === "done") && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={proof.previewUrl}
                    alt="轉帳截圖預覽"
                    className="max-h-48 w-fit rounded border"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </Section>

      <section className="grid gap-3 rounded-xl border-2 border-neutral-900 p-4">
        <h2 className="text-lg font-bold">訂單金額</h2>
        <table className="w-full text-sm">
          <tbody>
            {groupLines
              .filter((g) => g.photos > 0)
              .map((g) => (
                <Fragment key={g.key}>
                  <tr>
                    <td className="py-1">{g.title}</td>
                    <td className="py-1 text-neutral-600">
                      {g.photos} 張照片，共印 {g.prints} 張 × {fmt(g.unitPrice)}
                      {g.printing > g.unitPrice * g.prints && "（未滿低消）"}
                    </td>
                    <td className="py-1 text-right">{fmt(g.printing)}</td>
                  </tr>
                  {g.laminationUnitPrice !== null && (
                    <tr>
                      <td className="py-1 pl-4">護貝</td>
                      <td className="py-1 text-neutral-600">
                        {g.prints} 張 × {fmt(g.laminationUnitPrice)}
                        {g.lamination > g.laminationUnitPrice * g.prints &&
                          "（未滿低消）"}
                      </td>
                      <td className="py-1 text-right">{fmt(g.lamination)}</td>
                    </tr>
                  )}
                </Fragment>
              ))}
            {idPhotoLines.map((l) => (
              <tr key={l.id}>
                <td className="py-1">{l.name}</td>
                <td className="py-1 text-neutral-600">
                  {l.sets} 組 × {fmt(l.price)}
                </td>
                <td className="py-1 text-right">{fmt(l.subtotal)}</td>
              </tr>
            ))}
            {itemLines.map((i) => (
              <tr key={i.id}>
                <td className="py-1">{i.name}</td>
                <td className="py-1 text-neutral-600">
                  {i.quantity} 個 × {fmt(i.price)}
                </td>
                <td className="py-1 text-right">{fmt(i.subtotal)}</td>
              </tr>
            ))}
            {(customEntries.length > 0 || customNote) && (
              <tr>
                <td className="py-1">客製化製作</td>
                <td className="py-1 text-neutral-600">
                  {customEntries.length} 張照片
                </td>
                <td className="py-1 text-right text-neutral-600">另行報價</td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t font-bold">
              <td className="pt-2" colSpan={2}>
                總計
              </td>
              <td className="pt-2 text-right text-lg">{fmt(total)}</td>
            </tr>
          </tfoot>
        </table>
        {error && (
          <p
            role="alert"
            className="rounded-md bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={submitting || busy}
          className="rounded-lg bg-neutral-900 px-4 py-3 font-bold text-white disabled:opacity-50"
        >
          {submitting
            ? "送出中…"
            : busy
              ? "照片上傳中，請稍候…"
              : "確認送出訂單"}
        </button>
      </section>
    </div>
  );
}

function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <span className="grid size-7 place-items-center rounded-full bg-neutral-900 text-sm text-white">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-medium">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
    </label>
  );
}

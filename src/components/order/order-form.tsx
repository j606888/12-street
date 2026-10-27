"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { submitOrder } from "@/actions/order";
import {
  ArrowRightIcon,
  BookIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  IdCardIcon,
} from "@/components/icons";
import {
  PAYMENT_LABEL,
  type PaymentMethod,
} from "@/components/payment-details";
import type { Catalog, DraftView } from "@/lib/draft";
import {
  BACKGROUND_REMOVAL_PRICE,
  groupCharges,
  itemSubtotal,
  MIN_CHARGE,
  printCharges,
} from "@/lib/pricing";
import { emailSchema, phoneSchema } from "@/lib/validators/order";
import { PhotoBucket, Stepper } from "./photo-bucket";
import {
  CUSTOM_BUCKET,
  type Entry,
  ID_PHOTO_BUCKET,
  usePhotoUploader,
} from "./use-photo-uploader";
import { LineIconTile } from "@/components/line-login";

type Member = {
  name: string;
  phone: string | null;
  email: string | null;
} | null;

/** Which screen of the order flow is showing; the draft itself lives on the server. */
type View =
  | { kind: "pick" }
  | { kind: "group"; key: string }
  | { kind: "id_photo" }
  | { kind: "custom" }
  | { kind: "checkout" };

/** Checkout fields that can block submitting, in on-screen order. */
type FieldKey = "content" | "name" | "phone" | "email";
const FIELD_ORDER: FieldKey[] = ["content", "name", "phone", "email"];
type FieldErrors = Partial<Record<FieldKey, string>>;
const fieldId = (key: FieldKey) => `checkout-${key}`;

const fmt = (n: number) => `$${n.toLocaleString("zh-TW")}`;

/** Outline drawn on each size button, in px, to show the print's proportions. */
const SIZE_BOX: Record<string, [width: number, height: number]> = {
  "2x3s": [7, 11], // actual size not confirmed yet, see docs/owner-pricing.md
  "2x3": [9, 14],
  "3x5": [14, 23],
  "4x6": [18, 27],
  "5x7": [23, 32],
  "6x8": [27, 36],
  "8x10": [36, 45],
  "8x12": [36, 54],
};

export function OrderForm({
  catalog,
  draft,
  member,
  cashAllowed,
  guestLink,
}: {
  catalog: Catalog;
  draft: DraftView | null;
  member: Member;
  /** Whether 取件時付現金 is offered: always on the /guest link, per member on /order */
  cashAllowed: boolean;
  /** Placed from the in-store /guest link */
  guestLink?: boolean;
}) {
  const paymentMethods = (Object.keys(PAYMENT_LABEL) as PaymentMethod[]).filter(
    (m) => cashAllowed || m !== "cash_on_pickup",
  );
  // ID-photo set new uploads start with; each photo can switch to another
  const [idSetId, setIdSetId] = useState(
    () => draft?.idPhotos[0]?.productId ?? catalog.idPhotoSets[0]?.id,
  );
  const uploader = usePhotoUploader(draft, catalog.sizes[0]?.id ?? 0, idSetId);
  const { groups, entries, notices } = uploader;

  // The size list doubles as the overview, so a resumed draft starts there too
  const [view, setView] = useState<View>({ kind: "pick" });
  const [itemQty, setItemQty] = useState<Record<number, number>>({});
  const [customNote, setCustomNote] = useState("");
  const [contactName, setContactName] = useState(member?.name ?? "");
  const [contactPhone, setContactPhone] = useState(member?.phone ?? "");
  const [contactEmail, setContactEmail] = useState(member?.email ?? "");
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    paymentMethods[0],
  );
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, startSubmit] = useTransition();

  function go(next: View) {
    setView(next);
    window.scrollTo({ top: 0 });
  }

  const sizeById = new Map(catalog.sizes.map((s) => [s.id, s]));
  const groupLines = groups.map((g, i) => {
    const size = sizeById.get(g.printSizeId);
    const photos = entries.filter((e) => e.bucket === g.key);
    const unitPrice = size?.price ?? 0;
    const laminatedPrints = photos.reduce((n, e) => n + e.laminateQuantity, 0);
    const laminationUnitPrice = laminatedPrints
      ? (size?.laminationPrice ?? 0)
      : null;
    const charges = groupCharges({
      unitPrice,
      laminationUnitPrice,
      laminatedPrints,
      quantities: photos.map((e) => e.quantity),
    });
    return {
      key: g.key,
      no: i + 1,
      printSizeId: g.printSizeId,
      sizeCode: size?.code ?? "",
      sizeLabel: size?.label ?? "",
      photos,
      unitPrice,
      laminationUnitPrice,
      laminationPrice: size?.laminationPrice ?? 0,
      ...charges,
    };
  });
  // 低消 counts every size together
  const prints = printCharges(
    groupLines.map((g) => ({
      unitPrice: g.unitPrice,
      laminationUnitPrice: g.laminationUnitPrice,
      laminatedPrints: g.laminatedPrints,
      quantities: [g.prints],
    })),
  );
  const minimumLines = [
    prints.printingTopUp > 0 && {
      key: "printing",
      label: `洗照片未滿 ${fmt(MIN_CHARGE)}，補差額`,
      amount: prints.printingTopUp,
    },
    prints.laminationTopUp > 0 && {
      key: "lamination",
      label: `護貝未滿 ${fmt(MIN_CHARGE)}，補差額`,
      amount: prints.laminationTopUp,
    },
  ].filter((l) => l !== false);
  const idPhotoEntries = entries.filter((e) => e.bucket === ID_PHOTO_BUCKET);
  const idPhotoLines = catalog.idPhotoSets
    .map((set) => {
      const photos = idPhotoEntries.filter((e) => e.productId === set.id);
      const sets = photos.reduce((n, e) => n + e.quantity, 0);
      const removals = photos.filter((e) => e.removeBackground).length;
      return {
        ...set,
        sets,
        removals,
        subtotal: photos.reduce(
          (sum, e) =>
            sum +
            itemSubtotal({
              unitPrice: set.price,
              quantity: e.quantity,
              backgroundRemovalPrice: e.removeBackground
                ? BACKGROUND_REMOVAL_PRICE
                : null,
            }),
          0,
        ),
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
    prints.total +
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

  /** Open the size's group if it has one, else reuse an empty group or start a new one. */
  function startGroup(printSizeId: number) {
    const existing = groupLines.find(
      (g) => g.printSizeId === printSizeId && g.photos.length > 0,
    );
    if (existing) return go({ kind: "group", key: existing.key });
    const empty = groups.find((g) => !entries.some((e) => e.bucket === g.key));
    if (empty) {
      if (empty.printSizeId !== printSizeId)
        void uploader.updateGroupOptions(empty.key, { printSizeId });
      go({ kind: "group", key: empty.key });
    } else {
      go({ kind: "group", key: uploader.addGroup(printSizeId) });
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
            laminateQuantity: e.laminateQuantity,
            productId: e.productId,
            removeBackground: e.removeBackground,
          })),
        items: catalog.addons.map((p) => ({
          productId: p.id,
          quantity: itemQty[p.id] ?? 0,
        })),
        paymentMethod,
        guestLink,
      });
      // On success the action redirects to the complete page
      if (res && !res.ok) setError(res.error);
    });
  }

  const currentGroup =
    view.kind === "group"
      ? groupLines.find((g) => g.key === view.key)
      : undefined;
  // A group that no longer exists falls back to the size list
  const screen: View["kind"] =
    view.kind === "group" && !currentGroup ? "pick" : view.kind;
  const toPick = () => go({ kind: "pick" });

  // Everything picked so far: listed on the size list and again at checkout
  const orderLines: OrderLine[] = [
    ...groupLines
      .filter((g) => g.photos.length > 0)
      .map((g) => ({
        key: g.key,
        photos: g.photos,
        title: `${g.sizeLabel} 照片 ${g.prints} 張`,
        desc: [
          `${g.photos.length} 張照片`,
          g.laminatedPrints > 0 && `護貝 ${g.laminatedPrints} 張`,
        ]
          .filter(Boolean)
          .join("・"),
        amount: fmt(g.total),
        view: { kind: "group", key: g.key } as const,
      })),
    ...idPhotoLines.map((l) => ({
      key: `id-${l.id}`,
      photos: idPhotoEntries.filter((e) => e.productId === l.id),
      title: `證件照 ${l.sets} 組`,
      desc: [
        l.name.replace(/^證件照：/, ""),
        l.removals > 0 && `去背 ${l.removals} 張`,
      ]
        .filter(Boolean)
        .join("・"),
      amount: fmt(l.subtotal),
      view: { kind: "id_photo" } as const,
    })),
    ...(customEntries.length > 0 || customNote
      ? [
          {
            key: "custom",
            photos: customEntries,
            title: "客製化商品",
            desc: customEntries.length
              ? `${customEntries.length} 張照片`
              : undefined,
            amount: "另外報價",
            view: { kind: "custom" } as const,
          },
        ]
      : []),
  ];
  const idSets = idPhotoLines.reduce((n, l) => n + l.sets, 0);
  const orderCaption = [
    prints.prints > 0 && `照片 ${prints.prints} 張`,
    idSets > 0 && `證件照 ${idSets} 組`,
    (customEntries.length > 0 || customNote) && "客製化",
    itemLines.length > 0 &&
      `${itemLines.reduce((n, i) => n + i.quantity, 0)} 個商品`,
  ]
    .filter(Boolean)
    .join("・");

  // ---- 選尺寸（也是整筆訂單的總覽） ----
  if (screen === "pick") {
    const minimumNote = minimumChargeNote(catalog.sizes);
    const printsBySize = new Map<number, number>();
    for (const g of groupLines)
      printsBySize.set(
        g.printSizeId,
        (printsBySize.get(g.printSizeId) ?? 0) + g.prints,
      );
    const checkoutButton = (
      <PrimaryButton
        onClick={() => go({ kind: "checkout" })}
        disabled={!hasContent}
      >
        選好了，去結帳
        <ArrowRightIcon className="size-5" />
      </PrimaryButton>
    );
    return (
      <div className="mx-auto grid w-full max-w-3xl gap-6 lg:max-w-none lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
        <div className="grid min-w-0 gap-5">
          <StepHeader step={1} />
          <div className="grid gap-1.5">
            <h1 className={h1Class}>要洗哪些照片？</h1>
            {!hasContent && (
              <p className="text-muted text-base">
                點一個尺寸放照片。洗好幾種尺寸也可以，選完會回到這裡。
              </p>
            )}
          </div>

          {orderLines.length > 0 && (
            <section className="grid gap-2.5 lg:hidden">
              <h2 className={h2Class}>已經選的</h2>
              <ul className="border-line bg-card divide-subtle grid divide-y overflow-hidden rounded-2xl border">
                {orderLines.map((l) => (
                  <OrderLineRow
                    key={l.key}
                    line={l}
                    onClick={() => go(l.view)}
                  />
                ))}
                {minimumLines.map((l) => (
                  <MinimumLineRow key={l.key} line={l} className="px-3.5" />
                ))}
              </ul>
              <p className="text-muted text-[15px]">
                點一行可以加減照片或張數。
              </p>
            </section>
          )}

          <section className="grid gap-2.5">
            {hasContent && <h2 className={h2Class}>再洗別的尺寸</h2>}
            {minimumNote && (
              <p className="bg-brand-tint text-brand-dark rounded-[14px] px-4 py-3 text-base font-bold">
                {minimumNote}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2.5 pt-1.5 sm:grid-cols-4">
              {catalog.sizes.map((s) => {
                const picked = printsBySize.get(s.id) ?? 0;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => startGroup(s.id)}
                    className={`hover:border-brand hover:bg-brand-tint relative flex min-h-23 items-center gap-3 rounded-2xl border-2 p-3 text-left transition-colors ${
                      picked
                        ? "border-brand bg-brand-tint"
                        : "border-line bg-card"
                    }`}
                  >
                    {picked > 0 && (
                      <span className="bg-brand-dark absolute -top-2.5 right-2.5 flex items-center gap-1 rounded-full py-0.5 pr-2.5 pl-1.5 text-[13px] font-bold text-white">
                        <CheckIcon className="size-3.5" />
                        {picked} 張
                      </span>
                    )}
                    <SizeBox code={s.code} />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="text-[23px] leading-tight font-bold">
                        {s.label}
                      </span>
                      <span className="text-brand-dark text-base font-semibold">
                        一張 ${s.price}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="grid gap-2.5">
            <h2 className={h2Class}>其他</h2>
            <div className="border-line bg-card divide-line grid divide-y overflow-hidden rounded-2xl border">
              {catalog.idPhotoSets.length > 0 && (
                <ServiceLink
                  icon={<IdCardIcon className="size-6.5" />}
                  title="證件照"
                  price={`一組 $${catalog.idPhotoSets[0].price}`}
                  onClick={() => go({ kind: "id_photo" })}
                />
              )}
              <ServiceLink
                icon={<BookIcon className="size-6.5" />}
                title="客製化商品"
                price="專人報價"
                onClick={() => go({ kind: "custom" })}
              />
              {catalog.addons.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-lg font-bold">
                      {p.name}{" "}
                      <span className="text-brand-dark text-base">
                        ${p.price}
                      </span>
                    </p>
                    {p.description && (
                      <p className="text-muted text-[15px]">{p.description}</p>
                    )}
                  </div>
                  <Stepper
                    value={itemQty[p.id] ?? 0}
                    min={0}
                    onChange={(q) => setItemQty((m) => ({ ...m, [p.id]: q }))}
                    label={`${p.name} 數量`}
                    unit="個"
                  />
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="border-line bg-card sticky top-6 hidden gap-1 rounded-2xl border p-5 lg:grid">
          <h2 className={h2Class}>你的訂單</h2>
          {orderLines.length === 0 && itemLines.length === 0 ? (
            <p className="text-muted py-3 text-base">
              還沒選照片，先點左邊的尺寸。
            </p>
          ) : (
            <ul className="divide-subtle grid divide-y">
              {orderLines.map((l) => (
                <OrderLineRow
                  flush
                  key={l.key}
                  line={l}
                  onClick={() => go(l.view)}
                />
              ))}
              {itemLines.map((p) => (
                <ItemLineRow key={p.id} item={p} />
              ))}
              {minimumLines.map((l) => (
                <MinimumLineRow key={l.key} line={l} />
              ))}
            </ul>
          )}
          <div className="border-line flex items-baseline justify-between gap-3 border-t pt-4 pb-3">
            <span className="text-muted text-base">
              {orderCaption || "總計"}
            </span>
            <span className="text-[26px] font-bold tabular-nums">
              {fmt(total)}
            </span>
          </div>
          <div className="flex">{checkoutButton}</div>
        </aside>

        <BottomBar
          caption={orderCaption}
          hint={!hasContent ? "點一個尺寸開始放照片" : undefined}
          amount={total}
          className="lg:hidden"
        >
          {checkoutButton}
        </BottomBar>
      </div>
    );
  }

  // ---- 一個尺寸的照片 ----
  if (screen === "group" && currentGroup) {
    const g = currentGroup;
    // Prints of this size that still fit under the order's 低消
    const extra = g.unitPrice
      ? Math.floor(prints.printingTopUp / g.unitPrice)
      : 0;
    const hasPhotos = g.photos.length > 0;
    return (
      <div className={`${narrowClass} gap-4`}>
        <StepHeader
          step={1}
          back={{ label: "返回所有尺寸", onClick: toPick }}
        />
        <ContextBanner
          icon={<SizeBox code={g.sizeCode} onTint />}
          label={`${g.sizeLabel} 照片`}
          price={[
            `一張 $${g.unitPrice}`,
            g.laminationPrice > 0 && `護貝每張 +$${g.laminationPrice}`,
          ]
            .filter(Boolean)
            .join("・")}
        />

        <PhotoBucket
          bucket={g.key}
          entries={g.photos}
          notices={notices.filter((n) => n.bucket === g.key)}
          uploader={uploader}
          quantityUnit="張"
          laminationPrice={g.laminationPrice}
          onRemoveAll={() => void uploader.removeGroup(g.key)}
        />

        {hasPhotos &&
          (prints.printingTopUp > 0 || prints.laminationTopUp > 0) && (
            <p className="bg-brand-tint text-brand-dark grid gap-0.5 rounded-[14px] px-4 py-3 text-[15px] font-bold">
              {prints.printingTopUp > 0 && (
                <span>
                  整筆訂單洗照片最少收 {fmt(MIN_CHARGE)}
                  {extra > 0 && `，再多洗 ${extra} 張不加錢`}。
                </span>
              )}
              {prints.laminationTopUp > 0 && (
                <span>整筆訂單護貝最少收 {fmt(MIN_CHARGE)}。</span>
              )}
            </p>
          )}

        <BottomBar
          caption={`${g.sizeLabel} 共 ${g.prints} 張${
            g.laminatedPrints ? `・護貝 ${g.laminatedPrints} 張` : ""
          }`}
          hint={hasPhotos ? undefined : `${g.sizeLabel} 還沒放照片`}
          amount={g.total}
        >
          <DoneButton done={hasPhotos} onClick={toPick}>
            這個尺寸選好了
          </DoneButton>
        </BottomBar>
      </div>
    );
  }

  // ---- 證件照 ----
  if (screen === "id_photo") {
    const hasPhotos = idPhotoEntries.length > 0;
    // The set every photo shares (or the one new photos get); none when they differ
    const sharedIdSet = hasPhotos
      ? idPhotoEntries.every((e) => e.productId === idPhotoEntries[0].productId)
        ? idPhotoEntries[0].productId
        : undefined
      : idSetId;
    return (
      <div className={`${narrowClass} gap-4`}>
        <StepHeader
          step={1}
          back={{ label: "返回所有尺寸", onClick: toPick }}
        />
        <ContextBanner
          icon={<IdCardIcon className="text-brand-dark size-8" />}
          label="證件照"
          price={`一組 $${catalog.idPhotoSets[0]?.price ?? 0}`}
        />

        <div className="grid gap-1">
          <h2 className={h2Class}>
            {idPhotoEntries.length > 1 ? "全部改成哪一種？" : "要哪一種？"}
          </h2>
          <p className="text-muted text-[15px]">
            每張照片可以選不同種，在照片下面改。
          </p>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {catalog.idPhotoSets.map((set) => (
            <ChoiceCard
              key={set.id}
              name="idPhotoSet"
              checked={set.id === sharedIdSet}
              onSelect={() => pickIdSet(set.id)}
              title={set.name.replace(/^證件照：/, "")}
              desc={set.description?.split("、").slice(0, 2).join("、")}
            />
          ))}
        </div>

        <div className="mt-2 grid gap-1">
          <h2 className={h2Class}>照片和組數</h2>
          <p className="text-muted text-[15px]">
            要去背的照片，在照片下面勾「去背」，每張加 $
            {BACKGROUND_REMOVAL_PRICE}。
          </p>
        </div>
        <PhotoBucket
          bucket={ID_PHOTO_BUCKET}
          entries={idPhotoEntries}
          notices={notices.filter((n) => n.bucket === ID_PHOTO_BUCKET)}
          uploader={uploader}
          quantityUnit="組"
          idPhotoSets={catalog.idPhotoSets.map((s) => ({
            id: s.id,
            name: s.name.replace(/^證件照：/, ""),
          }))}
          backgroundRemovalPrice={BACKGROUND_REMOVAL_PRICE}
        />
        <BottomBar
          caption={`證件照 共 ${idSets} 組`}
          hint={hasPhotos ? undefined : "證件照還沒放照片"}
          amount={idPhotoLines.reduce((s, l) => s + l.subtotal, 0)}
        >
          <DoneButton done={hasPhotos} onClick={toPick}>
            證件照選好了
          </DoneButton>
        </BottomBar>
      </div>
    );
  }

  // ---- 客製化 ----
  if (screen === "custom") {
    const empty = customEntries.length === 0 && !customNote.trim();
    return (
      <div className={`${narrowClass} gap-4`}>
        <StepHeader
          step={1}
          back={{ label: "返回所有尺寸", onClick: toPick }}
        />
        <ContextBanner
          icon={<BookIcon className="text-brand-dark size-8" />}
          label="客製化商品"
          price="送出後，店家會跟您聯絡報價"
        />
        <PhotoBucket
          bucket={CUSTOM_BUCKET}
          entries={customEntries}
          notices={notices.filter((n) => n.bucket === CUSTOM_BUCKET)}
          uploader={uploader}
        />
        <label className="mt-1 grid gap-2 text-lg font-bold">
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
          hint={empty ? "放照片或寫想做什麼" : undefined}
          amountText="另外報價"
        >
          <DoneButton done={!empty} onClick={toPick}>
            客製化選好了
          </DoneButton>
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
    <div className={`${narrowClass} gap-5`}>
      <StepHeader step={2} back={{ label: "回上一步修改", onClick: toPick }} />
      <h1 className={h1Class}>填資料，送出</h1>

      <section
        id={fieldId("content")}
        tabIndex={-1}
        className={`bg-card overflow-hidden rounded-2xl border-2 px-4 outline-none ${
          errors.content ? "border-red-600" : "border-line"
        }`}
      >
        {!hasContent && (
          <p className="text-muted pt-4 text-base">還沒有加照片。</p>
        )}
        {errors.content && hasContent && (
          <p className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-base text-red-800">
            {errors.content}
          </p>
        )}
        <ul className="divide-subtle grid divide-y">
          {orderLines.map((l) => (
            <OrderLineRow
              key={l.key}
              line={l}
              // Only rows with a failed upload lead back; everything else is edited one step back
              onClick={uploadIssue(l.photos) ? () => go(l.view) : undefined}
            />
          ))}
          {itemLines.map((p) => (
            <ItemLineRow key={p.id} item={p} />
          ))}
          {minimumLines.map((l) => (
            <MinimumLineRow key={l.key} line={l} />
          ))}
        </ul>
        <div className="border-line flex items-baseline justify-between gap-3 border-t py-3.5">
          <span className="text-[17px] font-bold">總計</span>
          <span className="text-[26px] font-bold tabular-nums">
            {fmt(total)}
          </span>
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
            className="flex min-h-13 items-center gap-3 rounded-[14px] bg-green-50 px-4 py-2.5 text-[15px] leading-snug text-green-900"
          >
            <LineIconTile />
            <span>
              <strong>用 LINE 登入</strong>，以後可以查以前的訂單
            </span>
          </Link>
        )}
      </section>

      <section className="grid gap-2.5">
        <h2 className={h2Class}>怎麼付錢？</h2>
        {paymentMethods.map((m) => (
          <ChoiceCard
            key={m}
            name="paymentMethod"
            checked={paymentMethod === m}
            onSelect={() => setPaymentMethod(m)}
            title={PAYMENT_LABEL[m]}
          />
        ))}
        {paymentMethod !== "cash_on_pickup" && (
          <p className="text-muted text-base">
            {paymentMethod === "bank_transfer"
              ? "送出訂單後會顯示轉帳帳號，轉帳後再回來填末五碼或傳截圖。"
              : "送出訂單後會顯示店家的 LINE 好友連結。"}
          </p>
        )}
      </section>

      <p className="text-muted text-center text-[15px]">
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

const h1Class = "text-[28px] leading-tight font-bold";
const h2Class = "text-xl font-bold";
/** Every screen but the size list keeps to one readable column. */
const narrowClass = "mx-auto grid w-full max-w-3xl";
const inputBase =
  "w-full rounded-[14px] border-2 border-field bg-card px-4 font-medium placeholder:text-muted/70 focus:outline-2 focus:outline-offset-1 focus:outline-brand aria-invalid:border-red-600 aria-invalid:focus:outline-red-600";
const inputClass = `${inputBase} h-13.5 text-lg`;
const textareaClass = `${inputBase} py-3 text-lg leading-normal`;

/** 低消 note, shown when some size's single print or lamination costs less than the minimum. */
function minimumChargeNote(
  sizes: { price: number; laminationPrice: number }[],
) {
  const cheap = (price: number) => price > 0 && price < MIN_CHARGE;
  const cheapPrint = sizes.some((s) => cheap(s.price));
  const cheapLam = sizes.some((s) => cheap(s.laminationPrice));
  if (!cheapPrint && !cheapLam) return null;
  const min = `$${MIN_CHARGE}`;
  const rule = cheapPrint
    ? `整筆訂單洗照片未滿 ${min} 收 ${min}${cheapLam ? "，護貝也一樣另外算" : ""}`
    : `整筆訂單護貝未滿 ${min} 收 ${min}`;
  return `${rule}；不同尺寸合起來算`;
}

/** Transfer screenshot: pick, upload progress, preview, replace/remove. */
/** Shown on a checkout row whose photos still need a retry or removal. */
function uploadIssue(photos: Entry[]) {
  const bad = photos.filter(
    (p) => p.status === "failed" || p.status === "missing",
  ).length;
  return bad ? `${bad} 張沒傳成功，點這裡處理` : undefined;
}

/** Back button, the two steps and a progress bar on top of each order screen. */
function StepHeader({
  step,
  back,
}: {
  step: 1 | 2;
  back?: { label: string; onClick: () => void };
}) {
  return (
    <div className="grid gap-2">
      {back && (
        <button
          type="button"
          onClick={back.onClick}
          // Outlined on phones, where testers kept missing it as a plain link.
          className="text-brand-dark hover:bg-brand-tint border-brand bg-card flex min-h-12 items-center gap-1 justify-self-start rounded-[14px] border-2 pr-4 pl-2.5 text-[17px] font-bold sm:-ml-2 sm:min-h-11 sm:rounded-xl sm:border-0 sm:bg-transparent sm:pr-3.5 sm:pl-1.5"
        >
          <ChevronLeftIcon className="size-5.5" />
          {back.label}
        </button>
      )}
      <ol className="text-muted flex justify-between text-[15px] font-bold">
        {["選照片", "填資料送出"].map((name, i) => (
          <li
            key={name}
            aria-current={i + 1 === step ? "step" : undefined}
            className={i + 1 === step ? "text-brand-dark" : ""}
          >
            {i + 1} {name}
          </li>
        ))}
      </ol>
      <div aria-hidden="true" className="grid grid-cols-2 gap-1.5">
        {[1, 2].map((n) => (
          <span
            key={n}
            className={`h-1.5 rounded-full ${n <= step ? "bg-brand" : "bg-line"}`}
          />
        ))}
      </div>
    </div>
  );
}

/** Outline of the print's proportions, as drawn on the size buttons. */
function SizeBox({ code, onTint }: { code: string; onTint?: boolean }) {
  const box = SIZE_BOX[code];
  if (!box) return null;
  return (
    <span
      aria-hidden="true"
      className="grid h-14 w-10 shrink-0 place-items-center"
    >
      <span
        className={`border-brand rounded-[3px] border-2 ${
          onTint ? "bg-card" : "bg-brand-soft"
        }`}
        style={{ width: box[0], height: box[1] }}
      />
    </span>
  );
}

/** Tinted card on top of a photo screen, so it's always clear what the photos are for. */
function ContextBanner({
  icon,
  label,
  price,
}: {
  icon: React.ReactNode;
  label: string;
  price: string;
}) {
  return (
    <div className="border-brand bg-brand-tint flex items-center gap-3.5 rounded-2xl border-2 px-4 py-3.5">
      <span className="grid w-10 shrink-0 place-items-center">{icon}</span>
      <div className="grid min-w-0 gap-0.5">
        <span className="text-brand-dark text-[13px] font-bold">
          正在放這個項目的照片
        </span>
        <h1 className={h1Class}>{label}</h1>
        <span className="text-muted text-[15px]">{price}</span>
      </div>
    </div>
  );
}

type OrderLine = {
  key: string;
  photos: Entry[];
  title: string;
  desc?: string;
  amount: string;
  view: View;
};

/** One row of the order: stacked thumbnails, what it is, and its amount. */
function OrderLineRow({
  line,
  onClick,
  flush,
}: {
  line: OrderLine;
  /** Omit for a read-only row. */
  onClick?: () => void;
  /** Keep the text aligned with the card's own padding (side panel). */
  flush?: boolean;
}) {
  const thumbs = line.photos.filter((p) => p.previewUrl).slice(0, 3);
  const issue = uploadIssue(line.photos);
  const body = (
    <>
      <span className="flex w-20 shrink-0">
        {thumbs.map((p) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p.localId}
            src={p.previewUrl}
            alt=""
            className="border-card bg-subtle -mr-3 size-11 rounded-lg border-2 object-cover"
          />
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] leading-snug font-bold">
          {line.title}
        </span>
        {line.desc && (
          <span className="text-muted block text-[15px]">{line.desc}</span>
        )}
        {issue && (
          <span className="block text-[15px] font-bold text-red-700">
            {issue}
          </span>
        )}
      </span>
      <span className="text-[17px] font-bold whitespace-nowrap tabular-nums">
        {line.amount}
      </span>
      {onClick && <ChevronRightIcon className="text-muted size-5 shrink-0" />}
    </>
  );
  return (
    <li>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={`hover:bg-brand-tint flex min-h-19 w-full items-center gap-3 py-3 text-left ${
            flush ? "-mx-2 rounded-xl px-2" : "px-3.5"
          }`}
        >
          {body}
        </button>
      ) : (
        <div className="flex min-h-19 items-center gap-3 py-3">{body}</div>
      )}
    </li>
  );
}

function ItemLineRow({
  item,
}: {
  item: { name: string; quantity: number; subtotal: number };
}) {
  return (
    <li className="flex min-h-14 items-center justify-between gap-3 py-3">
      <span className="text-[17px] font-bold">
        {item.name} {item.quantity} 個
      </span>
      <span className="text-[17px] font-bold tabular-nums">
        {fmt(item.subtotal)}
      </span>
    </li>
  );
}

/** 低消 top-up for the whole order's printing or lamination. */
function MinimumLineRow({
  line,
  className = "",
}: {
  line: { label: string; amount: number };
  className?: string;
}) {
  return (
    <li
      className={`flex min-h-14 items-center justify-between gap-3 py-3 ${className}`}
    >
      <span className="text-muted text-base">{line.label}</span>
      <span className="text-[17px] font-bold tabular-nums">
        {fmt(line.amount)}
      </span>
    </li>
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
      className="hover:bg-brand-tint flex min-h-16 items-center gap-3 px-3.5 text-left"
    >
      <span className="text-brand shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 text-lg font-bold">{title}</span>
      <span className="text-brand-dark text-base font-semibold whitespace-nowrap">
        {price}
      </span>
      <ChevronRightIcon className="text-muted size-5 shrink-0" />
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
      className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border-2 px-3.5 py-2 ${
        checked ? "border-brand bg-brand-tint" : "border-line bg-card"
      }`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="accent-brand size-6 shrink-0"
      />
      <span className="min-w-0">
        <span className="block text-lg leading-snug font-bold">{title}</span>
        {desc && <span className="text-muted block text-[15px]">{desc}</span>}
      </span>
    </label>
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
  className = "",
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
  className?: string;
  children: React.ReactNode;
}) {
  const typing = useTouchTyping();
  return (
    <div
      className={`border-line bg-card fixed inset-x-0 bottom-0 z-10 border-t ${
        typing ? "hidden" : ""
      } ${className}`}
    >
      {alert && (
        <div role="alert" className="border-b border-red-200 bg-red-50">
          <button
            type="button"
            onClick={onAlertClick}
            disabled={!onAlertClick}
            className="mx-auto flex min-h-12 w-full max-w-3xl items-center gap-2.5 px-4 py-2 text-left text-base font-bold text-red-800"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-red-700 text-sm font-bold text-white">
              !
            </span>
            <span className="flex-1">{alert}</span>
            {onAlertClick && (
              <span className="shrink-0 text-[15px] underline">去修改</span>
            )}
          </button>
        </div>
      )}
      <div className="mx-auto grid max-w-3xl gap-2.5 px-4 pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex items-baseline justify-between gap-3">
          <p
            className={`min-w-0 truncate text-base font-semibold ${
              hint ? "text-brand-dark" : "text-muted"
            }`}
          >
            {hint ?? caption}
          </p>
          <p
            className="text-[26px] leading-tight font-bold whitespace-nowrap tabular-nums"
            aria-live="polite"
          >
            {amountText ?? fmt(amount ?? 0)}
          </p>
        </div>
        <div className="flex gap-2.5">{children}</div>
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

/**
 * Bottom-bar action of a photo screen: back to the size list either way, but
 * only solid once something is in, so an empty screen has no loud button.
 */
function DoneButton({
  done,
  onClick,
  children,
}: {
  done: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  if (done)
    return (
      <PrimaryButton onClick={onClick}>
        <CheckIcon className="size-5" />
        {children}
      </PrimaryButton>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-brand bg-card text-brand-dark hover:bg-brand-tint flex h-13.5 min-w-0 flex-1 items-center justify-center rounded-[14px] border-2 px-3 text-[17px] font-bold whitespace-nowrap"
    >
      先不加，回到所有尺寸
    </button>
  );
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
      className="bg-brand hover:bg-brand-dark disabled:bg-muted/70 flex h-13.5 min-w-0 flex-1 items-center justify-center gap-2 rounded-[14px] px-3 text-lg font-bold whitespace-nowrap text-white disabled:cursor-not-allowed"
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
      className={`grid gap-2 font-bold ${small ? "text-[17px]" : "text-lg"}`}
    >
      <span>
        {label}
        {optional && (
          <span className="text-muted text-base font-medium">（選填）</span>
        )}
      </span>
      {children}
      {help && !error && (
        <span className="text-muted text-[15px] font-normal">{help}</span>
      )}
      {error && (
        <span className="text-base font-normal text-red-700">{error}</span>
      )}
    </label>
  );
}

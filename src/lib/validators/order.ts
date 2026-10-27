import { z } from "zod";

export const MAX_PHOTO_BYTES = 50 * 1024 * 1024;
export const MAX_PROOF_BYTES = 15 * 1024 * 1024;
export const MAX_QUANTITY = 99;

const id = z.uuid();
const quantity = z.int().min(1).max(MAX_QUANTITY);

/** Taiwan mobile number, dashes/spaces allowed: 0912-345-678 → 0912345678 */
export const phoneSchema = z
  .string()
  .transform((s) => s.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^09\d{8}$/, "請輸入 09 開頭的 10 碼手機號碼"));

/** Where order reminders are sent; guests must give one at checkout. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("請輸入正確的 Email").max(254));

/** Order number as typed by a customer: p20261010-0001 → P20261010-0001 */
export const orderNoSchema = z
  .string()
  .transform((s) => s.replace(/\s/g, "").toUpperCase())
  .pipe(z.string().regex(/^P\d{8}-\d{4,}$/, "訂單編號格式不正確"));

export const lookupOrderInput = z.object({
  orderNo: orderNoSchema,
  phone: phoneSchema,
});

const sizeId = z.int().positive();
const productId = z.int().positive();

export const createGroupInput = z.object({ printSizeId: sizeId });
export const updateGroupInput = z.object({
  groupId: id,
  printSizeId: sizeId,
});
export const groupIdInput = z.object({ groupId: id });
export const photoIdInput = z.object({ photoId: id });

const fileMeta = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/\.jpe?g$/i, "只接受 JPG／JPEG 檔"),
  size: z.int().positive().max(MAX_PHOTO_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export const registerPhotosInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("print"),
    groupId: id,
    files: z.array(fileMeta).min(1).max(100),
  }),
  z.object({
    kind: z.literal("custom"),
    files: z.array(fileMeta).min(1).max(20),
  }),
  z.object({
    kind: z.literal("id_photo"),
    productId,
    files: z.array(fileMeta).min(1).max(20),
  }),
]);

export const confirmPhotosInput = z.object({
  photoIds: z.array(id).min(1).max(100),
});

/**
 * Quantity per photo (prints, or sets for ID photos), how many of those prints
 * get laminated and, for ID photos, the chosen set and 去背.
 */
const photoOption = z
  .object({
    photoId: id,
    quantity,
    laminateQuantity: z.int().min(0).max(MAX_QUANTITY).default(0),
    productId: productId.optional(),
    removeBackground: z.boolean().default(false),
  })
  .refine((v) => v.laminateQuantity <= v.quantity, {
    message: "護貝張數不能超過沖洗張數",
    path: ["laminateQuantity"],
  });

export const savePhotoOptionsInput = z.object({
  items: z.array(photoOption).min(1).max(1000),
});

export const transferProofUploadInput = z.object({
  orderId: id,
  contentType: z.enum(["image/jpeg", "image/png"]),
  size: z.int().positive().max(MAX_PROOF_BYTES),
});

export const PAYMENT_METHODS = [
  "cash_on_pickup",
  "line_money",
  "bank_transfer",
] as const;

export const submitOrderInput = z.object({
  contactName: z.string().trim().min(1, "請填寫姓名").max(50),
  contactPhone: phoneSchema,
  contactEmail: emailSchema.optional(),
  note: z.string().trim().max(1000).optional(),
  customNote: z.string().trim().max(2000).optional(),
  photoOptions: z.array(photoOption).max(1000),
  items: z
    .array(
      z.object({
        productId,
        quantity: z.int().min(0).max(MAX_QUANTITY),
      }),
    )
    .max(50),
  paymentMethod: z.enum(PAYMENT_METHODS),
  // Placed from the in-store /guest link, which always offers cash
  guestLink: z.boolean().optional(),
});

/** Bank transfer details the customer sends after the order is placed. */
export const paymentProofInput = z
  .object({
    orderId: id,
    bankLast5: z
      .string()
      .trim()
      .regex(/^\d{5}$/, "請輸入 5 位數字")
      .optional(),
    transferProofKey: z.string().max(200).optional(),
  })
  .refine((v) => v.bankLast5 || v.transferProofKey, {
    message: "請填寫帳號末五碼或上傳轉帳截圖",
    path: ["bankLast5"],
  });

export type SubmitOrderInput = z.input<typeof submitOrderInput>;

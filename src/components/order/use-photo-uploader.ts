"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearDraft,
  confirmPhotos,
  createGroup,
  deleteGroup,
  deletePhoto,
  getUploadUrl,
  registerPhotos,
  savePhotoOptions,
  updateGroup,
} from "@/actions/order";
import type { DraftView } from "@/lib/draft";
import {
  checkPhotoFile,
  createLimiter,
  putFile,
  sha256Hex,
  sniffPhoto,
  toJpeg,
  UploadError,
} from "./upload-utils";
import type { PhotoFormat } from "./convert-photo";

const MAX_CONCURRENT_UPLOADS = 3;
// Converting is memory-heavy (one full-size decode at a time); hashing is cheap
const convertSlot = createLimiter(1);
const hashSlot = createLimiter(2);
export const CUSTOM_BUCKET = "custom";
export const ID_PHOTO_BUCKET = "id_photo";

export type EntryStatus =
  | "hashing" // reading file + SHA-256 in the browser
  | "convertQueued" // waiting for its turn to convert
  | "converting" // HEIC/PNG/WebP → JPEG in the browser
  | "registering" // asking the server for a presigned URL
  | "queued"
  | "uploading"
  | "confirming" // server is verifying the object in R2
  | "uploaded"
  | "failed"
  | "missing"; // pending on the server but the file is gone (page reloaded mid-upload)

export type Entry = {
  localId: string;
  bucket: string; // group key, CUSTOM_BUCKET or ID_PHOTO_BUCKET
  photoId?: string;
  productId?: number; // ID-photo set (ID_PHOTO_BUCKET only)
  fileName: string;
  size: number;
  sha256?: string;
  quantity: number;
  laminateQuantity: number; // prints of `quantity` to laminate (print groups only)
  removeBackground: boolean; // 去背 (ID_PHOTO_BUCKET only)
  status: EntryStatus;
  progress: number;
  error?: string;
  file?: File;
  previewUrl?: string;
  uploadUrl?: string;
};

export type Group = {
  key: string;
  serverId?: string;
  printSizeId: number;
};

type PhotoOption = {
  quantity: number;
  laminateQuantity: number;
  productId?: number;
  removeBackground: boolean;
};

export type Notice = { bucket: string; message: string };

let seq = 0;
const newLocalId = () => `l${++seq}-${Math.random().toString(36).slice(2, 8)}`;

function entriesFromDraft(draft: DraftView | null): {
  groups: Group[];
  entries: Entry[];
} {
  if (!draft) return { groups: [], entries: [] };
  const toEntry =
    (bucket: string) =>
    (p: DraftView["customPhotos"][number]): Entry => ({
      localId: newLocalId(),
      bucket,
      photoId: p.id,
      fileName: p.fileName,
      size: p.sizeBytes,
      sha256: p.sha256,
      quantity: p.quantity,
      laminateQuantity: Math.min(p.laminateQuantity, p.quantity),
      removeBackground: p.removeBackground,
      status: p.status === "uploaded" ? "uploaded" : "missing",
      progress: p.status === "uploaded" ? 1 : 0,
      previewUrl: p.thumbUrl ?? undefined,
      productId: p.productId ?? undefined,
    });
  const groups = draft.groups.map((g) => ({
    key: g.id,
    serverId: g.id,
    printSizeId: g.printSizeId,
  }));
  const entries = [
    ...draft.groups.flatMap((g) => g.photos.map(toEntry(g.id))),
    ...draft.customPhotos.map(toEntry(CUSTOM_BUCKET)),
    ...draft.idPhotos.map(toEntry(ID_PHOTO_BUCKET)),
  ];
  return { groups, entries };
}

export function usePhotoUploader(
  draft: DraftView | null,
  defaultSizeId: number,
) {
  const [initial] = useState(() => {
    const restored = entriesFromDraft(draft);
    if (!restored.groups.length)
      restored.groups.push({ key: newLocalId(), printSizeId: defaultSizeId });
    return restored;
  });
  const [groups, setGroups] = useState<Group[]>(initial.groups);
  const [entries, setEntries] = useState<Entry[]>(initial.entries);
  const [notices, setNotices] = useState<Notice[]>([]);

  // Mirrors for async callbacks that must see the latest state
  const entriesRef = useRef(entries);
  const groupsRef = useRef(groups);
  useEffect(() => {
    entriesRef.current = entries;
    groupsRef.current = groups;
  });

  const inFlight = useRef(new Map<string, () => void>()); // localId → abort
  const removed = useRef(new Set<string>()); // localIds removed while still being prepared
  const groupIdPromises = useRef(new Map<string, Promise<string>>());
  const confirmQueue = useRef<string[]>([]);
  const confirming = useRef(false);
  const dirtyOptions = useRef(new Map<string, PhotoOption>()); // photoId → option
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = useCallback((localId: string, p: Partial<Entry>) => {
    setEntries((list) =>
      list.map((e) => (e.localId === localId ? { ...e, ...p } : e)),
    );
  }, []);
  const patchByPhotoId = useCallback((photoId: string, p: Partial<Entry>) => {
    setEntries((list) =>
      list.map((e) => (e.photoId === photoId ? { ...e, ...p } : e)),
    );
  }, []);

  const markDirty = useCallback((photoId: string, option: PhotoOption) => {
    dirtyOptions.current.set(photoId, option);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const items = [...dirtyOptions.current].map(([id, o]) => ({
        photoId: id,
        ...o,
      }));
      dirtyOptions.current.clear();
      if (items.length) void savePhotoOptions({ items }).catch(() => undefined); // re-sent on submit
    }, 1000);
  }, []);

  // ---- Confirm: batch whatever finished while the previous call was running ----
  const flushConfirm = useCallback(async () => {
    if (confirming.current) return;
    confirming.current = true;
    try {
      while (confirmQueue.current.length) {
        const batch = confirmQueue.current.splice(0, 100);
        try {
          const res = await confirmPhotos({ photoIds: batch });
          if (!res.ok) throw new Error(res.error);
          for (const id of res.confirmed)
            patchByPhotoId(id, { status: "uploaded", progress: 1 });
          for (const id of res.failed) {
            patchByPhotoId(id, {
              status: "failed",
              error: "伺服器沒有收到這張照片，請重傳",
            });
          }
        } catch {
          for (const id of batch) {
            patchByPhotoId(id, {
              status: "failed",
              error: "確認上傳時連線失敗，請重傳",
            });
          }
        }
      }
    } finally {
      confirming.current = false;
    }
  }, [patchByPhotoId]);

  // ---- Scheduler: keep up to MAX_CONCURRENT_UPLOADS XHRs running ----
  useEffect(() => {
    const free = MAX_CONCURRENT_UPLOADS - inFlight.current.size;
    if (free <= 0) return;
    const ready = entries
      .filter(
        (e) =>
          e.status === "queued" &&
          e.uploadUrl &&
          e.file &&
          !inFlight.current.has(e.localId),
      )
      .slice(0, free);
    for (const e of ready) {
      const { promise, abort } = putFile(
        e.uploadUrl!,
        e.file!,
        "image/jpeg",
        (f) => patch(e.localId, { progress: f }),
      );
      inFlight.current.set(e.localId, abort);
      patch(e.localId, { status: "uploading", progress: 0, error: undefined });
      promise
        .then(() => {
          patch(e.localId, { status: "confirming", progress: 1 });
          confirmQueue.current.push(e.photoId!);
          void flushConfirm();
        })
        .catch((err: unknown) => {
          const message = err instanceof UploadError ? err.message : "上傳失敗";
          // Removed entries are simply gone from state; patching them is a no-op
          patch(e.localId, { status: "failed", error: message, progress: 0 });
        })
        .finally(() => {
          inFlight.current.delete(e.localId);
          // Wake the scheduler even if no other state changed
          setEntries((list) => [...list]);
        });
    }
  }, [entries, patch, flushConfirm]);

  // Network back: retry everything that failed (URLs stay valid for an hour)
  useEffect(() => {
    const onOnline = () =>
      setEntries((list) =>
        list.map((e) =>
          e.status === "failed" && e.file && e.uploadUrl
            ? { ...e, status: "queued", error: undefined }
            : e,
        ),
      );
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // Keep the screen awake while photos convert/upload: a locked phone pauses both
  const working = entries.some(
    (e) => !["uploaded", "failed", "missing"].includes(e.status),
  );
  useEffect(() => {
    if (!working || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (stopped) void l.release();
          else lock = l;
        })
        .catch(() => undefined); // unsupported in this webview / denied: just skip
    };
    acquire();
    // The browser drops the lock whenever the page is hidden
    document.addEventListener("visibilitychange", acquire);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  }, [working]);

  // ---- Groups ----
  const ensureGroupId = useCallback((key: string): Promise<string> => {
    const group = groupsRef.current.find((g) => g.key === key);
    if (group?.serverId) return Promise.resolve(group.serverId);
    let p = groupIdPromises.current.get(key);
    if (!p) {
      p = createGroup({ printSizeId: group?.printSizeId }).then((res) => {
        if (!res.ok) {
          groupIdPromises.current.delete(key);
          throw new Error(res.error);
        }
        setGroups((gs) =>
          gs.map((g) => (g.key === key ? { ...g, serverId: res.groupId } : g)),
        );
        return res.groupId;
      });
      groupIdPromises.current.set(key, p);
    }
    return p;
  }, []);

  /** Adds an empty group and returns its key. */
  const addGroup = useCallback((printSizeId: number) => {
    const key = newLocalId();
    setGroups((gs) => [...gs, { key, printSizeId }]);
    return key;
  }, []);

  const updateGroupOptions = useCallback(
    async (key: string, change: Pick<Group, "printSizeId">) => {
      setGroups((gs) =>
        gs.map((g) => (g.key === key ? { ...g, ...change } : g)),
      );
      const group = groupsRef.current.find((g) => g.key === key);
      // A group still being created picks up the change via a follow-up update
      const serverId =
        group?.serverId ??
        (await groupIdPromises.current.get(key)?.catch(() => undefined));
      if (serverId) await updateGroup({ groupId: serverId, ...change });
    },
    [],
  );

  const removeGroup = useCallback(async (key: string) => {
    const group = groupsRef.current.find((g) => g.key === key);
    for (const e of entriesRef.current.filter((x) => x.bucket === key)) {
      inFlight.current.get(e.localId)?.();
      removed.current.add(e.localId);
      if (e.file && e.previewUrl) URL.revokeObjectURL(e.previewUrl);
    }
    setGroups((gs) => gs.filter((g) => g.key !== key));
    setEntries((list) => list.filter((e) => e.bucket !== key));
    const serverId =
      group?.serverId ??
      (await groupIdPromises.current.get(key)?.catch(() => undefined));
    if (serverId) await deleteGroup({ groupId: serverId });
  }, []);

  /** Drops every photo and size group, here and in the saved draft. */
  const clearAll = useCallback(async () => {
    for (const e of entriesRef.current) {
      inFlight.current.get(e.localId)?.();
      removed.current.add(e.localId);
      if (e.file && e.previewUrl) URL.revokeObjectURL(e.previewUrl);
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    dirtyOptions.current.clear();
    setEntries([]);
    setNotices([]);
    setGroups([{ key: newLocalId(), printSizeId: defaultSizeId }]);
    // A group still being created would otherwise outlive the clear
    await Promise.allSettled(groupIdPromises.current.values());
    groupIdPromises.current.clear();
    await clearDraft();
  }, [defaultSizeId]);

  // ---- Registering (create pending rows + presigned URLs) ----
  const register = useCallback(
    async (bucket: string, batch: Entry[]) => {
      if (!batch.length) return;
      for (const e of batch)
        patch(e.localId, { status: "registering", error: undefined });
      try {
        const files = batch.map((e) => ({
          fileName: e.fileName,
          size: e.size,
          sha256: e.sha256!,
        }));
        const registeredSetId = batch[0].productId;
        const res =
          bucket === CUSTOM_BUCKET
            ? await registerPhotos({ kind: "custom", files })
            : bucket === ID_PHOTO_BUCKET
              ? await registerPhotos({
                  kind: "id_photo",
                  productId: registeredSetId,
                  files,
                })
              : await registerPhotos({
                  kind: "print",
                  groupId: await ensureGroupId(bucket),
                  files,
                });
        if (!res.ok) throw new Error(res.error);
        res.uploads.forEach((u, i) => {
          const current = entriesRef.current.find(
            (x) => x.localId === batch[i].localId,
          );
          // Removed while registering: drop the server row so it can't block submit
          if (!current) return void deletePhoto({ photoId: u.photoId });
          patch(current.localId, {
            photoId: u.photoId,
            uploadUrl: u.uploadUrl,
            status: "queued",
          });
          // Changed before the row existed: save it now
          const changedSet =
            bucket === ID_PHOTO_BUCKET && current.productId !== registeredSetId;
          if (
            current.quantity !== 1 ||
            current.laminateQuantity !== 0 ||
            current.removeBackground ||
            changedSet
          ) {
            markDirty(u.photoId, {
              quantity: current.quantity,
              laminateQuantity: current.laminateQuantity,
              productId: current.productId,
              removeBackground: current.removeBackground,
            });
          }
        });
      } catch (err) {
        const message =
          err instanceof Error && err.message ? err.message : "連線失敗";
        for (const e of batch)
          patch(e.localId, { status: "failed", error: message });
      }
    },
    [patch, ensureGroupId, markDirty],
  );

  const addFiles = useCallback(
    async (bucket: string, fileList: File[]) => {
      const rejected: string[] = [];
      const accepted: { entry: Entry; format: PhotoFormat }[] = [];
      for (const file of fileList) {
        const problem = checkPhotoFile(file);
        if (problem) {
          rejected.push(`「${file.name}」${problem}`);
          continue;
        }
        const format = await sniffPhoto(file);
        const convert = format !== "jpeg" && format !== "unknown";
        accepted.push({
          format,
          entry: {
            localId: newLocalId(),
            bucket,
            fileName: file.name,
            size: file.size,
            quantity: 1,
            laminateQuantity: 0,
            removeBackground: false,
            status: convert ? "convertQueued" : "hashing",
            progress: 0,
            file,
            // Most browsers can't show HEIC; its preview comes from the converted JPEG
            previewUrl:
              format === "heic" ? undefined : URL.createObjectURL(file),
          },
        });
      }
      setNotices((ns) => [
        ...ns.filter((n) => n.bucket !== bucket),
        ...rejected.map((message) => ({ bucket, message })),
      ]);
      if (!accepted.length) return;
      setEntries((list) => [...list, ...accepted.map((a) => a.entry)]);

      // Each photo goes on to register (and upload) as soon as it's ready, so
      // uploads overlap with converting the rest instead of waiting for all of them
      const toRegister: Entry[] = [];
      let registering = false;
      const flushRegister = async () => {
        if (registering) return;
        registering = true;
        while (toRegister.length) {
          const batch = toRegister
            .splice(0, 100)
            .filter((x) => !removed.current.has(x.localId));
          if (batch.length) await register(bucket, batch);
        }
        registering = false;
      };

      const drop = (e: Entry, error: string) => {
        setNotices((ns) => [
          ...ns,
          { bucket, message: `「${e.fileName}」${error}` },
        ]);
        if (e.previewUrl) URL.revokeObjectURL(e.previewUrl);
        setEntries((list) => list.filter((x) => x.localId !== e.localId));
      };

      const prepare = async ({
        entry: e,
        format,
      }: (typeof accepted)[number]) => {
        let file = e.file!;
        if (format !== "jpeg") {
          const converted = await convertSlot(async () => {
            if (removed.current.has(e.localId)) return null;
            patch(e.localId, { status: "converting" });
            return toJpeg(file, format);
          });
          if (!converted) return;
          if ("error" in converted) return drop(e, converted.error);
          file = converted;
        }
        const sha256 = await hashSlot(() => sha256Hex(file));
        if (removed.current.has(e.localId)) return;

        let ready: Entry = { ...e, sha256 };
        if (file !== e.file) {
          // Converted: upload and preview the JPEG, not the original
          if (e.previewUrl) URL.revokeObjectURL(e.previewUrl);
          ready = {
            ...ready,
            file,
            fileName: file.name,
            size: file.size,
            previewUrl: URL.createObjectURL(file),
          };
        }
        // Same file as one left unfinished before a reload: resume that photo instead of adding a new one
        const missing = entriesRef.current.find(
          (x) =>
            x.bucket === bucket &&
            x.status === "missing" &&
            x.sha256 === ready.sha256 &&
            x.size === ready.size,
        );
        if (missing?.photoId) {
          setEntries((list) =>
            list
              .filter((x) => x.localId !== e.localId)
              .map((x) =>
                x.localId === missing.localId
                  ? {
                      ...x,
                      file: ready.file,
                      previewUrl: ready.previewUrl,
                      status: "registering",
                    }
                  : x,
              ),
          );
          const res = await getUploadUrl({ photoId: missing.photoId }).catch(
            () => null,
          );
          patch(
            missing.localId,
            res?.ok
              ? { uploadUrl: res.uploadUrl, status: "queued" }
              : {
                  status: "failed",
                  error: res && !res.ok ? res.error : "連線失敗",
                },
          );
          return;
        }
        patch(e.localId, {
          sha256: ready.sha256,
          file: ready.file,
          fileName: ready.fileName,
          size: ready.size,
          previewUrl: ready.previewUrl,
        });
        toRegister.push(ready);
        await flushRegister();
      };

      await Promise.all(accepted.map(prepare));
    },
    [patch, register],
  );

  const retry = useCallback(
    async (localId: string) => {
      const e = entriesRef.current.find((x) => x.localId === localId);
      if (!e?.file || e.status !== "failed") return;
      if (!e.photoId) return register(e.bucket, [e]);
      patch(localId, { status: "registering", error: undefined });
      const res = await getUploadUrl({ photoId: e.photoId }).catch(() => null);
      if (res?.ok) {
        patch(localId, { uploadUrl: res.uploadUrl, status: "queued" });
      } else if (res && !res.ok && res.error === "這張照片已上傳完成") {
        patch(localId, { status: "uploaded", progress: 1, error: undefined });
      } else {
        patch(localId, {
          status: "failed",
          error: res && !res.ok ? res.error : "連線失敗，請稍後再試",
        });
      }
    },
    [patch, register],
  );

  const remove = useCallback(async (localId: string) => {
    const e = entriesRef.current.find((x) => x.localId === localId);
    if (!e) return;
    inFlight.current.get(localId)?.();
    removed.current.add(localId);
    if (e.file && e.previewUrl) URL.revokeObjectURL(e.previewUrl);
    setEntries((list) => list.filter((x) => x.localId !== localId));
    if (e.photoId) await deletePhoto({ photoId: e.photoId });
  }, []);

  // ---- Quantities / lamination / ID-photo sets / 去背: saved to the draft in the background (debounced) ----
  const changeEntries = useCallback(
    (localIds: string[], change: Partial<PhotoOption>) => {
      const ids = new Set(localIds);
      // Lamination never exceeds the photo's own print count
      const apply = (e: Entry): PhotoOption => {
        const quantity = change.quantity ?? e.quantity;
        return {
          quantity,
          laminateQuantity: Math.max(
            0,
            Math.min(change.laminateQuantity ?? e.laminateQuantity, quantity),
          ),
          productId: change.productId ?? e.productId,
          removeBackground: change.removeBackground ?? e.removeBackground,
        };
      };
      setEntries((list) =>
        list.map((e) => (ids.has(e.localId) ? { ...e, ...apply(e) } : e)),
      );
      for (const e of entriesRef.current) {
        if (!ids.has(e.localId) || !e.photoId) continue;
        markDirty(e.photoId, apply(e));
      }
    },
    [markDirty],
  );

  const setQuantity = useCallback(
    (localIds: string[], quantity: number) =>
      changeEntries(localIds, { quantity }),
    [changeEntries],
  );
  const setLaminateQuantity = useCallback(
    (localIds: string[], laminateQuantity: number) =>
      changeEntries(localIds, { laminateQuantity }),
    [changeEntries],
  );
  const setIdPhotoSet = useCallback(
    (localIds: string[], productId: number) =>
      changeEntries(localIds, { productId }),
    [changeEntries],
  );

  const setRemoveBackground = useCallback(
    (localIds: string[], removeBackground: boolean) =>
      changeEntries(localIds, { removeBackground }),
    [changeEntries],
  );

  const dismissNotices = useCallback((bucket: string) => {
    setNotices((ns) => ns.filter((n) => n.bucket !== bucket));
  }, []);

  return {
    groups,
    entries,
    notices,
    addGroup,
    updateGroupOptions,
    removeGroup,
    clearAll,
    addFiles,
    retry,
    remove,
    setQuantity,
    setLaminateQuantity,
    setIdPhotoSet,
    setRemoveBackground,
    dismissNotices,
  };
}

export type PhotoUploader = ReturnType<typeof usePhotoUploader>;

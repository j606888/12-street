"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
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
  inspectJpeg,
  mapLimit,
  putFile,
  UploadError,
} from "./upload-utils";

const MAX_CONCURRENT_UPLOADS = 3;
export const CUSTOM_BUCKET = "custom";
export const ID_PHOTO_BUCKET = "id_photo";

export type EntryStatus =
  | "hashing" // reading file + SHA-256 in the browser
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
  laminate: boolean;
};

type PhotoOption = { quantity: number; productId?: number };

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
      status: p.status === "uploaded" ? "uploaded" : "missing",
      progress: p.status === "uploaded" ? 1 : 0,
      previewUrl: p.thumbUrl ?? undefined,
      productId: p.productId ?? undefined,
    });
  const groups = draft.groups.map((g) => ({
    key: g.id,
    serverId: g.id,
    printSizeId: g.printSizeId,
    laminate: g.laminate,
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
  defaultIdPhotoSetId: number | undefined,
) {
  const [initial] = useState(() => {
    const restored = entriesFromDraft(draft);
    if (!restored.groups.length)
      restored.groups.push({
        key: newLocalId(),
        printSizeId: defaultSizeId,
        laminate: false,
      });
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

  // ---- Groups ----
  const ensureGroupId = useCallback((key: string): Promise<string> => {
    const group = groupsRef.current.find((g) => g.key === key);
    if (group?.serverId) return Promise.resolve(group.serverId);
    let p = groupIdPromises.current.get(key);
    if (!p) {
      p = createGroup({
        printSizeId: group?.printSizeId,
        laminate: group?.laminate,
      }).then((res) => {
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

  const addGroup = useCallback((printSizeId: number) => {
    setGroups((gs) => [
      ...gs,
      { key: newLocalId(), printSizeId, laminate: false },
    ]);
  }, []);

  const updateGroupOptions = useCallback(
    async (
      key: string,
      change: Partial<Pick<Group, "printSizeId" | "laminate">>,
    ) => {
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
      if (e.file && e.previewUrl) URL.revokeObjectURL(e.previewUrl);
    }
    setGroups((gs) => gs.filter((g) => g.key !== key));
    setEntries((list) => list.filter((e) => e.bucket !== key));
    const serverId =
      group?.serverId ??
      (await groupIdPromises.current.get(key)?.catch(() => undefined));
    if (serverId) await deleteGroup({ groupId: serverId });
  }, []);

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
        const registeredSetId = batch[0].productId ?? defaultIdPhotoSetId;
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
          if (current.quantity !== 1 || changedSet) {
            markDirty(u.photoId, {
              quantity: current.quantity,
              productId: current.productId,
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
    [patch, ensureGroupId, markDirty, defaultIdPhotoSetId],
  );

  const addFiles = useCallback(
    async (bucket: string, fileList: File[]) => {
      const rejected: string[] = [];
      const accepted: Entry[] = [];
      for (const file of fileList) {
        const problem = checkPhotoFile(file);
        if (problem) {
          rejected.push(`「${file.name}」${problem}`);
          continue;
        }
        accepted.push({
          localId: newLocalId(),
          bucket,
          fileName: file.name,
          size: file.size,
          quantity: 1,
          status: "hashing",
          progress: 0,
          productId:
            bucket === ID_PHOTO_BUCKET ? defaultIdPhotoSetId : undefined,
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }
      setNotices((ns) => [
        ...ns.filter((n) => n.bucket !== bucket),
        ...rejected.map((message) => ({ bucket, message })),
      ]);
      if (!accepted.length) return;
      setEntries((list) => [...list, ...accepted]);

      const inspected = await mapLimit(accepted, 2, async (e) => ({
        e,
        r: await inspectJpeg(e.file!),
      }));
      const toRegister: Entry[] = [];
      for (const { e, r } of inspected) {
        if ("error" in r) {
          setNotices((ns) => [
            ...ns,
            { bucket, message: `「${e.fileName}」${r.error}` },
          ]);
          URL.revokeObjectURL(e.previewUrl!);
          setEntries((list) => list.filter((x) => x.localId !== e.localId));
          continue;
        }
        // Same file as one left unfinished before a reload: resume that photo instead of adding a new one
        const missing = entriesRef.current.find(
          (x) =>
            x.bucket === bucket &&
            x.status === "missing" &&
            x.sha256 === r.sha256 &&
            x.size === e.size,
        );
        if (missing?.photoId) {
          setEntries((list) =>
            list
              .filter((x) => x.localId !== e.localId)
              .map((x) =>
                x.localId === missing.localId
                  ? {
                      ...x,
                      file: e.file,
                      previewUrl: e.previewUrl,
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
          continue;
        }
        const ready = { ...e, sha256: r.sha256 };
        patch(e.localId, { sha256: r.sha256 });
        toRegister.push(ready);
      }
      const remaining = toRegister.filter((e) =>
        entriesRef.current.some((x) => x.localId === e.localId),
      );
      for (let i = 0; i < remaining.length; i += 100) {
        await register(bucket, remaining.slice(i, i + 100));
      }
    },
    [patch, register, defaultIdPhotoSetId],
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
    if (e.file && e.previewUrl) URL.revokeObjectURL(e.previewUrl);
    setEntries((list) => list.filter((x) => x.localId !== localId));
    if (e.photoId) await deletePhoto({ photoId: e.photoId });
  }, []);

  // ---- Quantities / ID-photo sets: saved to the draft in the background (debounced) ----
  const changeEntries = useCallback(
    (localIds: string[], change: Partial<PhotoOption>) => {
      const ids = new Set(localIds);
      setEntries((list) =>
        list.map((e) => (ids.has(e.localId) ? { ...e, ...change } : e)),
      );
      for (const e of entriesRef.current) {
        if (!ids.has(e.localId) || !e.photoId) continue;
        markDirty(e.photoId, {
          quantity: change.quantity ?? e.quantity,
          productId: change.productId ?? e.productId,
        });
      }
    },
    [markDirty],
  );

  const setQuantity = useCallback(
    (localIds: string[], quantity: number) =>
      changeEntries(localIds, { quantity }),
    [changeEntries],
  );
  const setIdPhotoSet = useCallback(
    (localId: string, productId: number) =>
      changeEntries([localId], { productId }),
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
    addFiles,
    retry,
    remove,
    setQuantity,
    setIdPhotoSet,
    dismissNotices,
  };
}

export type PhotoUploader = ReturnType<typeof usePhotoUploader>;

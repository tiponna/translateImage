const DRIVE = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const APP = "phap-plae";
const NONE_ID = "none";
const NONE_NAME = "ยังไม่จัด";

const IMAGE_FIELDS = ["originalId", "overlayId", "originalThumbId", "overlayThumbId"];

export async function listLibrary(token) {
  const library = await ensureLibrary(token);
  const pages = [];
  for (const category of library.categories) {
    const index = await loadIndex(token, category.folderId);
    for (const page of index.pages) {
      pages.push(toSummary(page, category.id));
    }
  }
  pages.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
  return { categories: publicCategories(library.categories), pages, folder: folderLabel() };
}

export async function readPage(token, pageId) {
  const library = await ensureLibrary(token);
  const found = await findPage(token, library, pageId);
  if (!found) {
    const error = new Error("ไม่พบหน้านี้ใน Drive");
    error.status = 404;
    throw error;
  }
  return toDetail(found.page, found.category.id);
}

export async function savePage(token, { meta, files }) {
  const library = await ensureLibrary(token);
  const target = categoryById(library, meta.categoryId) || categoryById(library, NONE_ID);
  const found = meta.id ? await findPage(token, library, meta.id) : null;
  const previous = found?.page;
  const fileIds = {
    originalId: previous?.originalId || "",
    overlayId: previous?.overlayId || "",
    originalThumbId: previous?.originalThumbId || "",
    overlayThumbId: previous?.overlayThumbId || "",
  };

  if (found && found.category.id !== target.id) {
    for (const key of IMAGE_FIELDS) {
      if (fileIds[key]) await moveFile(token, fileIds[key], found.category.folderId, target.folderId);
    }
  }

  fileIds.originalId = await putImage(token, {
    fileId: fileIds.originalId,
    bytes: files.original,
    folderId: target.folderId,
    name: `${meta.id}-original.jpg`,
    pageId: meta.id,
  });
  fileIds.overlayId = await putImage(token, {
    fileId: fileIds.overlayId,
    bytes: files.overlay,
    folderId: target.folderId,
    name: `${meta.id}-overlay.jpg`,
    pageId: meta.id,
  });
  fileIds.originalThumbId = await putImage(token, {
    fileId: fileIds.originalThumbId,
    bytes: files.originalThumb,
    folderId: target.folderId,
    name: `${meta.id}-original-thumb.jpg`,
    pageId: meta.id,
  });
  fileIds.overlayThumbId = await putImage(token, {
    fileId: fileIds.overlayThumbId,
    bytes: files.overlayThumb,
    folderId: target.folderId,
    name: `${meta.id}-overlay-thumb.jpg`,
    pageId: meta.id,
  });

  const page = {
    id: meta.id,
    categoryId: target.id,
    fileName: String(meta.fileName || "").slice(0, 180),
    sourceLanguage: meta.sourceLanguage || "",
    engine: meta.engine || "",
    createdAt: Number(meta.createdAt) || Date.now(),
    result: meta.result || null,
    ...fileIds,
  };

  if (found && found.category.id !== target.id) {
    const oldIndex = await loadIndex(token, found.category.folderId);
    await storeIndex(
      token,
      found.category.folderId,
      oldIndex.fileId,
      oldIndex.pages.filter((item) => item.id !== page.id),
    );
  }

  const index = await loadIndex(token, target.folderId);
  const pages = index.pages.filter((item) => item.id !== page.id);
  pages.unshift(page);
  await storeIndex(token, target.folderId, index.fileId, pages);
  return listLibrary(token);
}

export async function movePage(token, pageId, categoryId) {
  const library = await ensureLibrary(token);
  const found = await findPage(token, library, pageId);
  if (!found) {
    const error = new Error("ไม่พบหน้านี้ใน Drive");
    error.status = 404;
    throw error;
  }
  const target = categoryById(library, categoryId) || categoryById(library, NONE_ID);
  if (found.category.id === target.id) return listLibrary(token);

  for (const key of IMAGE_FIELDS) {
    if (found.page[key]) await moveFile(token, found.page[key], found.category.folderId, target.folderId);
  }

  const oldIndex = await loadIndex(token, found.category.folderId);
  await storeIndex(
    token,
    found.category.folderId,
    oldIndex.fileId,
    oldIndex.pages.filter((item) => item.id !== pageId),
  );
  const nextIndex = await loadIndex(token, target.folderId);
  const page = { ...found.page, categoryId: target.id };
  const pages = nextIndex.pages.filter((item) => item.id !== pageId);
  pages.unshift(page);
  await storeIndex(token, target.folderId, nextIndex.fileId, pages);
  return listLibrary(token);
}

export async function deletePage(token, pageId) {
  const library = await ensureLibrary(token);
  const found = await findPage(token, library, pageId);
  if (!found) return listLibrary(token);
  for (const key of IMAGE_FIELDS) {
    if (found.page[key]) await trashFile(token, found.page[key]);
  }
  const index = await loadIndex(token, found.category.folderId);
  await storeIndex(
    token,
    found.category.folderId,
    index.fileId,
    index.pages.filter((item) => item.id !== pageId),
  );
  return listLibrary(token);
}

export async function deleteAllPages(token) {
  const library = await ensureLibrary(token);
  for (const category of library.categories) {
    const index = await loadIndex(token, category.folderId);
    for (const page of index.pages) {
      for (const key of IMAGE_FIELDS) {
        if (page[key]) await trashFile(token, page[key]);
      }
    }
    await storeIndex(token, category.folderId, index.fileId, []);
  }
  return listLibrary(token);
}

export async function createCategory(token, name) {
  const cleaned = cleanName(name);
  if (!cleaned) {
    const error = new Error("ใส่ชื่อหมวดก่อน");
    error.status = 400;
    throw error;
  }
  const library = await ensureLibrary(token);
  if (library.categories.some((category) => category.name === cleaned)) {
    const error = new Error("มีหมวดชื่อนี้อยู่แล้ว");
    error.status = 400;
    throw error;
  }
  const id = crypto.randomUUID();
  const folder = await createFolder(token, cleaned, library.rootId, {
    app: APP,
    role: "category",
    categoryId: id,
  });
  await storeIndex(token, folder.id, "", []);
  const created = { id, name: cleaned, folderId: folder.id };
  return {
    category: { id, name: cleaned },
    categories: publicCategories([...library.categories, created]),
  };
}

export async function deleteCategory(token, categoryId) {
  if (!categoryId || categoryId === NONE_ID) {
    const error = new Error("หมวดยังไม่จัดลบไม่ได้");
    error.status = 400;
    throw error;
  }
  const library = await ensureLibrary(token);
  const category = categoryById(library, categoryId);
  if (!category) return listLibrary(token);
  const index = await loadIndex(token, category.folderId);
  for (const page of index.pages) {
    await movePage(token, page.id, NONE_ID);
  }
  await trashFile(token, category.folderId);
  return listLibrary(token);
}

export async function readAppFile(token, fileId) {
  const meta = await driveJson(
    token,
    `${DRIVE}/${encodeURIComponent(fileId)}?fields=id,mimeType,trashed,appProperties`,
  );
  if (meta.trashed || meta.appProperties?.app !== APP) {
    const error = new Error("ไม่พบไฟล์");
    error.status = 404;
    throw error;
  }
  const response = await fetch(`${DRIVE}/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const error = new Error("โหลดรูปจาก Drive ไม่สำเร็จ");
    error.status = 502;
    throw error;
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { bytes, mime: meta.mimeType || "application/octet-stream" };
}

async function assertDriveScope(token) {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`,
  );
  const data = await response.json().catch(() => ({}));
  const scopes = String(data.scope || "").split(/\s+/);
  if (scopes.includes("https://www.googleapis.com/auth/drive")) return;
  const error = new Error(
    "เลิกเชื่อม แล้วกดเชื่อม Google Drive ใหม่ หลังเพิ่มสิทธิ์ดูทั้งไดรฟ์ในหน้า Data Access",
  );
  error.status = 403;
  throw error;
}

function folderLabel() {
  return driveFolderPath().join("/");
}

function driveFolderPath() {
  const raw = process.env.DRIVE_FOLDER || "traslateManga/image";
  const parts = raw.split("/").map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts : ["traslateManga", "image"];
}

async function ensureLibrary(token) {
  await assertDriveScope(token);
  const root = await findOrCreatePath(token, driveFolderPath());
  if (root.appProperties?.app !== APP || root.appProperties?.role !== "root") {
    await driveJson(token, `${DRIVE}/${encodeURIComponent(root.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ appProperties: { app: APP, role: "root" } }),
    });
  }
  const folders = await queryFiles(
    token,
    `'${root.id}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='role' and value='category' }`,
  );
  const categories = folders
    .map((folder) => ({
      id: folder.appProperties?.categoryId || "",
      name: folder.name || "ไม่มีชื่อ",
      folderId: folder.id,
    }))
    .filter((category) => category.id);
  if (!categories.some((category) => category.id === NONE_ID)) {
    const folder = await createFolder(token, NONE_NAME, root.id, {
      app: APP,
      role: "category",
      categoryId: NONE_ID,
    });
    categories.unshift({ id: NONE_ID, name: NONE_NAME, folderId: folder.id });
  }
  return { rootId: root.id, categories };
}

async function findPage(token, library, pageId) {
  for (const category of library.categories) {
    const index = await loadIndex(token, category.folderId);
    const page = index.pages.find((item) => item.id === pageId);
    if (page) return { category, page };
  }
  return null;
}

async function loadIndex(token, folderId) {
  const files = await queryFiles(
    token,
    `'${folderId}' in parents and trashed = false and name = 'index.json'`,
  );
  if (!files.length) return { fileId: "", pages: [] };
  const response = await fetch(`${DRIVE}/${files[0].id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return { fileId: files[0].id, pages: [] };
  const json = await response.json().catch(() => ({}));
  return { fileId: files[0].id, pages: Array.isArray(json.pages) ? json.pages : [] };
}

async function storeIndex(token, folderId, fileId, pages) {
  const bytes = new TextEncoder().encode(JSON.stringify({ pages }));
  if (fileId) {
    await uploadMedia(token, fileId, bytes, "application/json");
    return fileId;
  }
  const created = await uploadMultipart(token, {
    metadata: {
      name: "index.json",
      parents: [folderId],
      mimeType: "application/json",
      appProperties: { app: APP, role: "index" },
    },
    bytes,
    mime: "application/json",
  });
  return created.id;
}

async function putImage(token, { fileId, bytes, folderId, name, pageId }) {
  if (!bytes?.byteLength) return fileId || "";
  if (fileId) {
    await uploadMedia(token, fileId, bytes, "image/jpeg");
    return fileId;
  }
  const created = await uploadMultipart(token, {
    metadata: {
      name,
      parents: [folderId],
      mimeType: "image/jpeg",
      appProperties: { app: APP, role: "image", pageId },
    },
    bytes,
    mime: "image/jpeg",
  });
  return created.id;
}

async function findOrCreatePath(token, parts) {
  let parentId = "root";
  let current = null;
  for (const name of parts) {
    const q = [
      `name = '${escapeQuery(name)}'`,
      "mimeType = 'application/vnd.google-apps.folder'",
      "trashed = false",
      `'${parentId}' in parents`,
    ].join(" and ");
    const found = await queryFiles(token, q);
    current = found[0] || (await createFolder(token, name, parentId, { app: APP, role: "path" }));
    parentId = current.id;
  }
  if (!current) {
    const error = new Error("ยังไม่ได้กำหนดโฟลเดอร์ใน Drive");
    error.status = 500;
    throw error;
  }
  return current;
}

function escapeQuery(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function createFolder(token, name, parentId, appProperties) {
  return driveJson(token, DRIVE, {
    method: "POST",
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      ...(parentId ? { parents: [parentId] } : {}),
      appProperties,
    }),
  });
}

async function moveFile(token, fileId, fromId, toId) {
  const url = `${DRIVE}/${encodeURIComponent(fileId)}?addParents=${encodeURIComponent(toId)}&removeParents=${encodeURIComponent(fromId)}`;
  await driveJson(token, url, { method: "PATCH", body: JSON.stringify({}) });
}

async function trashFile(token, fileId) {
  const response = await fetch(`${DRIVE}/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok && response.status !== 404) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || "ลบไฟล์ใน Drive ไม่สำเร็จ");
  }
}

async function queryFiles(token, q) {
  const url = `${DRIVE}?q=${encodeURIComponent(q)}&fields=files(id,name,appProperties)&pageSize=200&spaces=drive`;
  const data = await driveJson(token, url);
  return data.files || [];
}

async function driveJson(token, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const raw = data.error?.message || "เรียก Google Drive ไม่สำเร็จ";
    const denied = response.status === 403 || response.status === 404;
    const error = new Error(
      denied
        ? "สิทธิ์เดิมเห็นแค่ไฟล์ที่แอปสร้าง เลิกเชื่อม แล้วกดเชื่อม Google Drive ใหม่อีกครั้ง"
        : raw,
    );
    error.status = denied ? 403 : response.status;
    throw error;
  }
  return data;
}

async function uploadMedia(token, fileId, bytes, mime) {
  const response = await fetch(`${UPLOAD}/${encodeURIComponent(fileId)}?uploadType=media`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": mime,
    },
    body: bytes,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || "อัปโหลดไฟล์ไม่สำเร็จ");
  }
}

async function uploadMultipart(token, { metadata, bytes, mime }) {
  const boundary = `phap_${crypto.randomUUID().replace(/-/g, "")}`;
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const encoder = new TextEncoder();
  const headBytes = encoder.encode(head);
  const tailBytes = encoder.encode(tail);
  const body = new Uint8Array(headBytes.length + bytes.length + tailBytes.length);
  body.set(headBytes, 0);
  body.set(bytes, headBytes.length);
  body.set(tailBytes, headBytes.length + bytes.length);
  const response = await fetch(`${UPLOAD}?uploadType=multipart`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "อัปโหลดไฟล์ไม่สำเร็จ");
  return data;
}

function categoryById(library, categoryId) {
  return library.categories.find((category) => category.id === (categoryId || NONE_ID)) || null;
}

function publicCategories(categories) {
  return [...categories]
    .sort((a, b) => {
      if (a.id === NONE_ID) return -1;
      if (b.id === NONE_ID) return 1;
      return a.name.localeCompare(b.name, "th");
    })
    .map((category) => ({ id: category.id, name: category.name }));
}

function fileUrl(fileId) {
  return fileId ? `/api/library/file?id=${encodeURIComponent(fileId)}` : "";
}

function toSummary(page, categoryId) {
  return {
    id: page.id,
    categoryId: categoryId || page.categoryId || NONE_ID,
    fileName: page.fileName || "",
    sourceLanguage: page.sourceLanguage || "",
    engine: page.engine || "",
    createdAt: page.createdAt || Date.now(),
    blockCount: Array.isArray(page.result?.blocks) ? page.result.blocks.length : 0,
    originalThumb: fileUrl(page.originalThumbId),
    overlayThumb: fileUrl(page.overlayThumbId),
  };
}

function toDetail(page, categoryId) {
  return {
    ...toSummary(page, categoryId),
    result: page.result || null,
    original: fileUrl(page.originalId),
    overlay: fileUrl(page.overlayId),
  };
}

function cleanName(name) {
  return String(name || "").replace(/\s+/g, " ").trim().slice(0, 80);
}

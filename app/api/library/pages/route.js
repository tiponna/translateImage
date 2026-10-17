import { NextResponse } from "next/server";
import { deleteAllPages, deletePage, movePage, readPage, savePage } from "@/lib/drive-library";
import { driveError, requireAccessToken } from "@/lib/drive-session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  try {
    const pageId = new URL(request.url).searchParams.get("id") || "";
    if (!pageId) return NextResponse.json({ error: "ไม่พบหน้า" }, { status: 400 });
    const token = await requireAccessToken(request);
    return NextResponse.json({ page: await readPage(token, pageId) });
  } catch (error) {
    return driveError(error);
  }
}

export async function POST(request) {
  try {
    const form = await request.formData();
    const meta = JSON.parse(String(form.get("meta") || "{}"));
    if (!meta.id) return NextResponse.json({ error: "ไม่มีรหัสหน้า" }, { status: 400 });
    const token = await requireAccessToken(request);
    const saved = await savePage(token, {
      meta: {
        id: String(meta.id),
        categoryId: meta.categoryId || "none",
        fileName: meta.fileName || "",
        sourceLanguage: meta.sourceLanguage || "",
        engine: meta.engine || "",
        createdAt: meta.createdAt || Date.now(),
        result: slimResult(meta.result),
      },
      files: {
        original: await fileBytes(form.get("original")),
        overlay: await fileBytes(form.get("overlay")),
        originalThumb: await fileBytes(form.get("originalThumb")),
        overlayThumb: await fileBytes(form.get("overlayThumb")),
      },
    });
    return NextResponse.json(saved);
  } catch (error) {
    return driveError(error);
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => ({}));
    if (!body.id) return NextResponse.json({ error: "ไม่มีรหัสหน้า" }, { status: 400 });
    const token = await requireAccessToken(request);
    return NextResponse.json(await movePage(token, String(body.id), body.categoryId || "none"));
  } catch (error) {
    return driveError(error);
  }
}

export async function DELETE(request) {
  try {
    const url = new URL(request.url);
    const token = await requireAccessToken(request);
    if (url.searchParams.get("all") === "1") return NextResponse.json(await deleteAllPages(token));
    const pageId = url.searchParams.get("id") || "";
    if (!pageId) return NextResponse.json({ error: "ไม่มีรหัสหน้า" }, { status: 400 });
    return NextResponse.json(await deletePage(token, pageId));
  } catch (error) {
    return driveError(error);
  }
}

async function fileBytes(value) {
  if (!value || typeof value === "string" || typeof value.arrayBuffer !== "function" || !value.size) {
    return null;
  }
  return new Uint8Array(await value.arrayBuffer());
}

function slimResult(result) {
  if (!result || typeof result !== "object") return null;
  const copy = { ...result };
  delete copy.image;
  delete copy.original;
  delete copy.overlay;
  return copy;
}

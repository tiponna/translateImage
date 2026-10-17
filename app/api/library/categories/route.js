import { NextResponse } from "next/server";
import { createCategory, deleteCategory } from "@/lib/drive-library";
import { driveError, requireAccessToken } from "@/lib/drive-session";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = await requireAccessToken(request);
    return NextResponse.json(await createCategory(token, body.name));
  } catch (error) {
    return driveError(error);
  }
}

export async function DELETE(request) {
  try {
    const categoryId = new URL(request.url).searchParams.get("id") || "";
    const token = await requireAccessToken(request);
    return NextResponse.json(await deleteCategory(token, categoryId));
  } catch (error) {
    return driveError(error);
  }
}

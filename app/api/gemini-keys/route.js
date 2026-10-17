import { NextResponse } from "next/server";
import { geminiSlotStatus } from "@/lib/gemini-key";

export async function GET() {
  return NextResponse.json(geminiSlotStatus());
}

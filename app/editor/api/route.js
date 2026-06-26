import { NextResponse } from "next/server";
import {
  readEditorDataFile,
  saveEditorDataFile,
  storeEditorCoinsGlobally,
} from "../editorData";

export const dynamic = "force-dynamic";

function errorResponse(e) {
  return NextResponse.json({ error: e.message || "Editor error" }, { status: 400 });
}

export async function GET(request) {
  try {
    const file = request.nextUrl.searchParams.get("file") || "";
    return NextResponse.json(await readEditorDataFile(file));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(request) {
  try {
    const { action, file, content } = await request.json();
    if (action == "storeGlobalCoins") {
      return NextResponse.json(await storeEditorCoinsGlobally(file, content));
    }
    return NextResponse.json(await saveEditorDataFile(file, content));
  } catch (e) {
    return errorResponse(e);
  }
}

import { NextResponse } from "next/server";
import {
  addCustomNavLink,
  deleteCustomNavLink,
  readCustomNavLinks,
} from "../../customNavData";
import {
  projectFileWriteMsg,
  projectFileWritesDisabled,
} from "@/app/_editorData/projectFileWrites";

export const dynamic = "force-dynamic";

function errorResponse(error, status = 400) {
  return NextResponse.json(
    { error: error?.message || "Custom navbar error" },
    { status },
  );
}

export async function GET(request) {
  if (projectFileWritesDisabled()) {
    return NextResponse.json({ available: false, links: [] });
  }

  try {
    const scope = request.nextUrl.searchParams.get("scope") || "";
    return NextResponse.json({
      available: true,
      links: await readCustomNavLinks(scope),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  if (projectFileWritesDisabled()) {
    return errorResponse(new Error(projectFileWriteMsg), 403);
  }

  try {
    const { scope, parentId, href, label } = await request.json();
    return NextResponse.json({
      available: true,
      links: await addCustomNavLink({ scope, parentId, href, label }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request) {
  if (projectFileWritesDisabled()) {
    return errorResponse(new Error(projectFileWriteMsg), 403);
  }

  try {
    const scope = request.nextUrl.searchParams.get("scope") || "";
    const linkId = request.nextUrl.searchParams.get("linkId") || "";
    return NextResponse.json({
      available: true,
      links: await deleteCustomNavLink({ scope, linkId }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

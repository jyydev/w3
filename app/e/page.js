import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getEditorFileHref } from "@/components/editorNavigation";
import EditorIndex from "./EditorIndex";
import { listEditorDataFiles } from "./editorData";
import {
  editorHomeFavsCookie,
  editorHomeOrderCookie,
  editorHistoryCookie,
  parseEditorFavs,
  parseEditorHistory,
  parseEditorOrder,
} from "./editorNavigationState";

export const dynamic = "force-dynamic";

async function App({ searchParams }) {
  const params = await searchParams;
  const requestedFile = Array.isArray(params?.file)
    ? params.file[0]
    : params?.file;

  if (requestedFile) {
    let requestedHref = "";
    try {
      requestedHref = getEditorFileHref(requestedFile);
    } catch {}
    if (requestedHref) redirect(requestedHref);
  }

  const [files, cookieStore] = await Promise.all([
    listEditorDataFiles(),
    cookies(),
  ]);

  return (
    <EditorIndex
      initialFiles={files}
      initialHistory={parseEditorHistory(
        cookieStore.get(editorHistoryCookie)?.value,
      )}
      initialFavoriteFiles={parseEditorFavs(
        cookieStore.get(editorHomeFavsCookie)?.value,
      )}
      initialOrder={parseEditorOrder(
        cookieStore.get(editorHomeOrderCookie)?.value,
      )}
    />
  );
}

export default App;

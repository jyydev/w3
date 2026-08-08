import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getEditorFileHref } from "@/components/editorNavigation";
import { getNavigationTrees } from "@/components/navigationTreeServer";
import EditorIndex from "./EditorIndex";
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

  const [
    { editorFiles, editorEmptyFolders },
    cookieStore,
  ] = await Promise.all([getNavigationTrees(), cookies()]);

  return (
    <EditorIndex
      initialEmptyFolders={editorEmptyFolders}
      initialFiles={editorFiles}
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

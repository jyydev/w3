import { redirect } from "next/navigation";
import { getExtensionlessEditorFileHref } from "@/components/editorNavigation";
import EditorPage from "../EditorPage";

export const dynamic = "force-dynamic";

async function App({ params }) {
  const routeParams = await params;
  const requestedFile = Array.isArray(routeParams?.file)
    ? routeParams.file.join("/")
    : routeParams?.file;
  const canonicalHref = getExtensionlessEditorFileHref(requestedFile);

  if (canonicalHref) redirect(canonicalHref);

  return <EditorPage requestedFile={requestedFile} />;
}

export default App;

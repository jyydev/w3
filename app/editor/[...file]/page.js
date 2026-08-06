import EditorPage from "../EditorPage";

export const dynamic = "force-dynamic";

async function App({ params }) {
  const routeParams = await params;
  const requestedFile = Array.isArray(routeParams?.file)
    ? routeParams.file.join("/")
    : routeParams?.file;

  return <EditorPage requestedFile={requestedFile} />;
}

export default App;

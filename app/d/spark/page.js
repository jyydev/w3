import Logo from "@/components/Logo";
import { loadSparkView } from "@/app/_shared/spark/view";
import Client from "./Client";

export const dynamic = "force-dynamic";

export default async function SparkPage({ searchParams }) {
  const params = await searchParams;
  const view = await loadSparkView(params?.chains);

  return (
    <div>
      <Logo page="home" />
      <Client {...view} />
    </div>
  );
}

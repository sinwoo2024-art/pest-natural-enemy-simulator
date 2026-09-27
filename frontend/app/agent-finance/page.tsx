import FinancePanel from "./panel";

export default async function AgentFinancePage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const label = (key: string) => typeof params[key] === "string" ? params[key].slice(0, 120) : "";
  return <FinancePanel context={{ crop: label("crop"), pest: label("pest"), region: label("region") }} />;
}

import { loadServers } from "@/lib/admin/vps-data";
import { ServersView } from "@/components/console/views/ServersView";

export const dynamic = "force-dynamic";
export const metadata = { title: "Servers" };

export default async function ServersPage() {
  return <ServersView d={await loadServers()} />;
}

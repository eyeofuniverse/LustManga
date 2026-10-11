import "server-only";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin/auth";

/**
 * Every console page reads its data through a loader, and every loader calls this first.
 *
 * The panel layout also checks the session, but a layout is NOT run again when the browser navigates inside the app: the
 * request names only the page. And the edge middleware can only see that a session cookie exists, not that it is valid
 * (it has no database). So a request carrying any cookie value and a crafted router header could read a page's data without
 * the layout ever running. Checking here, next to the data, closes that for every way a page can be requested.
 */
export async function guardConsole() {
  const me = await getAdminSession();
  if (!me) redirect("/console/login");
  return me;
}

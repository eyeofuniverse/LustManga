import type { Metadata } from "next";
import { FollowingFeed } from "@/components/work/FollowingFeed";

export const metadata: Metadata = { title: "Following", robots: { index: false } };

export default function Page() {
  return <FollowingFeed />;
}

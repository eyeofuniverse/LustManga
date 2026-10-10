"use server";

import type { SafetyTier, TagType } from "@prisma/client";
import { addTerm, createTag, deleteTag, mergeTags, renameTag, setTagFlag } from "@/lib/admin/actions";

/** FormData adapters for the Tags & safety forms: the console's ActionForm submits a FormData, the real actions take values. */

export async function addTermAction(fd: FormData) {
  return addTerm(String(fd.get("tier")) as SafetyTier, String(fd.get("term") ?? ""));
}
export async function createTagAction(fd: FormData) {
  return createTag(String(fd.get("type")) as TagType, String(fd.get("name") ?? ""));
}
export async function renameAction(fd: FormData) {
  return renameTag(Number(fd.get("id")), String(fd.get("name") ?? ""));
}
export async function mergeAction(fd: FormData) {
  return mergeTags(Number(fd.get("id")), String(fd.get("into") ?? ""));
}
export async function flagAction(fd: FormData) {
  return setTagFlag(Number(fd.get("id")), String(fd.get("flag")) as "hidden" | "featured", fd.get("value") === "true");
}
export async function deleteAction(fd: FormData) {
  return deleteTag(Number(fd.get("id")));
}

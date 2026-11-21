"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { verifyToken } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function setDomainHidden(formData: FormData): Promise<void> {
  const token = (await cookies()).get("auth_token")?.value
  const payload = token ? await verifyToken(token) : null
  if (!payload || payload.role !== "super_admin") throw new Error("Unauthorized")

  const id = formData.get("id")
  if (typeof id !== "string" || !id) return

  await prisma.newDomainRegistration.updateMany({
    where: { id },
    data: { hidden: formData.get("hidden") === "1" },
  })
  revalidatePath("/directory/new-domains")
}

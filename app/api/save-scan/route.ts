import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

const FORM_NAME = "hairscan-lp leads"

type TelecrmResult = {
  status: "synced" | "failed" | "skipped"
  leadIds?: string
  response?: string
}

function getLiveUrl(req: NextRequest, explicitUrl?: unknown) {
  if (typeof explicitUrl === "string" && explicitUrl.trim()) {
    return explicitUrl.trim()
  }

  const referer = req.headers.get("referer")
  if (referer) return referer

  const origin = req.headers.get("origin")
  if (origin) return origin

  const forwardedHost = req.headers.get("x-forwarded-host")
  const host = forwardedHost || req.headers.get("host")
  if (host) {
    const forwardedProto = req.headers.get("x-forwarded-proto") || "https"
    return `${forwardedProto}://${host}`
  }

  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`

  return ""
}

function toShortJson(value: unknown) {
  try {
    return JSON.stringify(value).slice(0, 4000)
  } catch {
    return String(value).slice(0, 4000)
  }
}

async function syncTelecrmLead(input: {
  name: string
  phone: string
  location: string
  problem: string
  sourceUrl: string
}): Promise<TelecrmResult> {
  const apiUrl = process.env.TELECRM_API_URL
  const apiKey = process.env.TELECRM_API_KEY

  if (!apiUrl || !apiKey) {
    return { status: "skipped", response: "TeleCRM API URL or API key is not configured." }
  }

  const formNameField = process.env.TELECRM_FORM_NAME_FIELD || "form_name"
  const liveUrlField = process.env.TELECRM_LIVE_URL_FIELD || "live_url"

  const fields: Record<string, string> = {
    phone: input.phone,
    name: input.name,
    location: input.location,
    problem: input.problem,
    [formNameField]: FORM_NAME,
    [liveUrlField]: input.sourceUrl,
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ fields }),
  })

  const payload = await response.json().catch(async () => ({ text: await response.text().catch(() => "") }))
  const responseText = toShortJson(payload)
  const telecrmStatus = typeof payload?.status === "string" ? payload.status.toLowerCase() : ""
  const isSuccess = response.ok && telecrmStatus !== "error"
  const modifiedLeadIds = Array.isArray(payload?.modifiedLeadIds) ? payload.modifiedLeadIds.join(", ") : ""

  return {
    status: isSuccess ? "synced" : "failed",
    leadIds: modifiedLeadIds,
    response: responseText,
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, phone, location, problem, imageData, sourceUrl } = await req.json()

    if (!name || !phone || !problem || !imageData) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const normalizedPhone = String(phone).trim()
    const normalizedName = String(name).trim()
    const normalizedLocation = location ? String(location).trim() : ""
    const normalizedProblem = String(problem).trim()
    const liveUrl = getLiveUrl(req, sourceUrl)

    const existing = await prisma.scan.findFirst({
      where: { phone: normalizedPhone },
      select: { id: true },
    })

    if (existing) {
      return NextResponse.json(
        { error: "This mobile number has already been used to submit a lead." },
        { status: 409 },
      )
    }

    const scan = await prisma.scan.create({
      data: {
        name: normalizedName,
        phone: normalizedPhone,
        location: normalizedLocation,
        problem: normalizedProblem,
        imageData,
        sourceUrl: liveUrl,
        formName: FORM_NAME,
      },
    })

    const telecrmResult = await syncTelecrmLead({
      name: normalizedName,
      phone: normalizedPhone,
      location: normalizedLocation,
      problem: normalizedProblem,
      sourceUrl: liveUrl,
    }).catch((error) => ({
      status: "failed" as const,
      response: error instanceof Error ? error.message : "TeleCRM sync failed",
    }))

    await prisma.scan.update({
      where: { id: scan.id },
      data: {
        telecrmStatus: telecrmResult.status,
        telecrmLeadIds: telecrmResult.leadIds ?? "",
        telecrmResponse: telecrmResult.response ?? "",
        telecrmSyncedAt: telecrmResult.status === "synced" ? new Date() : null,
      },
    })

    return NextResponse.json({ success: true, id: scan.id, telecrmStatus: telecrmResult.status })
  } catch (error) {
    console.error("Failed to save scan:", error)
    const message =
      error instanceof Error && process.env.NODE_ENV !== "production"
        ? `Failed to save scan: ${error.message}`
        : "Failed to save scan"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { saveAccount } from "@/lib/connectionStore";
import {
  extractDevinCookieHeader,
  extractDevinProfileAuth,
  listChromeProfiles,
} from "@/lib/extractCookies";

const BodySchema = z
  .object({
    profiles: z.array(z.string().trim().min(1)).optional(),
  })
  .strict();

export async function POST(request: Request) {
  let parsed: z.infer<typeof BodySchema> = {};
  try {
    const text = await request.text();
    if (text) {
      const raw = JSON.parse(text);
      const result = BodySchema.safeParse(raw);
      if (!result.success) {
        return NextResponse.json(
          { ok: false, error: `Invalid body: ${result.error.message}` },
          { status: 400 },
        );
      }
      parsed = result.data;
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const allProfiles = listChromeProfiles();
  const targetProfiles =
    parsed.profiles && parsed.profiles.length > 0
      ? allProfiles.filter((profile) =>
          parsed.profiles?.includes(profile.profileDirName),
        )
      : allProfiles;

  if (targetProfiles.length === 0) {
    return NextResponse.json(
      { ok: false, error: "No Chrome profiles with Cookies DB found" },
      { status: 404 },
    );
  }

  const imported: Array<{
    id: string;
    name: string;
    profile: string;
    orgId: string;
  }> = [];
  const skipped: Array<{ profile: string; reason: string }> = [];

  for (const profile of targetProfiles) {
    try {
      const cookie = await extractDevinCookieHeader({
        sourceProfile: profile.profilePath,
      });
      const auth = extractDevinProfileAuth(profile.profilePath);
      const creds = {
        cookie: cookie.cookieHeader,
        bearer: auth.bearer,
        orgId: auth.orgId,
      };

      const name = profile.userName || profile.displayName;
      const result = await saveAccount({
        name,
        creds,
        providerSpecificData: {
          devinDashboard: {
            launchStrategy: "chrome-profile",
            chromeUserDataDir: profile.userDataRoot,
            chromeProfileDirectory: profile.profileDirName,
            profileName: profile.displayName,
            source: "chrome-import",
          },
        },
      });

      imported.push({
        id: result.id,
        name,
        profile: profile.profileDirName,
        orgId: creds.orgId,
      });
    } catch (error) {
      skipped.push({
        profile: profile.profileDirName,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    imported,
    skipped,
    scannedProfiles: targetProfiles.map((profile) => ({
      profile: profile.profileDirName,
      displayName: profile.displayName,
      userName: profile.userName,
    })),
  });
}

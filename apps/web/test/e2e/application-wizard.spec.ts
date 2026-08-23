import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/admissions/public/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let data: unknown = [];

    if (path.endsWith("/photo/pre-submit/presign")) {
      data = {
        key: "admissions/test-photo.png",
        url: "/test-photo-upload",
        method: "POST",
        fields: {},
        maxSizeBytes: 2 * 1024 * 1024,
      };
    } else if (path.endsWith("/photo/pre-submit/complete")) {
      data = { proof: "verified-test-photo-proof" };
    } else if (path.endsWith("/cycles")) {
      data = [
        {
          id: "cycle-1",
          academicYear: "2026/2027",
          cycleName: "Undergraduate admission",
          admissionType: "UTME",
          openDate: "2026-01-01T00:00:00.000Z",
          closeDate: "2026-12-31T23:59:59.000Z",
          utmeMinScore: 160,
          applicationFeeRequired: false,
          applicationFeeAmount: null,
          applicationFeeCurrency: "NGN",
        },
      ];
    } else if (path.endsWith("/programmes")) {
      data = [
        {
          id: "programme-1",
          name: "Computer Science",
          code: "CSC",
          degreeType: "BSc",
          durationYears: 4,
          department: {
            name: "Computing",
            faculty: { name: "Science" },
          },
        },
      ];
    } else if (path.endsWith("/reference/countries")) {
      data = [
        { id: "country-ng", name: "Nigeria", iso2: "NG", iso3: "NGA" },
      ];
    } else if (path.endsWith("/reference/examination-authorities")) {
      data = [{ id: "authority-waec", code: "WAEC", name: "West African Examinations Council" }];
    } else if (path.endsWith("/reference/subjects")) {
      data = [
        { id: "subject-eng", name: "English Language", code: "ENG", category: "Core" },
        { id: "subject-mat", name: "Mathematics", code: "MAT", category: "Core" },
        { id: "subject-phy", name: "Physics", code: "PHY", category: "Science" },
      ];
    } else if (path.endsWith("/reference/divisions")) {
      data = url.searchParams.has("parentId")
        ? [{ id: "lga-ng", name: "Ikeja", parentId: "state-ng" }]
        : [{ id: "state-ng", name: "Lagos", iso2: "NG" }];
    } else if (path.endsWith("/requirements")) {
      data = null;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data }),
    });
  });

  await page.route("**/test-photo-upload", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });
});

function adjacentField(page: Page, label: string) {
  return page
    .locator("label")
    .filter({ hasText: label })
    .first()
    .locator(
      "xpath=following-sibling::*[1][self::input or self::select or self::textarea] | following-sibling::*[1]//*[self::input or self::select or self::textarea]",
    )
    .first();
}

test("admissions form exposes four stages and isolates completed stages", async ({ page }) => {
  await page.goto("/apply", { waitUntil: "networkidle" });

  const progress = page.getByRole("navigation", { name: "Application progress" });
  await expect(progress).toContainText("Stage 1 of 4");
  await expect(progress.getByRole("button", { name: /2\. Details/ })).toBeDisabled();
  await expect(progress.getByRole("button", { name: /3\. Evidence/ })).toBeDisabled();
  await expect(progress.getByRole("button", { name: /4\. Review/ })).toBeDisabled();

  await page.getByRole("button", { name: "Continue to Details" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Select an admission cycle" })).toBeVisible();

  await adjacentField(page, "Admission cycle").selectOption("cycle-1");
  await adjacentField(page, "First name").fill("Ada");
  await adjacentField(page, "Last name").fill("Okafor");
  await adjacentField(page, "Date of birth").fill("2000-01-01");
  await adjacentField(page, "Gender").selectOption({ label: "Female" });
  await adjacentField(page, "Nationality").selectOption("country-ng");
  await adjacentField(page, "State / Province / Region").selectOption("state-ng");
  await adjacentField(page, "LGA of origin").selectOption("lga-ng");
  await adjacentField(page, "Mobile number").fill("08012345678");
  await adjacentField(page, "Email").fill("ada@example.com");

  await page.getByRole("button", { name: "Continue to Details" }).click();
  await expect(progress).toContainText("Stage 2 of 4");
  await expect(page.getByRole("heading", { name: "Programme choices" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Personal information" })).toHaveCount(0);

  await page.getByRole("button", { name: "Back" }).click();
  await expect(progress).toContainText("Stage 1 of 4");
  await expect(page.getByRole("heading", { name: "Personal information" })).toBeVisible();

  await page.getByRole("button", { name: "Continue to Details" }).click();
  await adjacentField(page, "First choice").selectOption("programme-1");
  await adjacentField(page, "JAMB registration number").fill("12345678901");
  await adjacentField(page, "Address").fill("1 University Road");
  await adjacentField(page, "City / town").fill("Lagos");
  await page.getByRole("button", { name: "Continue to Evidence" }).click();
  await expect(progress).toContainText("Stage 3 of 4");
  await expect(page.getByRole("heading", { name: "O'Level results" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Programme choices" })).toHaveCount(0);

  await page.locator("#passport-photo").setInputFiles({
    name: "passport.png",
    mimeType: "image/png",
    buffer: Buffer.from("test passport image"),
  });
  await expect(page.getByRole("alert").filter({ hasText: "Photograph verified and ready" })).toBeVisible();
  await page.getByRole("button", { name: "Continue to Review" }).click();
  await expect(progress).toContainText("Stage 4 of 4");
  await expect(page.getByRole("heading", { name: "Candidate agreement, privacy notice, and terms" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to evidence" })).toBeVisible();
});

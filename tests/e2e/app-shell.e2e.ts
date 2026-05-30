import { expect, test } from "@playwright/test";

test.describe("app shell", () => {
  test("serves the React app from the Bun dev server", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("Pyxis");
    await expect(page.getByRole("link", { name: "pyxis" })).toBeVisible();
    await expect(page.getByRole("navigation")).toBeVisible();
  });

  test("keeps stale trpc traffic visibly retired", async ({ request }) => {
    const response = await request.get("/trpc/player.state");

    expect(response.status()).toBe(410);
    await expect(response.text()).resolves.toMatch(/removed\. Use \/rpc/i);
  });
});

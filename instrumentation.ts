export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NODE_ENV === "development"
  ) {
    const { migrateNowAndOnChange } = await import("./src/db/dev-migrations");
    await migrateNowAndOnChange();
  }
}

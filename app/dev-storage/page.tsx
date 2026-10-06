import { notFound } from "next/navigation";
import { DevStorage } from "./seam";

export default function DevStoragePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevStorage />;
}

import { getLocalAppOrigin, getProductionAppOrigin } from "@zoeskoul/app-config";
import { redirect } from "next/navigation";

export default function LearningVisibilityCompatibilityPage() {
  const origin = process.env.NODE_ENV === "development"
    ? getLocalAppOrigin("admin")
    : getProductionAppOrigin("admin");
  redirect(new URL("/learning-visibility", origin).toString());
}
